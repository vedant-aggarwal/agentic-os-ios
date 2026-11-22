import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  Button, Card, Chip, haptic, Icon, lastDays, Page, Press, Section, Skeleton, t, today, useAspect, useEntry,
} from '@/aspects/kit';
import { useCollection } from '@/lib/mod';
import { C, F } from '@/theme';
import { Clean } from './Clean';
import { rememberKit, send, useCleanNow, useJournalDay, useOutbox, type Entry, type Sit } from './data';
import { Editor, type Seed } from './Editor';
import { Journal } from './Journal';
import { Meditate } from './Meditate';
import { Moment } from './Moment';
import { DayRow, Gl, plural, PrivacyCover } from './parts';
import { Slip } from './Slip';
import { SIT_LENGTHS } from './words';
import { Linked } from '@/aspects/_linked/Linked';

// The Soul page: one quiet screen. The day count first, with the rough moment always one tap away, then tonight's
// journal, then a sit. Outside the Clean screen the count is only ever "Day N".
export default function Soul() {
  const a = useAspect();
  const { color, notice } = a;
  const now = useCleanNow();
  const jday = useJournalDay();
  const journal = useCollection<Entry>('growth', 'journal');
  const sits = useCollection<Sit>('soul', 'sits');
  const waiting = useOutbox();
  const [screen, setScreen] = useState<null | 'clean' | 'journal' | 'meditate'>(null);
  const [moment, setMoment] = useState(false);
  const [slip, setSlip] = useState<{ open: boolean; from: { key: string; steps: string[] } | null }>({ open: false, from: null });
  const [editor, setEditor] = useState<{ open: boolean; entry: Entry | null; seed: Seed | null }>({ open: false, entry: null, seed: null });
  const [sitStart, setSitStart] = useState<{ mins: number; n: number } | null>(null);

  // soul/<part>: clean (also soul/blocker, the lock question's push: the plans for risky hours are there), journal,
  // write (a new entry), meditate, moment (the rough moment).
  useEntry((e) => {
    const p = e.parts[0];
    setScreen(p === 'clean' || p === 'blocker' ? 'clean' : p === 'journal' || p === 'write' ? 'journal' : p === 'meditate' ? 'meditate' : null);
    setMoment(p === 'moment');
    if (p === 'write') setEditor({ open: true, entry: null, seed: {} });
  });

  const d = now.data;
  useEffect(() => { rememberKit(d); }, [d]);
  const on = d && d.setup ? d : null;
  const base = useMemo(() => (d ? { reasons: d.reasons, actions: d.actions, plans: d.setup ? d.plans : [] } : null), [d]);

  const written = (journal.items ?? []).filter((e) => !e.deleted_at && e.date === today() && e.text?.trim());
  const weekMins = Math.round((sits.items ?? []).filter((x) => !x.deleted_at && lastDays(7).includes(x.date)).reduce((n, x) => n + x.secs, 0) / 60);
  const write = (seed: Seed) => setEditor({ open: true, entry: null, seed });
  const openEntry = (entry: Entry) => setEditor({ open: true, entry, seed: null });
  const pledge = async () => {
    if (!on) return;
    haptic.success();
    const r = await send({ id: `pledge:${on.today}`, method: 'POST', path: '/mod/soul/clean/pledge', body: { at: new Date().toISOString() } });
    if (r === 'queued') notice('Saved on this phone. It goes to the PC when it can.');
  };
  const refresh = () => { void now.refresh(); void jday.refresh(); void journal.refresh(); void sits.refresh(); };

  const sug = jday.data?.suggestions[0] ?? null;
  const prompt = sug ? null : jday.data?.prompts[0] ?? null;
  const streak = jday.data?.stats.streak.current ?? 0;

  return (
    <Page onRefresh={refresh} refreshing={false} contentStyle={{ paddingBottom: a.dock + 96 }}
      footer={(
        <>
          <View style={[s.pillWrap, { bottom: a.dock + 12 }]} pointerEvents="box-none">
            <Press label="Rough moment" onPress={() => setMoment(true)} feel="medium" style={[s.pill, { backgroundColor: color }]}>
              <Gl k="wind" size={18} color="#14161C" />
              <Text style={s.pillText}>Rough moment</Text>
            </Press>
          </View>
          <Clean open={screen === 'clean'} onClose={() => setScreen(null)} now={now} onMoment={() => setMoment(true)}
            onSlip={() => setSlip({ open: true, from: null })} />
          <Journal open={screen === 'journal'} onClose={() => setScreen(null)} day={jday} onWrite={write} onOpen={openEntry} />
          <Meditate open={screen === 'meditate'} onClose={() => setScreen(null)} start={sitStart} />
          <Editor open={editor.open} entry={editor.entry} seed={editor.seed} onClose={() => setEditor((x) => ({ ...x, open: false }))} />
          <Moment open={moment} base={base} onClose={() => setMoment(false)}
            onSlip={(key, steps) => { setMoment(false); setSlip({ open: true, from: { key, steps } }); }} />
          <Slip open={slip.open} state={on} from={slip.from} onClose={() => setSlip((x) => ({ ...x, open: false }))} />
          <PrivacyCover />
        </>
      )}>
      {/* the day count */}
      {!d && !now.error ? <Skeleton height={148} radius={24} /> : null}
      {!d && now.error ? (
        <Card>
          <Text style={t.strong}>Couldn&apos;t reach the PC</Text>
          <Text style={[t.small, s.gap4]}>{now.error} The rough moment still works from this phone.</Text>
          <Button label="Try again" kind="quiet" small onPress={now.refresh} wrap={[s.self, s.gap12]} />
        </Card>
      ) : null}
      {d && !d.setup ? (
        <Card onPress={() => setScreen('clean')} label="Start a day count">
          <Text style={t.heading}>Day count</Text>
          <Text style={[t.small, s.gap4]}>Start counting when you&apos;re ready. A slip never wipes the days you kept.</Text>
          <View style={[s.row, s.gap12]}>
            <Text style={[t.label, { color }]}>Start</Text>
            <Icon name="right" size={14} color={color} />
          </View>
        </Card>
      ) : null}
      {on ? (
        <Card>
          <Press label={`Day ${on.day}. Open`} onPress={() => setScreen('clean')} scale={0.98}>
            <View style={s.dayHead}>
              <View style={s.flex}>
                <Text style={[t.big, t.num, { color }]}>Day {on.day}</Text>
                <Text style={[t.small, t.num]}>{on.kept.kept} of {plural(on.kept.of, 'day')} kept · longest run {on.best}</Text>
              </View>
              <Icon name="right" size={16} color={C.faint} />
            </View>
            <View style={s.dots}><DayRow strip={on.strip.slice(-14)} color={color} /></View>
            {on.milestone.reached?.today ? <Text style={[t.label, { color }]}>{plural(on.milestone.reached.days, 'day')} today.</Text> : null}
          </Press>
          {!on.pledged ? (
            <Button label="Promise today" kind="soft" small onPress={pledge} wrap={[s.self, s.gap12]} />
          ) : (
            <Text style={[t.caption, s.gap4]}>Promised for today.</Text>
          )}
        </Card>
      ) : null}

      {/* tonight's journal */}
      <Section title="Tonight" action="Journal" onAction={() => setScreen('journal')}>
        {journal.items == null && !journal.error ? <Skeleton height={112} radius={24} /> : (
          <Card>
            {written.length ? (
              <Press label="Open today's entry" onPress={() => openEntry(written[0])}>
                <Text style={t.caption}>Written today · {plural(written.reduce((n, e) => n + (e.words ?? e.text.split(/\s+/).length), 0), 'word')}</Text>
                <Text numberOfLines={2} style={[t.body, s.gap4]}>{written[0].text}</Text>
              </Press>
            ) : sug || prompt ? (
              <Press label={sug ? sug.title : prompt!.text} onPress={() => write({ prompt: sug ? sug.prompt : prompt!.text })}>
                <Text style={t.caption}>{sug ? sug.title : 'A prompt'}</Text>
                <Text style={[t.strong, s.gap4]}>{sug ? sug.prompt : prompt!.text}</Text>
              </Press>
            ) : (
              <Text style={t.body}>Two lines about today.</Text>
            )}
            <View style={[s.row, s.gap12]}>
              <Button label={written.length ? 'Add more' : 'Write'} kind="soft" small onPress={() => (written.length ? openEntry(written[0]) : write({}))} icon={<Icon name="pencil" size={14} color={color} />} />
              <Button label="Speak" kind="quiet" small onPress={() => write({ speak: true })} icon={<Icon name="mic" size={14} />} />
              {streak ? <Text style={[t.caption, s.push]}>{plural(streak, 'day')} in a row</Text> : null}
            </View>
          </Card>
        )}
      </Section>

      {/* a sit */}
      <Section title="Sit" action="Meditate" onAction={() => setScreen('meditate')}>
        <View style={s.row}>
          {SIT_LENGTHS.map((m) => (
            <Chip key={m} label={`${m} min`} icon={<Gl k="circle" size={12} color={C.muted} />}
              onPress={() => { setSitStart((x) => ({ mins: m, n: (x?.n ?? 0) + 1 })); setScreen('meditate'); }} />
          ))}
        </View>
        {weekMins ? <Text style={t.caption}>{plural(weekMins, 'minute')} this week</Text> : null}
      </Section>

      <Linked />

      {waiting ? <Text style={[t.caption, s.centre]}>{plural(waiting, 'log')} waiting on this phone for the PC.</Text> : null}
    </Page>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  self: { alignSelf: 'flex-start' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  push: { marginLeft: 'auto' },
  gap4: { marginTop: 4 },
  gap12: { marginTop: 12 },
  centre: { textAlign: 'center' },
  dayHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dots: { marginTop: 16, marginBottom: 4 },
  pillWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 8, height: 48, paddingHorizontal: 20, borderRadius: 24,
    boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
  },
  pillText: { fontFamily: F.semibold, fontSize: 16, lineHeight: 24, color: '#14161C' },
});
