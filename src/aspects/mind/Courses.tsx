import * as Linking from 'expo-linking';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  Bar, Button, Card, CheckRing, Chip, Divider, Empty, Failed, Field, Icon, IconButton, Row, Screen, Section, Sheet, Skeleton,
  haptic, shortDay, t, useAspect,
} from '@/aspects/kit';
import { call, invalidate, useGet } from '@/lib/mod';
import { C } from '@/theme';
import type { CourseView, Lesson, Shelf, TakeSpec } from './types';
import { Sym, minutes, useLast } from './ui';

export const COURSE = '/mod/mind/course';
const REASONS = ['I need this one now', 'Lost interest in the current one', 'Got what I needed from it', 'Too hard for now'];
export const sayLesson = (l: { id: string; title: string }): TakeSpec =>
  ({ kind: 'learned', topic: `Explain ${l.title} to a friend who hasn't seen it.`, label: 'Say what you learned', source: { kind: 'lesson', id: l.id, title: l.title } });

export function CoursesScreen({ open, onClose, onSay }: { open: boolean; onClose: () => void; onSay: (spec: TakeSpec) => void }) {
  const a = useAspect();
  const g = useGet<CourseView>(open ? COURSE : null);
  const v = g.data;
  const [switchTo, setSwitchTo] = useState<Shelf | null>(null);
  const [doneFor, setDoneFor] = useState<Lesson | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const act = v?.active ?? null;

  const undo = async (l: Lesson) => {
    setBusy(`u${l.id}`);
    try { await call(`/mod/mind/lesson/${l.id}/undo`); invalidate('/mod/mind/'); a.notice('Marked as not done'); } catch (e) { a.notice((e as Error).message); } finally { setBusy(null); }
  };
  const open1 = (url: string | null) => { if (url) Linking.openURL(url).catch(() => a.notice("That link didn't open.")); };

  let body;
  if (!v) body = g.error ? <Failed message={g.error} onRetry={g.refresh} /> : <CourseSkeleton />;
  else if (!v.total) body = <Empty title="No courses yet" body="Add a course with its lesson list. One is active at a time; the rest wait on a shelf." action="Add a course" onAction={() => setAdding(true)} icon={<Sym name="course" size={28} color={C.muted} />} />;
  else {
    const doneToday = act ? act.list.filter((l) => act.today.includes(l.id)) : [];
    const coming = act ? act.list.filter((l) => l.status === 'todo' && l.id !== act.next?.id).slice(0, 3) : [];
    body = (
      <>
        {act ? (
          <View style={s.gap12}>
            <Text style={t.title2}>{act.title}</Text>
            <Bar progress={act.lessons ? act.done / act.lessons : 0} height={6} />
            <Text style={[t.label, t.num]}>{`${act.done} of ${act.lessons} lessons done`}</Text>
            <Text style={[t.small, t.num]}>
              {act.left ? `${act.left} left${act.minutes_known && act.minutes_left ? `, about ${minutes(act.minutes_left)}` : ''}. ` : ''}
              {act.finish ? `At your pace, done around ${shortDay(act.finish)}.` : act.why ?? ''}
            </Text>
          </View>
        ) : (
          <Card>
            <View style={s.gap8}>
              <Text style={t.lead}>No course is active</Text>
              <Text style={t.small}>Pick one from the shelf below. The others keep their progress.</Text>
            </View>
          </Card>
        )}

        {doneToday.length ? (
          <Section title="Done today">
            <View>
              {doneToday.map((l) => (
                <Row key={l.id} title={l.title} sub={l.made ? `Made: ${l.made}` : `Lesson ${l.n + 1}`} left={<CheckRing done size={24} />}
                  right={<Button label="Undo" kind="quiet" small onPress={() => undo(l)} busy={busy === `u${l.id}`} />} />
              ))}
            </View>
            <Button label="Say it in a minute" kind="accent" icon={<Icon name="mic" size={18} color="#14161C" />} onPress={() => onSay(sayLesson(doneToday[doneToday.length - 1]))} />
          </Section>
        ) : null}

        {act?.next ? <Today lesson={act.next} practice={act.practice} onOpen={() => open1(act.next!.url)} onDone={() => setDoneFor(act.next)} quiet={doneToday.length > 0} /> : act ? (
          <Card tone={a.color}><Text style={t.lead}>Every lesson is done. Pick the next course from the shelf.</Text></Card>
        ) : null}

        {coming.length ? (
          <Section title="Coming up">
            <View>{coming.map((l) => <Row key={l.id} title={l.title} sub={`Lesson ${l.n + 1}${l.duration ? `, ${l.duration}` : ''}`} />)}</View>
          </Section>
        ) : null}

        {v.parked.length ? (
          <Section title="Parked">
            <View>
              {v.parked.map((c) => (
                <Row key={c.id} title={c.title} chevron onPress={() => setSwitchTo(c)} label={`${c.title}, parked. Start this one instead`}
                  sub={`${c.done} of ${c.lessons} done${c.park_reason ? `. ${c.park_reason}` : ''}`} />
              ))}
            </View>
          </Section>
        ) : null}

        {v.libraries.length ? (
          <Section title="Libraries">
            <Text style={t.small}>Collections to dip into, not courses to finish.</Text>
            <View>
              {v.libraries.map((c) => <Row key={c.id} title={c.title} sub={`${c.lessons} lessons${c.done ? `, ${c.done} watched` : ''}`} chevron onPress={() => setSwitchTo(c)} />)}
            </View>
          </Section>
        ) : null}

        {v.done.length ? (
          <Section title="Finished">
            <View>{v.done.map((c) => <Row key={c.id} title={c.title} sub={`${c.lessons} lessons`} left={<CheckRing done size={24} />} />)}</View>
          </Section>
        ) : null}

        <Button label="Add a course" kind="quiet" onPress={() => setAdding(true)} icon={<Icon name="plus" size={18} />} />
      </>
    );
  }

  return (
    <Screen open={open} onClose={onClose} title="Courses">
      {body}
      <SwitchSheet to={switchTo} current={act?.title ?? null} onClose={() => setSwitchTo(null)} />
      <DoneSheet lesson={doneFor} onClose={() => setDoneFor(null)} onSay={(spec) => { setDoneFor(null); onSay(spec); }} />
      <AddCourseSheet open={adding} onClose={() => setAdding(false)} />
    </Screen>
  );
}

/** Today's lesson: why it matters, what to watch for, what to make, and when it counts as done. */
function Today({ lesson: l, practice, onOpen, onDone, quiet }: { lesson: Lesson; practice: string | null; onOpen: () => void; onDone: () => void; quiet: boolean }) {
  const a = useAspect();
  const parts = [
    { k: 'Why it matters', v: l.why },
    { k: 'Watch for', v: l.watch },
    { k: 'Then make', v: l.practice ?? practice },
    { k: 'Done when', v: l.done_when },
  ].filter((x) => x.v) as { k: string; v: string }[];
  return (
    <Section title={quiet ? 'Next lesson' : "Today's lesson"}>
      <Card>
        <View style={s.gap16}>
          <View style={s.gap4}>
            <Text style={[t.label, t.num, { color: a.color }]}>{`Lesson ${l.n + 1}${l.duration ? `, ${l.duration}` : ''}`}</Text>
            <Text style={t.heading}>{l.title}</Text>
          </View>
          {parts.map((p, i) => (
            <View key={p.k} style={s.gap4}>
              {i ? <Divider /> : null}
              <Text style={[t.label, i ? s.pt12 : null]}>{p.k}</Text>
              <Text style={t.body}>{p.v}</Text>
            </View>
          ))}
          <View style={s.buttons}>
            {l.url ? <Button label="Open lesson" kind="quiet" onPress={onOpen} icon={<Sym name="open" size={16} />} wrap={s.flex} /> : null}
            <Button label="Mark done" kind={quiet ? 'soft' : 'accent'} onPress={onDone} icon={<Icon name="check" size={18} color={quiet ? a.color : '#14161C'} />} wrap={s.flex} />
          </View>
        </View>
      </Card>
    </Section>
  );
}

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
    try { await call(`/mod/mind/lesson/${l.id}/done`, { made: made.trim() || null }); invalidate('/mod/mind/'); haptic.success(); setSaved(true); }
    catch (e) { a.notice((e as Error).message); } finally { setSaving(false); }
  };
  return (
    <Sheet open={!!lesson} onClose={onClose} title={saved ? 'Lesson done' : l?.title ?? ''}>
      {!l ? null : saved ? (
        <>
          <Text style={t.body}>The best test of a lesson is saying it back. A minute, in your own words.</Text>
          <Button label="Say it in a minute" kind="accent" icon={<Icon name="mic" size={18} color="#14161C" />} onPress={() => onSay(sayLesson(l))} />
          <Button label="Not now" kind="quiet" onPress={onClose} />
        </>
      ) : (
        <>
          {l.done_when ? <Text style={t.small}>{`Done when: ${l.done_when}`}</Text> : null}
          <Field label="What did you make? Optional" value={made} onChangeText={setMade} placeholder="A line, or leave it empty" maxLength={500} />
          <Button label="Mark done" kind="primary" onPress={save} busy={saving} />
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
          <Text style={t.body}>{current ? `${current} moves to the shelf with its progress kept. You can come back to it any time.` : 'It becomes your one active course.'}</Text>
          <Text style={[t.small, t.num]}>{`${c.done} of ${c.lessons} lessons done`}</Text>
          {current ? (
            <View style={s.gap8}>
              <Text style={t.label}>Why the switch? Optional</Text>
              <View style={s.chips}>{REASONS.map((r) => <Chip key={r} label={r} selected={reason === r} onPress={() => setReason(reason === r ? null : r)} />)}</View>
            </View>
          ) : null}
          <Button label={`Start ${c.title}`} kind="primary" onPress={go} busy={saving} />
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
          <Button label="Split into lessons" kind="primary" onPress={split} busy={busy === 'split'} disabled={!text.trim()} />
        </>
      ) : (
        <>
          <View style={s.splitHead}>
            <Text style={[t.strong, t.num]}>{lessons.length === 1 ? 'One lesson' : `${lessons.length} lessons`}</Text>
            <IconButton label="Edit the pasted list" size={36} onPress={() => setLessons(null)}><Icon name="pencil" size={16} /></IconButton>
          </View>
          {by === 'plain' ? <Text style={t.caption}>Split line by line on the PC. Check the names.</Text> : null}
          <View>
            {lessons.slice(0, 6).map((l, i) => <Row key={`${l.title}${i}`} title={l.title} sub={l.duration ? `Lesson ${i + 1}, ${l.duration}` : `Lesson ${i + 1}`} />)}
          </View>
          {lessons.length > 6 ? <Text style={[t.small, t.num]}>{`And ${lessons.length - 6} more`}</Text> : null}
          <Button label="Add course" kind="primary" onPress={add} busy={busy === 'add'} disabled={!title.trim() || !lessons.length} />
          <Text style={t.caption}>It goes on the shelf, so your current course stays first.</Text>
        </>
      )}
    </Sheet>
  );
}

function CourseSkeleton() {
  return (
    <View style={s.gap24}>
      <View style={s.gap12}><Skeleton height={32} width="70%" /><Skeleton height={6} /><Skeleton height={16} width={160} /></View>
      <Skeleton height={280} radius={24} />
      <Skeleton height={56} /><Skeleton height={56} />
    </View>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  gap4: { gap: 4 },
  gap8: { gap: 8 },
  gap12: { gap: 12 },
  gap16: { gap: 16 },
  gap24: { gap: 24 },
  pt12: { paddingTop: 12 },
  buttons: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  splitHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
