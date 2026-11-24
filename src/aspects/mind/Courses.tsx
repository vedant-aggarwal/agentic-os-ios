import * as Linking from 'expo-linking';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  Bar, Block, Button, CheckRing, Chip, Failed, Field, Group, Icon, IconButton, Item, Lead, Sheet, Skeleton, Tag,
  haptic, shortDay, t, undoable, useAspect,
} from '@/aspects/kit';
import { call, invalidate, useGet } from '@/lib/mod';
import { C } from '@/theme';
import { useNav } from './nav';
import type { CourseView, Lesson, Shelf, TakeSpec } from './types';
import { Sym, durWords, minutes, useLast } from './ui';

export const COURSE = '/mod/mind/course';
const REASONS = ['I need this one now', 'Lost interest in the current one', 'Got what I needed from it', 'Too hard for now'];
export const sayLesson = (l: { id: string; title: string }): TakeSpec =>
  ({ kind: 'learned', topic: `Explain the lesson “${l.title}” to a friend who hasn't seen it.`, label: 'Say what you learned', source: { kind: 'lesson', id: l.id, title: l.title } });

/** Open a lesson's link in the browser or its app. */
export function useOpenLink() {
  const a = useAspect();
  return (url: string | null) => { if (url) Linking.openURL(url).catch(() => a.notice("That link didn't open.")); };
}

/**
 * Learn: one active course at a time. The lead is the next lesson and its progress; what the lesson asks of him sits
 * under it; lessons done today can be undone or said back; the shelf holds the parked courses and libraries.
 */
export function LearnTab({ active }: { active: boolean }) {
  const a = useAspect();
  const nav = useNav();
  const [seen, setSeen] = useState(active);
  if (active && !seen) setSeen(true);
  const g = useGet<CourseView>(a.open && seen ? COURSE : null);
  const v = g.data;
  const open1 = useOpenLink();
  const [switchTo, setSwitchTo] = useState<Shelf | null>(null);
  const [doneFor, setDoneFor] = useState<Lesson | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const act = v?.active ?? null;

  const undo = async (l: Lesson) => {
    setBusy(`u${l.id}`);
    try { await call(`/mod/mind/lesson/${l.id}/undo`); invalidate('/mod/mind/'); a.notice('Marked as not done'); }
    catch (e) { a.notice((e as Error).message); } finally { setBusy(null); }
  };

  const sheets = (
    <>
      <SwitchSheet to={switchTo} current={act?.title ?? null} onClose={() => setSwitchTo(null)} />
      <DoneSheet lesson={doneFor} onClose={() => setDoneFor(null)} onSay={(spec) => { setDoneFor(null); nav.take(spec); }} />
      <AddCourseSheet open={adding} onClose={() => setAdding(false)} />
    </>
  );

  if (!v) return g.error ? <Failed message={g.error} onRetry={g.refresh} /> : <LearnSkeleton />;
  if (!v.total) {
    return (
      <>
        <Group pad>
          <Sym name="course" size={28} color={C.muted} />
          <Text style={t.title3}>No courses yet</Text>
          <Text style={t.subhead}>Add a course with its lesson list. One is active at a time; the rest wait on a shelf with their progress kept.</Text>
          <Button label="Add a course" kind="accent" onPress={() => setAdding(true)} />
        </Group>
        {sheets}
      </>
    );
  }

  const doneToday = act ? act.list.filter((l) => act.today.includes(l.id)) : [];
  const coming = act ? act.list.filter((l) => l.status === 'todo' && l.id !== act.next?.id).slice(0, 4) : [];
  const next = act?.next ?? null;
  const parts = next ? ([
    { k: 'Why it matters', v: next.why }, { k: 'Watch for', v: next.watch }, { k: 'Then make', v: next.practice }, { k: 'Done when', v: next.done_when },
  ].filter((x) => x.v) as { k: string; v: string }[]) : [];
  const quiet = doneToday.length > 0;

  return (
    <>
      {act ? (
        <Lead>
          <View style={s.gap4}>
            <Text style={[t.footnote, { color: a.color }]}>Your course</Text>
            <Text style={t.title3}>{act.title}</Text>
          </View>
          <View style={s.gap8}>
            <Bar progress={act.lessons ? act.done / act.lessons : 0} height={6} color={a.color} />
            <View style={s.between}>
              <Text style={[t.subhead, t.num]}>{`${act.done} of ${act.lessons} lessons`}</Text>
              <Text style={[t.footnote, t.num]}>{act.left ? `${act.left} left${act.minutes_known && act.minutes_left ? `, about ${minutes(act.minutes_left)}` : ''}` : 'All done'}</Text>
            </View>
            {act.finish ? <Text style={[t.footnote, t.num]}>{`At your pace, done around ${shortDay(act.finish)}.`}</Text> : act.why ? <Text style={t.footnote}>{act.why}</Text> : null}
          </View>
          {next ? (
            <View style={s.next}>
              <Text style={[t.footnote, t.num]}>{`${quiet ? 'Next' : 'Today'}, lesson ${next.n + 1}${next.duration ? `, ${durWords(next.duration)}` : ''}`}</Text>
              <Text style={t.headline}>{next.title}</Text>
            </View>
          ) : <Text style={t.subhead}>Every lesson is done. Pick the next course from the shelf below.</Text>}
          {next ? (
            <View style={s.buttons}>
              {next.url && !quiet ? (
                <>
                  <Button label="Open lesson" kind="accent" onPress={() => open1(next.url)} icon={<Sym name="open" size={16} color="#14161C" />} wrap={s.flex} />
                  <Button label="Mark done" kind="quiet" onPress={() => setDoneFor(next)} />
                </>
              ) : (
                <>
                  <Button label="Mark done" kind={quiet ? 'soft' : 'accent'} onPress={() => setDoneFor(next)} icon={<Icon name="check" size={18} color={quiet ? a.color : '#14161C'} />} wrap={s.flex} />
                  {next.url ? <Button label="Open lesson" kind="quiet" onPress={() => open1(next.url)} /> : null}
                </>
              )}
            </View>
          ) : null}
        </Lead>
      ) : (
        <Group pad>
          <Text style={t.callout}>No course is active</Text>
          <Text style={t.footnote}>Pick one from the shelf below. The others keep their progress.</Text>
        </Group>
      )}

      {doneToday.length ? (
        <Block title="Done today" sub="The best test of a lesson is saying it back.">
          <Group inset={52}>
            {doneToday.map((l) => (
              <Item key={l.id} title={l.title} sub={l.made ? `Made: ${l.made}` : `Lesson ${l.n + 1}`} left={<CheckRing done size={24} />}
                action={<Button label="Undo" kind="quiet" small onPress={() => { void undo(l); }} busy={busy === `u${l.id}`} />} />
            ))}
          </Group>
          <Button label="Say it in a minute" kind="soft" icon={<Icon name="mic" size={18} color={a.color} />} onPress={() => nav.take(sayLesson(doneToday[doneToday.length - 1]))} />
        </Block>
      ) : null}

      {parts.length ? (
        <Block title="About this lesson">
          <Group pad>
            {parts.map((p) => (
              <View key={p.k} style={s.gap4}>
                <Text style={t.footnote}>{p.k}</Text>
                <Text style={t.callout}>{p.v}</Text>
              </View>
            ))}
          </Group>
        </Block>
      ) : null}

      {coming.length ? (
        <Block title="Coming up">
          <Group>{coming.map((l) => <Item key={l.id} title={l.title} sub={`Lesson ${l.n + 1}${l.duration ? `, ${durWords(l.duration)}` : ''}`} />)}</Group>
        </Block>
      ) : null}

      {v.parked.length ? (
        <Block title="Parked" sub="Each keeps its progress. Tap one to make it your course.">
          <Group>
            {v.parked.map((c) => (
              <Item key={c.id} title={c.title} chevron onPress={() => setSwitchTo(c)} label={`${c.title}, parked. Start this one instead`}
                sub={`${c.done} of ${c.lessons} done${c.park_reason ? `. ${c.park_reason}` : ''}`} />
            ))}
          </Group>
        </Block>
      ) : null}

      {v.libraries.length ? (
        <Block title="Libraries" sub="Collections to dip into, not courses to finish.">
          <Group>
            {v.libraries.map((c) => <Item key={c.id} title={c.title} sub={`${c.lessons === 1 ? 'One lesson' : `${c.lessons} lessons`}${c.done ? `, ${c.done} watched` : ''}`} chevron onPress={() => setSwitchTo(c)} />)}
          </Group>
        </Block>
      ) : null}

      {v.done.length ? (
        <Block title="Finished">
          <Group inset={52}>
            {v.done.map((c) => <Item key={c.id} title={c.title} sub={c.lessons === 1 ? 'One lesson' : `${c.lessons} lessons`} left={<CheckRing done size={24} />} right={<Tag label="Done" tone="aspect" />} />)}
          </Group>
        </Block>
      ) : null}

      <Button label="Add a course" kind="quiet" onPress={() => setAdding(true)} icon={<Icon name="plus" size={18} />} />
      {sheets}
    </>
  );
}

/** Mark a lesson done, with what he made from it. Then offer to say it back. */
function DoneSheet({ lesson, onClose, onSay }: { lesson: Lesson | null; onClose: () => void; onSay: (spec: TakeSpec) => void }) {
  const a = useAspect();
  const l = useLast(lesson);
  const [made, setMade] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [prev, setPrev] = useState(lesson);
  if (prev !== lesson) { setPrev(lesson); if (lesson) { setMade(''); setSaved(false); } }
  const save = async () => {
    if (!l) return;
    setSaving(true);
    try {
      await call(`/mod/mind/lesson/${l.id}/done`, { made: made.trim() || null });
      invalidate('/mod/mind/');
      haptic.success();
      setSaved(true);
      undoable(`${l.title} done`, async () => {
        try { await call(`/mod/mind/lesson/${l.id}/undo`); invalidate('/mod/mind/'); } catch (e) { a.notice((e as Error).message); }
      });
    } catch (e) { a.notice((e as Error).message); } finally { setSaving(false); }
  };
  return (
    <Sheet open={!!lesson} onClose={onClose} title={saved ? 'Lesson done' : l?.title ?? ''}>
      {!l ? null : saved ? (
        <>
          <Text style={t.subhead}>The best test of a lesson is saying it back. A minute, in your own words.</Text>
          <Button label="Say it in a minute" kind="accent" icon={<Icon name="mic" size={18} color="#14161C" />} onPress={() => onSay(sayLesson(l))} />
          <Button label="Not now" kind="quiet" onPress={onClose} />
        </>
      ) : (
        <>
          {l.done_when ? <Text style={t.subhead}>{`Done when: ${l.done_when}`}</Text> : null}
          <Field label="What did you make? Optional" value={made} onChangeText={setMade} placeholder="A line, or leave it empty" maxLength={500} />
          <Button label="Mark done" kind="accent" onPress={() => { void save(); }} busy={saving} />
        </>
      )}
    </Sheet>
  );
}

function SwitchSheet({ to, current, onClose }: { to: Shelf | null; current: string | null; onClose: () => void }) {
  const a = useAspect();
  const c = useLast(to);
  const [reason, setReason] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [prev, setPrev] = useState(to);
  if (prev !== to) { setPrev(to); if (to) setReason(null); }
  const go = async () => {
    if (!c) return;
    setSaving(true);
    try { await call('/mod/mind/course/switch', { to: c.id, reason }); invalidate('/mod/mind/'); haptic.medium(); a.notice(`${c.title} is your course now`); onClose(); }
    catch (e) { a.notice((e as Error).message); } finally { setSaving(false); }
  };
  return (
    <Sheet open={!!to} onClose={onClose} title={c ? `Start ${c.title}?` : ''}>
      {c ? (
        <>
          <Text style={t.subhead}>{current ? `${current} moves to the shelf with its progress kept. You can come back to it any time.` : 'It becomes your one active course.'}</Text>
          <Text style={[t.footnote, t.num]}>{`${c.done} of ${c.lessons} lessons done`}</Text>
          {current ? (
            <View style={s.gap8}>
              <Text style={t.footnote}>Why the switch? Optional</Text>
              <View style={s.chips}>{REASONS.map((r) => <Chip key={r} label={r} selected={reason === r} onPress={() => setReason(reason === r ? null : r)} />)}</View>
            </View>
          ) : null}
          <Button label={`Start ${c.title}`} kind="accent" onPress={() => { void go(); }} busy={saving} />
        </>
      ) : null}
    </Sheet>
  );
}

/** A new course: a title, a link, and the lesson list pasted in. The PC splits it into lessons. */
function AddCourseSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const a = useAspect();
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [lessons, setLessons] = useState<{ title: string; duration: string | null }[] | null>(null);
  const [by, setBy] = useState<'ai' | 'plain' | null>(null);
  const [busy, setBusy] = useState<'split' | 'add' | null>(null);
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) { setWasOpen(open); if (open) { setTitle(''); setUrl(''); setText(''); setLessons(null); setBy(null); } }
  const split = async () => {
    setBusy('split');
    try { const r = await call<{ lessons: { title: string; duration: string | null }[]; by: 'ai' | 'plain' }>('/mod/mind/course/split', { text }); setLessons(r.lessons); setBy(r.by); }
    catch (e) { a.notice((e as Error).message); } finally { setBusy(null); }
  };
  const add = async () => {
    if (!lessons?.length) return;
    setBusy('add');
    try {
      const r = await call<{ course: { title: string; status: string } }>('/mod/mind/course/add', { title: title.trim(), url: url.trim() || null, lessons });
      invalidate('/mod/mind/'); haptic.success();
      a.notice(r.course.status === 'active' ? `${r.course.title} is your course now` : `${r.course.title} is on the shelf`);
      onClose();
    } catch (e) { a.notice((e as Error).message); } finally { setBusy(null); }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Add a course">
      <Field label="Title" value={title} onChangeText={setTitle} placeholder="What the course is called" maxLength={120} />
      <Field label="Link, optional" value={url} onChangeText={setUrl} placeholder="Where the lessons are" keyboardType="url" />
      {!lessons ? (
        <>
          <Field label="Lesson list" value={text} onChangeText={setText} placeholder="Paste the course outline, one lesson a line" multiline />
          <Button label="Split into lessons" kind="accent" onPress={() => { void split(); }} busy={busy === 'split'} disabled={!text.trim()} />
        </>
      ) : (
        <>
          <View style={s.between}>
            <Text style={[t.headline, t.num]}>{lessons.length === 1 ? 'One lesson' : `${lessons.length} lessons`}</Text>
            <IconButton label="Edit the pasted list" size={40} onPress={() => setLessons(null)}><Icon name="pencil" size={16} /></IconButton>
          </View>
          {by === 'plain' ? <Text style={t.footnote}>Split line by line on the PC. Check the names.</Text> : null}
          <Group>
            {lessons.slice(0, 6).map((l, i) => <Item key={`${l.title}${i}`} title={l.title} sub={l.duration ? `Lesson ${i + 1}, ${durWords(l.duration)}` : `Lesson ${i + 1}`} />)}
          </Group>
          {lessons.length > 6 ? <Text style={[t.footnote, t.num]}>{`And ${lessons.length - 6} more`}</Text> : null}
          <Button label="Add course" kind="accent" onPress={() => { void add(); }} busy={busy === 'add'} disabled={!title.trim() || !lessons.length} />
          <Text style={t.footnote}>It goes on the shelf, so your current course stays first.</Text>
        </>
      )}
    </Sheet>
  );
}

function LearnSkeleton() {
  return (
    <View style={s.gap16}>
      <Skeleton height={260} radius={28} />
      <Skeleton height={180} radius={22} />
      <Skeleton height={120} radius={22} />
    </View>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  gap4: { gap: 4 },
  gap8: { gap: 8 },
  gap16: { gap: 16 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  buttons: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  next: { gap: 2, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.08)' },
});
