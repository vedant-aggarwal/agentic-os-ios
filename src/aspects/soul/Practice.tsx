import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  ago, Bars, Block, Button, Failed, Group, haptic, Item, lastDays, Lead, Metric, Metrics, Screen, Segmented, Skeleton, t, timer, today,
  useAspect, weekLetter,
} from '@/aspects/kit';
import { collection, newId, useCollection } from '@/lib/mod';
import { Breath } from './Breath';
import { readLocal, send, useForeground, useKeepAwake, writeLocal, type Sit } from './data';
import { useNav } from './nav';
import { Gl, plural } from './parts';
import { PATTERNS, patternOf, SIT_LENGTHS, type Pattern } from './words';

/** The length he sat last time, so the next sit starts there. */
export const lastMins = () => {
  const m = readLocal<number>('sitMins');
  return m && SIT_LENGTHS.includes(m) ? m : 5;
};
export const lastPattern = () => patternOf(readLocal<string>('pattern'));

/**
 * Practice: the breath and the length on top with one button to sit, then the record. The pacer here is still; it
 * only moves inside a sit.
 */
export function PracticeTab() {
  const a = useAspect();
  const nav = useNav();
  const sits = useCollection<Sit>('soul', 'sits');
  const [pattern, setPattern] = useState<Pattern>(lastPattern);
  const [mins, setMins] = useState(lastMins);
  const choose = (k: Pattern['key']) => { const p = patternOf(k); setPattern(p); writeLocal('pattern', p.key); };
  const pick = (m: number) => { setMins(m); writeLocal('sitMins', m); };
  return (
    <>
      <Lead>
        <View style={s.pacer}>
          <Breath pattern={pattern} running={false} color={a.color} size={176} compact haptics={false} />
        </View>
        <View style={s.gap8}>
          <Segmented options={PATTERNS.map((p) => ({ key: p.key, label: p.label }))} value={pattern.key} onChange={choose} />
          <Text style={[t.footnote, s.centre]}>{pattern.line}</Text>
        </View>
        <Segmented options={SIT_LENGTHS.map((m) => ({ key: String(m), label: `${m} min` }))} value={String(mins)} onChange={(k) => pick(Number(k))} />
        <Button label={`Sit for ${mins} minutes`} kind="accent" onPress={() => nav.sit(mins)} icon={<Gl k="circle" size={16} color="#14161C" />} />
      </Lead>
      <Record sits={sits.items} error={sits.error} onRetry={() => { void sits.refresh(); }} />
    </>
  );
}

function Record({ sits, error, onRetry }: { sits: Sit[] | null; error: string | null; onRetry: () => void }) {
  if (sits == null) {
    return (
      <Block title="Your record">
        {error ? <Failed message={error} onRetry={onRetry} /> : <Skeleton height={168} radius={22} />}
      </Block>
    );
  }
  const list = sits.filter((x) => !x.deleted_at).sort((x, y) => y.at.localeCompare(x.at));
  const week = lastDays(7);
  const perDay = week.map((d) => Math.round(list.filter((x) => x.date === d).reduce((n, x) => n + x.secs, 0) / 60));
  const weekMins = perDay.reduce((n, v) => n + v, 0);
  const total = Math.round(list.reduce((n, x) => n + x.secs, 0) / 60);
  if (!list.length) {
    return (
      <Block title="Your record">
        <Group pad>
          <Text style={t.callout}>No sits yet</Text>
          <Text style={t.footnote}>Each sit logs itself when it ends. Under a minute is not logged.</Text>
        </Group>
      </Block>
    );
  }
  return (
    <>
      <Block title="Your record">
        <Group pad>
          <Metrics>
            <Metric size="m" label="This week" value={String(weekMins)} unit="min" />
            <Metric size="m" label="Sits" value={String(list.length)} />
            <Metric size="m" label="In all" value={String(total)} unit="min" />
          </Metrics>
          <Bars values={perDay} labels={week.map(weekLetter)} on={6} height={64} />
          <Text style={t.micro}>Minutes sat each day, the last seven days.</Text>
        </Group>
      </Block>
      <Block title="Recent sits">
        <Group>
          {list.slice(0, 5).map((x) => (
            <Item key={x.id} title={plural(Math.max(1, Math.round(x.secs / 60)), 'minute')} sub={`${patternOf(x.pattern).label}, ${ago(x.at).toLowerCase()}`} />
          ))}
        </Group>
      </Block>
    </>
  );
}

/** The sit itself: the pacer and the time left. It logs itself at the end; ended early after a minute, it logs what was sat. */
export function SitRoom({ open, mins, onClose }: { open: boolean; mins: number; onClose: () => void }) {
  const { color, open: pageOpen, notice } = useAspect();
  const fg = useForeground();
  const [pattern, setPattern] = useState<Pattern>(lastPattern);
  const [paused, setPaused] = useState(false);
  const [ended, setEnded] = useState<number | null>(null); // seconds logged when he ended it early
  const [ms, setMs] = useState(0); // time sat; it stops while paused or while the app is away
  const [startedAt, setStartedAt] = useState('');
  const [was, setWas] = useState(false);
  if (open !== was) {
    setWas(open);
    if (open) { setPattern(lastPattern()); setPaused(false); setEnded(null); setMs(0); setStartedAt(new Date().toISOString()); }
  }

  const goal = mins * 60;
  const finished = ms >= goal * 1000;
  const done = ended ?? (finished ? goal : null);
  const running = open && pageOpen && fg && !paused && done == null;
  useKeepAwake(open && pageOpen && !paused && done == null, 'soul-sit'); // auto lock would freeze the sit
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
              <Text style={[t.large, t.num]}>{timer(left)}</Text>
              <Text style={t.subhead}>{paused ? 'Paused' : pattern.label}</Text>
            </View>
            <View style={s.two}>
              <Button label={paused ? 'Resume' : 'Pause'} kind="quiet" onPress={() => setPaused(!paused)} wrap={s.flex} />
              <Button label="End" kind="quiet" onPress={end} wrap={s.flex} />
            </View>
            {sat < 60 ? <Text style={[t.footnote, s.centre]}>Under a minute isn&apos;t logged.</Text> : null}
          </>
        ) : (
          <>
            <Text style={[t.title3, s.centre]}>{plural(Math.max(1, Math.round(done / 60)), 'minute')}.</Text>
            <Text style={[t.subhead, s.centre]}>Logged. Take a moment before you get up.</Text>
            <Button label="Done" onPress={onClose} wrap={s.self} />
          </>
        )}
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  pacer: { alignItems: 'center', paddingVertical: 8 },
  gap8: { gap: 8 },
  centre: { textAlign: 'center' },
  room: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 32 },
  time: { alignItems: 'center', gap: 4 },
  two: { flexDirection: 'row', gap: 12, alignSelf: 'stretch' },
  flex: { flex: 1 },
  self: { alignSelf: 'center' },
});
