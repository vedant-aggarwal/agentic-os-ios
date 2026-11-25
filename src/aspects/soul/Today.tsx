import { StyleSheet, Text, View } from 'react-native';
import {
  Block, Button, clock, Group, haptic, Icon, Item, lastDays, Lead, Metric, Metrics, myDay, Press, SURF, t, tint, undoable, useAspect, weekLetter,
} from '@/aspects/kit';
import { invalidate, useCollection, type Draft } from '@/lib/mod';
import { C, F } from '@/theme';
import { Linked } from '@/aspects/_linked/Linked';
import {
  checkInId, errText, istMin, moodOn, send, useCleanNow, useEntries, useJournalDay, useMoods, type Entry, type Mood, type Sit,
} from './data';
import { useNav } from './nav';
import { Gl, plural } from './parts';
import { lastMins, lastPattern } from './Practice';
import { MOODS, moodWord } from './words';

/**
 * Soul today: how he is right now in one tap, and the one practice that fits the hour (a sit by day, tonight's entry
 * by night). Under it the day count, kept to "Day N", and the week. Nothing he wrote is readable here.
 */
export function TodayTab({ waiting }: { waiting: number }) {
  return (
    <>
      <Now />
      <Count />
      <Week />
      <Tonight />
      <Linked />
      {waiting ? <Text style={[t.footnote, s.centre]}>{`${plural(waiting, 'log')} waiting on this phone for the PC.`}</Text> : null}
    </>
  );
}

const hour = () => Math.floor(istMin() / 60);
const partOfDay = (h: number) => (h >= 4 && h < 12 ? 'This morning' : h < 17 ? 'This afternoon' : h < 21 ? 'This evening' : 'Tonight');
const written = (items: Entry[] | null, day: string) => (items ?? []).filter((e) => !e.deleted_at && e.date === day && (e.text?.trim() || e.photos?.length));
const wordsOf = (es: Entry[]) => es.reduce((n, e) => n + (e.words ?? (e.text?.trim() ? e.text.trim().split(/\s+/).length : 0)), 0);

// ── the lead: a mood in one tap, then the practice for now ──
function Now() {
  const nav = useNav();
  const sits = useCollection<Sit>('soul', 'sits');
  const journal = useEntries();
  const jday = useJournalDay();
  const day = myDay();
  const h = hour();
  const sat = Math.round((sits.items ?? []).filter((x) => !x.deleted_at && x.date === day).reduce((n, x) => n + x.secs, 0) / 60);
  const mine = written(journal.items, day);
  const night = h >= 19 || h < 4;
  const want: 'write' | 'sit' | 'done' = !mine.length && (night || sat > 0) ? 'write' : !sat ? 'sit' : !mine.length ? 'write' : 'done';
  const mins = lastMins();
  const pattern = lastPattern();
  const sug = jday.data?.suggestions[0] ?? null;
  const prompt = sug ? sug.prompt : jday.data?.prompts[0]?.text ?? null;
  return (
    <Lead>
      <CheckIn when={partOfDay(h)} />
      <View style={s.rule} />
      {want === 'sit' ? (
        <View style={s.gap12}>
          <View style={s.gap4}>
            <Text style={t.headline}>{`A ${mins} minute sit`}</Text>
            <Text style={t.footnote}>{pattern.line}</Text>
          </View>
          <View style={s.row}>
            <Button label={`Sit for ${mins} minutes`} kind="accent" onPress={() => nav.sit(mins)} wrap={s.flex} />
            <Button label="Other" kind="quiet" onPress={() => nav.openTab('practice')} />
          </View>
        </View>
      ) : want === 'write' ? (
        <View style={s.gap12}>
          <View style={s.gap4}>
            <Text style={t.headline}>{"Tonight's entry"}</Text>
            <Text numberOfLines={3} style={t.footnote}>{prompt ?? 'Two lines about today are enough.'}</Text>
          </View>
          <View style={s.row}>
            <Button label="Write" kind="accent" onPress={() => nav.write(prompt ? { prompt } : {})} wrap={s.flex} icon={<Icon name="pencil" size={16} color="#14161C" />} />
            <Button label="Speak" kind="quiet" onPress={() => nav.write({ speak: true, ...(prompt ? { prompt } : {}) })} icon={<Icon name="mic" size={16} />} />
          </View>
        </View>
      ) : (
        <View style={s.gap12}>
          <View style={s.gap4}>
            <Text style={t.headline}>Done for today</Text>
            <Text style={[t.footnote, t.num]}>{`Sat ${plural(sat, 'minute')} and wrote tonight's entry.`}</Text>
          </View>
          <Button label="Sit again" kind="quiet" onPress={() => nav.sit(mins)} />
        </View>
      )}
    </Lead>
  );
}

/** Five words, one tap: Soul's own check in for today, which the rest of the app reads. A second tap changes it. */
function CheckIn({ when }: { when: string }) {
  const a = useAspect();
  const moods = useMoods();
  const day = myDay();
  const cur = moodOn(moods.items, day);
  const set = async (v: number) => {
    const id = checkInId(day);
    const prev = (moods.items ?? []).find((m) => m.id === id) ?? null;
    if (prev?.v === v && cur?.id === id) return;
    try {
      const doc: Draft<Mood> & Record<string, unknown> = { id, date: day, at: new Date().toISOString(), v, word: moodWord(v), pleasant: (v - 3) / 2, tags: [], note: '', line: '', source: 'soul' };
      await moods.put(doc);
      invalidate('/mod/soul/moods');
      undoable(`Mood logged: ${(moodWord(v) ?? '').toLowerCase()}`, async () => {
        if (prev) await moods.put(prev); else await moods.remove(id);
        invalidate('/mod/soul/moods');
      });
    } catch (e) { a.notice(errText(e)); }
  };
  return (
    <View style={s.gap12}>
      <View style={s.gap4}>
        <Text style={[t.footnote, { color: a.color }]}>{when}</Text>
        <Text style={t.title3}>How are you right now?</Text>
      </View>
      <View style={s.moods} accessibilityRole="radiogroup" accessibilityLabel="Mood right now">
        {MOODS.map((m) => {
          const on = cur?.v === m.p;
          return (
            <Press key={m.p} label={`${m.label}${on ? ', logged' : ''}`} role="radio" state={{ selected: on }} feel="tick" scale={0.94}
              onPress={() => { void set(m.p); }} wrap={s.flex} style={[s.mood, on && { backgroundColor: tint(a.color, 0.2), borderColor: tint(a.color, 0.6) }]}>
              <MoodDot v={m.p} on={on} />
              <Text numberOfLines={1} style={[s.moodText, on && [s.moodOn, { color: a.color }]]}>{m.label}</Text>
            </Press>
          );
        })}
      </View>
      <Text style={t.footnote}>{cur ? `${moodWord(cur.v)} at ${clock(cur.at)}. Tap another word to change it.` : 'One tap logs it for today.'}</Text>
    </View>
  );
}

/** A small mark that fills with the mood: an empty ring for rough, a full disc for great. */
function MoodDot({ v, on }: { v: number; on: boolean }) {
  const a = useAspect();
  const fill = on ? a.color : C.muted;
  const size = 14;
  return (
    <View style={[s.dot, { width: size, height: size, borderRadius: size / 2, borderColor: fill }]}>
      <View style={{ width: ((v - 1) / 4) * (size - 3), height: ((v - 1) / 4) * (size - 3), borderRadius: size, backgroundColor: fill }} />
    </View>
  );
}

// ── the day count: only ever "Day N" outside the Clean tab ──
function Count() {
  const a = useAspect();
  const nav = useNav();
  const now = useCleanNow();
  const d = now.data;
  const pledge = async () => {
    if (!d || !d.setup) return;
    haptic.success();
    const r = await send({ id: `pledge:${d.today}`, method: 'POST', path: '/mod/soul/clean/pledge', body: { at: new Date().toISOString() } });
    if (r === 'queued') a.notice('Saved on this phone. It goes to the PC when it can.');
  };
  if (!d && !now.error) return null;
  return (
    <Group>
      {!d ? (
        <Item title="Day count" sub="Couldn't reach the PC. The rough moment still works from this phone." onPress={() => { void now.refresh(); }} lines={3} />
      ) : !d.setup ? (
        <Item title="Day count" sub="Start counting when you are ready. A slip never wipes the days you kept." onPress={() => nav.openTab('clean')} chevron lines={3} />
      ) : (
        <Item title={`Day ${d.day}`} titleStyle={[s.day, { color: a.color }]} label={`Day ${d.day}. Open Clean`}
          sub={d.pledged ? 'Promised for today' : 'A promise for today, one tap'} onPress={() => nav.openTab('clean')} chevron={d.pledged}
          action={!d.pledged ? <Button label="Promise" kind="soft" small onPress={() => { void pledge(); }} /> : undefined} />
      )}
    </Group>
  );
}

// ── the week: moods, minutes sat, days written ──
function Week() {
  const a = useAspect();
  const moods = useMoods();
  const sits = useCollection<Sit>('soul', 'sits');
  const journal = useEntries();
  const week = lastDays(7);
  const marks = week.map((d) => moodOn(moods.items, d));
  const satMin = Math.round((sits.items ?? []).filter((x) => !x.deleted_at && week.includes(x.date)).reduce((n, x) => n + x.secs, 0) / 60);
  const wrote = new Set((journal.items ?? []).filter((e) => !e.deleted_at && week.includes(e.date) && e.text?.trim()).map((e) => e.date)).size;
  const logged = marks.filter(Boolean).length;
  const said = week.map((d, i) => (marks[i] ? `${weekLetter(d)} ${moodWord(marks[i]!.v)}` : null)).filter(Boolean).join(', ');
  return (
    <Block title="This week">
      <Group pad>
        <View style={s.moodWeek} accessible accessibilityLabel={logged ? `Moods this week: ${said}` : 'No moods logged this week'}>
          {week.map((d, i) => {
            const m = marks[i];
            const isToday = i === week.length - 1;
            return (
              <View key={d} style={s.moodCol}>
                <View style={s.track}>
                  {m ? <View style={[s.fill, { height: `${(m.v / 5) * 100}%`, backgroundColor: isToday ? a.color : tint(a.color, 0.55) }]} /> : null}
                </View>
                <Text style={[t.micro, isToday && { color: C.text }]}>{weekLetter(d)}</Text>
              </View>
            );
          })}
        </View>
        <Text style={t.micro}>{logged ? 'Mood each day: the taller, the better the day felt.' : 'Moods you log fill in here, one bar a day.'}</Text>
        <Metrics>
          <Metric size="s" label="Sat" value={String(satMin)} unit="min" />
          <Metric size="s" label="Wrote" value={String(wrote)} unit={wrote === 1 ? 'day' : 'days'} />
          <Metric size="s" label="Moods" value={String(logged)} unit="of 7 days" />
        </Metrics>
      </Group>
    </Block>
  );
}

// ── tonight's entry, when the lead is not already asking for it ──
function Tonight() {
  const nav = useNav();
  const journal = useEntries();
  const sits = useCollection<Sit>('soul', 'sits');
  const day = myDay();
  const mine = written(journal.items, day);
  const h = hour();
  const sat = (sits.items ?? []).some((x) => !x.deleted_at && x.date === day);
  const inLead = !mine.length && (h >= 19 || h < 4 || sat);
  if (inLead || journal.items == null) return null;
  return (
    <Group>
      {mine.length ? (
        <Item title="Written today" sub={plural(wordsOf(mine), 'word')} label="Open today's entry" onPress={() => nav.openEntry(mine[0])} chevron
          left={<View style={s.glyph}><Gl k="book" size={16} color={C.textSoft} /></View>} />
      ) : (
        <Item title="Tonight's entry" sub="Not written yet. Two lines are enough." onPress={() => nav.write({})}
          left={<View style={s.glyph}><Gl k="book" size={16} color={C.textSoft} /></View>}
          action={<Button label="Speak" kind="quiet" small onPress={() => nav.write({ speak: true })} />} />
      )}
    </Group>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  gap4: { gap: 4 },
  gap12: { gap: 12 },
  centre: { textAlign: 'center' },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: SURF.hair },
  moods: { flexDirection: 'row', gap: 6 },
  mood: {
    height: 64, borderRadius: 18, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: SURF.raised, borderWidth: StyleSheet.hairlineWidth, borderColor: SURF.edge,
  },
  moodText: { fontFamily: F.medium, fontSize: 13, lineHeight: 16, color: C.textSoft },
  moodOn: { fontFamily: F.semibold },
  dot: { borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  day: { fontFamily: F.semibold, fontSize: 20, lineHeight: 24 },
  moodWeek: { flexDirection: 'row', gap: 8, height: 84 },
  moodCol: { flex: 1, alignItems: 'center', gap: 6 },
  track: { flex: 1, width: '100%', maxWidth: 28, borderRadius: 8, backgroundColor: SURF.track, justifyContent: 'flex-end', overflow: 'hidden' },
  fill: { width: '100%', borderRadius: 8 },
  glyph: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: SURF.raised },
});
