import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  ago, Bars, Button, Card, Chip, Failed, haptic, lastDays, Row, Screen, Section, Segmented, Skeleton, t, timer, today, useAspect, weekLetter,
} from '@/aspects/kit';
import { collection, newId, useCollection } from '@/lib/mod';
import { Breath } from './Breath';
import { readLocal, send, useForeground, useKeepAwake, writeLocal, type Sit } from './data';
import { Fig, Gl, plural } from './parts';
import { PATTERNS, patternOf, SIT_LENGTHS, type Pattern } from './words';

/** Meditate: pick a breath and a length, sit, and it logs itself. Below, the record. */
export function Meditate({ open, onClose, start }: { open: boolean; onClose: () => void; start: { mins: number; n: number } | null }) {
  const { color } = useAspect();
  const sits = useCollection<Sit>('soul', 'sits');
  const [pattern, setPattern] = useState<Pattern>(() => patternOf(readLocal<string>('pattern')));
  const [mins, setMins] = useState(5);
  const [sitting, setSitting] = useState(false);

  // a length tapped on the Soul home starts the sit straight away
  const seen = useRef(0);
  useEffect(() => {
    if (open && start && start.n !== seen.current) { seen.current = start.n; setMins(start.mins); setSitting(true); }
  }, [open, start]);

  const choose = (k: Pattern['key']) => { const p = patternOf(k); setPattern(p); writeLocal('pattern', p.key); };
  const list = (sits.items ?? []).filter((x) => !x.deleted_at).sort((a, b) => b.at.localeCompare(a.at));
  const week = lastDays(7);
  const perDay = week.map((d) => Math.round(list.filter((x) => x.date === d).reduce((a, x) => a + x.secs, 0) / 60));
  const weekMins = perDay.reduce((a, b) => a + b, 0);
  const total = Math.round(list.reduce((a, x) => a + x.secs, 0) / 60);

  return (
    <>
      <Screen open={open} onClose={onClose} title="Meditate">
        <Section title="Breath">
          <Segmented options={PATTERNS.map((p) => ({ key: p.key, label: p.label }))} value={pattern.key} onChange={choose} />
          <Text style={t.small}>{pattern.line}</Text>
        </Section>
        <View style={s.preview}>
          <Breath pattern={pattern} running={false} color={color} size={160} compact haptics={false} />
        </View>
        <Section title="Length">
          <View style={s.wrap}>
            {SIT_LENGTHS.map((m) => <Chip key={m} label={`${m} min`} selected={mins === m} onPress={() => setMins(m)} />)}
          </View>
        </Section>
        <Button label={`Sit for ${mins} minutes`} kind="accent" onPress={() => setSitting(true)} icon={<Gl k="circle" size={16} color="#14161C" />} />

        <Section title="Your record">
          {sits.items == null && sits.error ? <Failed message={sits.error} onRetry={sits.refresh} /> : null}
          {sits.items == null && !sits.error ? <Skeleton height={140} radius={24} /> : null}
          {sits.items ? (
            <Card>
              <View style={s.figs}>
                <Fig value={`${weekMins}`} label="min this week" color={color} />
                <Fig value={`${list.length}`} label={list.length === 1 ? 'sit in all' : 'sits in all'} />
                <Fig value={`${total}`} label="min in all" />
              </View>
              <Bars values={perDay} labels={week.map(weekLetter)} height={56} />
            </Card>
          ) : null}
          {sits.items && list.length === 0 ? <Text style={t.small}>Each sit logs itself when it ends.</Text> : null}
          {list.slice(0, 5).map((x) => (
            <Row key={x.id} title={`${plural(Math.max(1, Math.round(x.secs / 60)), 'minute')} · ${patternOf(x.pattern).label}`} sub={ago(x.at)} />
          ))}
        </Section>
      </Screen>
      <SitRoom open={sitting} mins={mins} pattern={pattern} onClose={() => setSitting(false)} />
    </>
  );
}

/** The sit itself: the pacer and the time left. It logs itself at the end; ended early after a minute, it logs what was sat. */
function SitRoom({ open, mins, pattern, onClose }: { open: boolean; mins: number; pattern: Pattern; onClose: () => void }) {
  const { color, open: pageOpen, notice } = useAspect();
  const fg = useForeground();
  const [paused, setPaused] = useState(false);
  const [ended, setEnded] = useState<number | null>(null); // seconds logged when he ended it early
  const [ms, setMs] = useState(0); // time sat; it stops while paused or while the app is away
  const [startedAt, setStartedAt] = useState('');
  const [was, setWas] = useState(false);
  if (open !== was) {
    setWas(open);
    if (open) { setPaused(false); setEnded(null); setMs(0); setStartedAt(new Date().toISOString()); }
  }

  const goal = mins * 60;
  const finished = ms >= goal * 1000;
  const done = ended ?? (finished ? goal : null);
  const running = open && pageOpen && fg && !paused && done == null;
  useKeepAwake(open && pageOpen && !paused && done == null, 'soul-sit'); // auto-lock would freeze the sit
  useEffect(() => {
    if (!running) return;
    let last = Date.now();
    // the step is read before the updater runs: React may call the updater later, after `last` has moved on
    const id = setInterval(() => { const n = Date.now(), step = n - last; last = n; setMs((x) => x + step); }, 250);
    return () => clearInterval(id);
  }, [running]);
  const sat = Math.floor(ms / 1000);
  const left = Math.max(0, goal - sat);

  const log = async (secs: number) => {
    const id = newId('sit');
    const body = { id, date: today(), at: startedAt, secs, mins: Math.max(1, Math.round(secs / 60)), pattern: pattern.key, updated_at: new Date().toISOString() };
    const r = await send({ id: `sit:${id}`, method: 'PUT', path: `/mod/soul/sits/${id}`, body });
    if (r === 'queued') notice('Saved on this phone. It goes to the PC when it can.');
    collection('soul', 'sits').refresh().catch(() => {});
  };
  // the full length logs itself, once
  const logged = useRef('');
  useEffect(() => {
    if (open && finished && ended == null && logged.current !== startedAt) { logged.current = startedAt; haptic.success(); void log(goal); }
  }, [open, finished, ended, startedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const end = () => {
    if (done != null) return onClose();
    if (sat >= 60) { haptic.medium(); logged.current = startedAt; setEnded(sat); void log(sat); return; }
    onClose();
  };

  return (
    <Screen open={open} onClose={end} immersive scroll={false} title="">
      <View style={s.room}>
        {done == null ? (
          <>
            <Breath pattern={pattern} running={running} color={color} size={260} />
            <View style={s.time}>
              <Text style={[t.title, t.num]}>{timer(left)}</Text>
              <Text style={t.small}>{paused ? 'Paused' : pattern.label}</Text>
            </View>
            <View style={s.two}>
              <Button label={paused ? 'Resume' : 'Pause'} kind="quiet" onPress={() => setPaused(!paused)} wrap={s.flex} />
              <Button label="End" kind="quiet" onPress={end} wrap={s.flex} />
            </View>
            {sat < 60 ? <Text style={[t.caption, s.centre]}>Under a minute isn&apos;t logged.</Text> : null}
          </>
        ) : (
          <>
            <Text style={[t.title2, s.centre]}>{plural(Math.max(1, Math.round(done / 60)), 'minute')}.</Text>
            <Text style={[t.small, s.centre]}>Logged. Take a moment before you get up.</Text>
            <Button label="Done" onPress={onClose} wrap={s.self} />
          </>
        )}
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  preview: { alignItems: 'center' },
  figs: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  room: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 32 },
  time: { alignItems: 'center', gap: 4 },
  two: { flexDirection: 'row', gap: 12, alignSelf: 'stretch' },
  flex: { flex: 1 },
  centre: { textAlign: 'center' },
  self: { alignSelf: 'center' },
});
