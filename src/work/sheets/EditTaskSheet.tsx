import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { tint } from '@/aspects/kit/tokens';
import { Toast } from '@/capture/parts';
import { answerNora, homeTasksChanged, tagNora, untagNora, type Tag } from '@/home/data';
import { api, ApiError } from '@/lib/api';
import { ASPECT_KEYS, ASPECT_NAME, aspectFields, aspectOfArea } from '@/lib/aspects';
import { DEMO, demoData } from '@/lib/demo';
import { useGet } from '@/lib/mod';
import type { LifePayload } from '@/lib/today';
import { tasksChanged } from '@/lib/useToday';
import { noraUi } from '@/nora/state';
import { ASPECT_COLOR, C, F, type AspectKey } from '@/theme';
import { Dots, NORA, NORA_TEXT } from '@/today2/parts';
import { openSheet, type TaskFocus, type TaskSeed } from '../bus';
import { work } from '../store';
import { ProjectChip, ProjectPicker } from './parts';
import { Chip, Press, PrimaryButton, SecondaryButton, SectionLabel, Segmented, Sheet, SheetFooter, SheetHeader, sheetStyles, useSheet } from './Sheet';

// A task's full view, the same from every list (Today's plan, Home, Work, Nora's cards): openTask() in ../bus. It
// shows what the lists cut short, read from the PC (GET /tasks/<id>): the whole title and notes, its Life aspect, date,
// project, goal and steps, who it is for, where it stands, and what Nora did or will do with it when she is tagged.
// Actions: Edit (title, notes, aspect, date, project, where it stands), Done, Move (a new date), Cancel (dropped; a
// repeating one skips to its next) and Delete (erased for good; DELETE ?hard=1). Each one that changes the lists
// closes the view and leaves a line with Undo. Today, Home and Work read again after every write.

type Detail = TaskSeed & {
  aspect?: AspectKey | null; areaName?: string | null; projectName?: string | null; goal?: string | null; goalTitle?: string | null;
  steps?: { id: string; title: string; status: string }[]; completedAt?: string | null; scheduled?: { start: string; end: string } | null;
};
type Stand = 'todo' | 'doing' | 'done';
const STANDS: { value: Stand; label: string }[] = [{ value: 'todo', label: 'To do' }, { value: 'doing', label: 'Doing' }, { value: 'done', label: 'Done' }];
const STATUS_WORD: Record<string, string> = { inbox: 'In the Inbox', todo: 'To do', doing: 'Doing', done: 'Done', dropped: 'Cancelled' };

const IST = 5.5 * 3600_000;
const istDay = (ms = Date.now()) => new Date(ms + IST).toISOString().slice(0, 10);
const plus = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const dayName = (day: string) => { const d = new Date(`${day}T12:00:00Z`); return `${WD[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`; };
/** Today, Tomorrow, a weekday and date; how late a past one is. */
function dueWord(due: string, open: boolean) {
  const today = istDay();
  if (due === today) return 'Today';
  if (due === plus(today, 1)) return 'Tomorrow';
  if (due < today && open) { const n = Math.round((Date.parse(today) - Date.parse(due)) / 864e5); return `${dayName(due)}, ${n === 1 ? '1 day' : `${n} days`} late`; }
  return dayName(due);
}
const hm = (iso: string) => new Date(Date.parse(iso) + IST).toISOString().slice(11, 16);
const REPEAT: Record<string, string> = { '1d': 'Every day', '1w': 'Every week', '2w': 'Every two weeks', '1m': 'Every month', '1y': 'Every year', weekdays: 'Weekdays' };
const repeatWord = (r: string) => REPEAT[r] ?? (r.startsWith('days:') ? `On ${r.slice(5).split(',').map((x) => x[0].toUpperCase() + x.slice(1)).join(', ')}` : r);
const msg = (e: unknown) => (e instanceof Error ? e.message : 'That didn’t save.');
const short = (s: string) => (s.length > 40 ? `${s.slice(0, 38).trim()}…` : s);

// ── the line with Undo, left behind when the view closes (drawn by WorkSheets over every screen) ──
type Note = { text: string; action: { label: string; onPress: () => void } | null; n: number };
let note: Note | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
const noteSubs = new Set<() => void>();
const emit = () => { for (const f of noteSubs) f(); };
export function sayTask(text: string, action?: Note['action']) {
  if (timer) clearTimeout(timer);
  note = { text, action: action ?? null, n: (note?.n ?? 0) + 1 };
  emit();
  timer = setTimeout(() => { note = null; emit(); }, action ? 6000 : 2600);
}
const hideTask = () => { if (timer) clearTimeout(timer); note = null; emit(); };
export function TaskToast() {
  const n = useSyncExternalStore((f) => { noteSubs.add(f); return () => { noteSubs.delete(f); }; }, () => note, () => note);
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={[s.toastAt, { bottom: insets.bottom + 132 }]}>
      <Toast key={n?.n} text={n?.text ?? null} action={n?.action} />
    </View>
  );
}

export function EditTaskSheet({ task, focus = 'view' }: { task: TaskSeed; focus?: TaskFocus }) {
  return (
    <Sheet label="Task">
      <Body seed={task} focus={focus} />
    </Sheet>
  );
}

function Body({ seed, focus }: { seed: TaskSeed; focus: TaskFocus }) {
  const { dismiss } = useSheet();
  const [t, setT] = useState<Detail>(seed);
  const [mode, setMode] = useState<TaskFocus>(focus);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const lifeRead = useGet<LifePayload>(DEMO ? null : '/life');
  const [demoLife] = useState(() => (DEMO ? demoData().life : null));
  const life = DEMO ? demoLife : lifeRead.data;
  const tagsRead = useGet<{ tags: Record<string, Tag> }>(DEMO ? null : '/mod/tasknora/tags');
  const [tagHere, setTagHere] = useState<Tag | null | undefined>(undefined); // what this view changed, ahead of the read
  const tag = tagHere !== undefined ? tagHere : tagsRead.data?.tags[seed.id] ?? null;

  const read = useCallback((live: () => boolean = () => true) => {
    if (DEMO) return Promise.resolve();
    return api<{ task: Detail }>(`/tasks/${seed.id}`).then((r) => { if (live()) setT(r.task); }, (e) => {
      if (!live()) return;
      if (e instanceof ApiError && e.status === 404 && /endpoint/i.test(e.message)) return; // an older PC: what the list knew
      if (e instanceof ApiError && e.status === 404) setGone(true);
      else setErr(msg(e));
    });
  }, [seed.id]);
  useEffect(() => {
    let on = true;
    void read(() => on);
    return () => { on = false; };
  }, [read]);

  const aspect = t.aspect !== undefined ? t.aspect : aspectOfArea(life, t.area);
  const open = t.status !== 'done' && t.status !== 'dropped';
  const changed = (project?: string | null) => { tasksChanged(); homeTasksChanged(); work.refetch(project ?? t.project ?? null); };
  const patch = (body: Record<string, unknown>) => (DEMO ? Promise.resolve(null) : api<Detail>(`/tasks/${t.id}`, { method: 'PATCH', body }));
  const act = async (run: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setErr(null);
    try { await run(); } catch (e) { setErr(msg(e)); } finally { setBusy(false); }
  };
  /** Undo for a write the view closed after: puts back what was, and says so. */
  const undoWith = (back: () => Promise<unknown>, said = 'Taken back') => ({
    label: 'Undo',
    onPress: () => { hideTask(); back().then(() => { changed(); sayTask(said); }, (e) => sayTask(msg(e))); },
  });
  const was = (t.status ?? 'todo') as Stand | 'inbox' | 'dropped';

  const done = () => act(async () => {
    const to = t.status === 'done' ? 'todo' : 'done';
    await patch({ status: to });
    changed(); dismiss();
    sayTask(to === 'done' ? `Done: ${short(t.title)}` : 'Back on the list', undoWith(() => patch({ status: was })));
  });
  const cancel = () => act(async () => {
    if (t.status === 'dropped') { await patch({ status: 'todo' }); changed(); dismiss(); sayTask('Back on the list'); return; }
    // as Today's cancel: a repeating task skips this one and files its next; a one-off is dropped
    await patch({ status: 'dropped', skip: true });
    changed(); dismiss();
    sayTask(t.repeat ? 'Skipped this one. The next is on its day.' : `Cancelled: ${short(t.title)}`, undoWith(() => patch({ status: was })));
  });
  const del = () => act(async () => {
    if (DEMO) { changed(); dismiss(); sayTask('Task deleted'); return; }
    const r = await api<{ deleted?: unknown }>(`/tasks/${t.id}?hard=1`, { method: 'DELETE' });
    changed(); dismiss();
    // an older PC drops it instead of erasing it: Undo brings it back the same way
    sayTask(`Deleted: ${short(t.title)}`, undoWith(() => (r?.deleted ? api('/tasks/restore', { method: 'POST', body: r.deleted }) : patch({ status: was })), 'Task is back'));
  });
  const move = (due: string | null) => act(async () => {
    const before = t.due ?? null;
    if (due === before) { setMode('view'); return; }
    await patch({ due });
    changed(); dismiss();
    const word = due ? dueWord(due, false) : null;
    sayTask(word ? `Moved to ${word === 'Today' || word === 'Tomorrow' ? word.toLowerCase() : word}` : 'Date taken off', undoWith(() => patch({ due: before })));
  });

  // ── Nora ──
  const tagHer = () => act(async () => {
    const at = new Date().toISOString();
    await tagNora(t.id, t.title);
    setTagHere({ taskId: t.id, state: 'queued', text: null, question: null, options: [], answer: null, taggedAt: at, at });
    homeTasksChanged(); void tagsRead.refresh();
    sayTask('Nora has it');
  });
  const untag = () => act(async () => {
    await untagNora(t.id);
    setTagHere(null); homeTasksChanged(); void tagsRead.refresh();
    sayTask('Taken back from Nora');
  });
  const answer = (text: string) => act(async () => {
    if (!text.trim() || !tag) return;
    await answerNora(t.id, text.trim());
    setTagHere({ ...tag, state: 'working', answer: text.trim(), question: null, options: [] });
    homeTasksChanged(); void tagsRead.refresh();
    sayTask('Sent to Nora');
  });
  const chat = () => dismiss(() => noraUi.openChat());

  if (mode === 'edit') return <EditForm t={t} life={life} aspect={aspect} busy={busy} err={err} onBack={() => { setErr(null); setMode('view'); }}
    onSave={(body, project) => act(async () => {
      await patch(body);
      changed(project);
      await read();
      setMode('view');
      sayTask('Saved');
    })} />;

  const sub = gone ? 'Gone from the PC' : t.status === 'done' ? 'Done' : t.status === 'dropped' ? 'Cancelled' : t.due ? dueWord(t.due, open) : STATUS_WORD[t.status ?? 'todo'];
  return (
    <>
      <SheetHeader title="Task" sub={sub} />
      <ScrollView style={s.scroll} contentContainerStyle={[sheetStyles.pad, s.body]} keyboardShouldPersistTaps="handled">
        <Text selectable style={[s.title, !open && s.titleShut]} accessibilityRole="header">{t.title}</Text>
        {t.notes ? <Text selectable style={s.notes}>{t.notes}</Text> : null}

        <View style={[sheetStyles.box, s.facts]}>
          <Fact label="Aspect" first>
            {aspect ? <View style={s.factRow}><View style={[s.dot, { backgroundColor: ASPECT_COLOR[aspect] }]} /><Text style={s.factText}>{ASPECT_NAME[aspect]}</Text></View>
              : <Text style={[s.factText, s.faint]}>{t.areaName ?? t.area ?? 'None'}</Text>}
          </Fact>
          <Fact label="Date">
            <Text style={[s.factText, !t.due && s.faint, t.due && open && t.due < istDay() && { color: C.danger }]}>
              {t.due ? dueWord(t.due, open) : 'No date'}{t.scheduled ? `, ${hm(t.scheduled.start)} to ${hm(t.scheduled.end)}` : ''}
            </Text>
          </Fact>
          {t.repeat ? <Fact label="Repeats"><Text style={s.factText}>{repeatWord(t.repeat)}</Text></Fact> : null}
          {t.project ? <Fact label="Project"><Text style={s.factText}>{t.projectName ?? t.project}</Text></Fact> : null}
          {t.goalTitle ? <Fact label="Goal"><Text style={s.factText}>{t.goalTitle}</Text></Fact> : null}
          <Fact label="For">
            {t.owner === 'nora' ? <Text style={[s.factText, { color: NORA_TEXT }]}>Nora</Text>
              : tag ? <Text style={s.factText}>You, with Nora on it</Text> : <Text style={s.factText}>You</Text>}
          </Fact>
          <Fact label="Status"><Text style={s.factText}>{STATUS_WORD[t.status ?? 'todo']}{t.status === 'done' && t.completedAt ? `, ${dayName(istDay(Date.parse(t.completedAt)))}` : ''}</Text></Fact>
        </View>

        {t.steps?.length ? (
          <View style={{ gap: 6 }}>
            <SectionLabel>Steps</SectionLabel>
            {t.steps.map((x) => <Text key={x.id} style={[s.step, x.status === 'done' && s.titleShut]}>{`${x.status === 'done' ? '✓' : '○'}  ${x.title}`}</Text>)}
          </View>
        ) : null}

        <NoraPart tag={tag} own={t.owner === 'nora'} busy={busy} onTag={tagHer} onUntag={untag} onAnswer={answer} onChat={chat} />

        {gone ? <Text style={sheetStyles.error}>This task isn’t on the PC any more. Pull to refresh the list.</Text> : null}
        {err ? <Text style={sheetStyles.error}>{err}</Text> : null}
      </ScrollView>

      {mode === 'date' ? (
        <Animated.View entering={FadeIn.duration(160)} style={s.datePane}>
          <View style={[sheetStyles.pad, s.paneHead]}><SectionLabel>Move to</SectionLabel></View>
          <DayChips value={t.due ?? null} onPick={move} />
          <SheetFooter>
            <View style={{ flex: 1 }} />
            <SecondaryButton label="Back" onPress={() => setMode('view')} />
          </SheetFooter>
        </Animated.View>
      ) : (
        <View style={s.acts}>
          <Act label="Edit" icon="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" onPress={() => setMode('edit')} disabled={busy || gone} />
          <Act label={t.status === 'done' ? 'Reopen' : 'Done'} icon="M5 12.5l4.5 4.5L19 7.5" onPress={done} disabled={busy || gone} />
          <Act label="Move" icon="M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" onPress={() => setMode('date')} disabled={busy || gone} />
          <Act label={t.status === 'dropped' ? 'Bring back' : t.repeat ? 'Skip' : 'Cancel task'} icon="M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18zM5.6 5.6l12.8 12.8" onPress={cancel} disabled={busy || gone} />
          <Act label="Delete" icon="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" onPress={del} disabled={busy || gone} danger />
        </View>
      )}
      {mode === 'view' && t.project && open ? (
        <View style={[sheetStyles.pad, { paddingTop: 10 }]}>
          <SecondaryButton label="Start a job on it" onPress={() => openSheet({ kind: 'job', project: t.project ?? null, tasks: [t.id] })} />
        </View>
      ) : null}
    </>
  );
}

function Fact({ label, first, children }: { label: string; first?: boolean; children: ReactNode }) {
  return (
    <View style={[s.fact, !first && s.factLine]}>
      <Text style={s.factLabel}>{label}</Text>
      <View style={{ flex: 1, minWidth: 0 }}>{children}</View>
    </View>
  );
}

/** One action under the details: a round mark and its name. */
function Act({ label, icon, onPress, disabled, danger }: { label: string; icon: string; onPress: () => void; disabled?: boolean; danger?: boolean }) {
  const color = danger ? C.danger : C.text;
  return (
    <Press label={label} onPress={onPress} disabled={disabled} style={s.act}>
      <View style={[s.actMark, danger && { backgroundColor: tint(C.danger, 0.16) }]}>
        <Svg width={20} height={20} viewBox="0 0 24 24"><Path d={icon} stroke={color} strokeWidth={1.9} fill="none" strokeLinecap="round" strokeLinejoin="round" /></Svg>
      </View>
      <Text style={[s.actText, danger && { color: C.danger }]} numberOfLines={1}>{label}</Text>
    </Press>
  );
}

/** Today, Tomorrow, the next three weeks in a row, and No date. */
function DayChips({ value, onPick }: { value: string | null; onPick: (due: string | null) => void }) {
  const [today] = useState(istDay);
  const days = Array.from({ length: 21 }, (_, i) => plus(today, i + 2));
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={s.days}>
      <Chip label="Today" selected={value === today} onPress={() => onPick(today)} />
      <Chip label="Tomorrow" selected={value === plus(today, 1)} onPress={() => onPick(plus(today, 1))} />
      {days.map((d) => <Chip key={d} label={dayName(d)} selected={value === d} onPress={() => onPick(d)} />)}
      <Chip label="No date" selected={!value} onPress={() => onPick(null)} />
    </ScrollView>
  );
}

/** What Nora is doing with it: her state, what she found or asks, and the way to answer her; or Tag Nora. */
function NoraPart({ tag, own, busy, onTag, onUntag, onAnswer, onChat }: {
  tag: Tag | null; own: boolean; busy: boolean; onTag: () => void; onUntag: () => void; onAnswer: (text: string) => void; onChat: () => void;
}) {
  const [reply, setReply] = useState<string | null>(null);
  if (!tag && !own) {
    return (
      <View style={[s.nora, s.noraIdle]}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={s.noraName}>Nora</Text>
          <Text style={s.noraBody}>Tag her and she works on it, then writes what she found here.</Text>
        </View>
        <Chip label="Tag Nora" onPress={onTag} />
      </View>
    );
  }
  const head = own && !tag ? 'Her own task. She does it and reports in her chat.'
    : tag!.state === 'queued' ? 'Tagged. She starts after what she is on now.'
      : tag!.state === 'working' ? 'Working on it' : tag!.state === 'ask' ? 'Needs one answer from you'
        : tag!.state === 'error' ? 'Could not finish' : 'Found';
  return (
    <View style={s.nora}>
      <View style={s.noraHead}>
        <Text style={s.noraName}>Nora</Text>
        {tag?.state === 'working' ? <Dots color={NORA} /> : null}
      </View>
      <Text style={[s.noraLine, tag?.state === 'error' && { color: C.danger }]}>{head}</Text>
      {tag?.state === 'ask' && tag.question ? <Text selectable style={s.noraBody}>{tag.question}</Text> : null}
      {(tag?.state === 'found' || tag?.state === 'error' || tag?.state === 'working') && tag.text ? <Text selectable style={s.noraBody}>{tag.text}</Text> : null}
      {tag?.answer && tag.state !== 'ask' ? <Text style={s.noraYou}>{`You said: ${tag.answer}`}</Text> : null}
      {tag?.state === 'ask' ? (
        reply == null ? (
          <View style={s.noraActs}>
            {tag.options.map((o) => <Chip key={o} label={o} onPress={() => onAnswer(o)} />)}
            <Chip label="Reply" onPress={() => setReply('')} />
          </View>
        ) : (
          <View style={s.replyRow}>
            <TextInput autoFocus value={reply} onChangeText={setReply} placeholder="Your answer" placeholderTextColor={C.faint} style={s.replyInput}
              returnKeyType="send" onSubmitEditing={() => { onAnswer(reply); setReply(null); }} accessibilityLabel="Your answer to Nora" />
            <PrimaryButton label="Send" disabled={!reply.trim() || busy} onPress={() => { onAnswer(reply); setReply(null); }} />
          </View>
        )
      ) : null}
      <View style={s.noraActs}>
        <Chip label="Open her chat" onPress={onChat} />
        {tag ? <Chip label={tag.state === 'error' ? 'Take it back' : 'Untag Nora'} onPress={onUntag} /> : null}
        {tag?.state === 'error' ? <Chip label="Try again" onPress={onTag} /> : null}
      </View>
    </View>
  );
}

/** The task's fields to change: title, notes, Life aspect, date, where it stands, project. Save sends only what changed. */
function EditForm({ t, life, aspect: wasAspect, busy, err, onBack, onSave }: {
  t: Detail; life: LifePayload | null; aspect: AspectKey | null; busy: boolean; err: string | null;
  onBack: () => void; onSave: (body: Record<string, unknown>, project: string | null) => void;
}) {
  const [title, setTitle] = useState(t.title);
  const [notes, setNotes] = useState(t.notes ?? '');
  const [aspect, setAspect] = useState<AspectKey | null>(wasAspect);
  const [due, setDue] = useState<string | null>(t.due ? t.due.slice(0, 10) : null);
  const wasStand: Stand = t.status === 'doing' ? 'doing' : t.status === 'done' ? 'done' : 'todo';
  const [stand, setStand] = useState<Stand>(wasStand);
  const [project, setProject] = useState(t.project ?? null);
  const [picking, setPicking] = useState(false);
  const [days, setDays] = useState(false);

  const body: Record<string, unknown> = {
    ...(title.trim() !== t.title ? { title: title.trim() } : {}),
    ...(notes.trim() !== (t.notes ?? '') ? { notes: notes.trim() || null } : {}),
    ...(due !== (t.due ? t.due.slice(0, 10) : null) ? { due } : {}),
    ...(project !== (t.project ?? null) ? { project } : {}),
    // an Inbox task he edits without touching where it stands stays in the Inbox
    ...(stand !== wasStand ? { status: stand } : {}),
    ...(aspect !== wasAspect ? aspectFields(life, aspect) : {}),
  };
  const dirty = Object.keys(body).length > 0;
  const canSave = !!title.trim();
  const save = () => { if (canSave && dirty) onSave(body, project); else if (!dirty) onBack(); };

  return (
    <>
      <SheetHeader title="Edit task" />
      <ScrollView style={s.scroll} contentContainerStyle={[sheetStyles.pad, s.body]} keyboardShouldPersistTaps="handled">
        <TextInput value={title} onChangeText={setTitle} placeholder="What needs doing?" placeholderTextColor={C.faint}
          style={sheetStyles.titleField} accessibilityLabel="Task" maxLength={500} multiline />
        <TextInput value={notes} onChangeText={setNotes} placeholder="Notes" placeholderTextColor={C.faint} multiline
          style={[sheetStyles.bodyField, s.notesField]} accessibilityLabel="Notes" scrollEnabled />
        <View style={{ gap: 8 }}>
          <SectionLabel>Aspect</SectionLabel>
          <View style={s.wrap} accessibilityLabel="Life aspect">
            {ASPECT_KEYS.map((a) => (
              <Press key={a} label={ASPECT_NAME[a]} selected={aspect === a} onPress={() => setAspect(aspect === a ? null : a)}
                style={[s.aspect, aspect === a && { backgroundColor: tint(ASPECT_COLOR[a], 0.2), borderColor: tint(ASPECT_COLOR[a], 0.55) }]}>
                <View style={[s.dot, { backgroundColor: ASPECT_COLOR[a] }]} />
                <Text style={[s.aspectText, aspect === a && { color: ASPECT_COLOR[a] }]}>{ASPECT_NAME[a]}</Text>
              </Press>
            ))}
          </View>
        </View>
        <View style={{ gap: 8 }}>
          <SectionLabel>Date</SectionLabel>
          <View style={s.wrap}>
            <Chip label="Today" selected={due === istDay()} onPress={() => { setDue(due === istDay() ? null : istDay()); setDays(false); }} />
            <Chip label="Tomorrow" selected={due === plus(istDay(), 1)} onPress={() => { setDue(due === plus(istDay(), 1) ? null : plus(istDay(), 1)); setDays(false); }} />
            <Chip label={due && due !== istDay() && due !== plus(istDay(), 1) ? dayName(due) : 'Pick a day'} selected={days || (!!due && due !== istDay() && due !== plus(istDay(), 1))} onPress={() => setDays((v) => !v)} />
            {due ? <Chip label="No date" onPress={() => { setDue(null); setDays(false); }} /> : null}
          </View>
        </View>
        {days ? <View style={{ marginHorizontal: -16 }}><DayChips value={due} onPick={(d) => { setDue(d); setDays(false); }} /></View> : null}
        <View style={{ gap: 8 }}>
          <SectionLabel>Where it stands</SectionLabel>
          <Segmented options={STANDS} value={stand} onChange={setStand} label="Where the task stands" />
        </View>
        {err ? <Text style={sheetStyles.error}>{err}</Text> : null}
      </ScrollView>
      {picking ? <ProjectPicker slug={project} onPick={(p) => { setProject(p); setPicking(false); }} /> : null}
      <SheetFooter>
        <View style={s.flex}><ProjectChip slug={project} open={picking} onToggle={() => setPicking((v) => !v)} /></View>
        <SecondaryButton label="Back" onPress={onBack} />
        <PrimaryButton label="Save" onPress={save} disabled={!canSave || !dirty} busy={busy} />
      </SheetFooter>
    </>
  );
}

const s = StyleSheet.create({
  scroll: { flexShrink: 1 },
  body: { gap: 14, paddingBottom: 4 },
  title: { fontFamily: F.semibold, fontSize: 20, lineHeight: 27, letterSpacing: -0.2, color: C.text },
  titleShut: { color: C.muted, textDecorationLine: 'line-through' },
  notes: { fontFamily: F.regular, fontSize: 16, lineHeight: 23, color: C.textSoft },
  facts: { paddingHorizontal: 14 },
  fact: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 10 },
  factLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.10)' },
  factLabel: { width: 64, fontFamily: F.medium, fontSize: 14, lineHeight: 20, color: C.muted },
  factRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  factText: { fontFamily: F.medium, fontSize: 15, lineHeight: 20, color: C.text },
  faint: { color: C.faint },
  dot: { width: 8, height: 8, borderRadius: 4 },
  step: { fontFamily: F.regular, fontSize: 15, lineHeight: 21, color: C.textSoft },
  nora: { gap: 6, paddingLeft: 12, borderLeftWidth: 2, borderColor: tint(NORA, 0.55) },
  noraIdle: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  noraHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  noraName: { fontFamily: F.semibold, fontSize: 13, lineHeight: 18, color: NORA_TEXT },
  noraLine: { fontFamily: F.medium, fontSize: 15, lineHeight: 20, color: C.text },
  noraBody: { fontFamily: F.regular, fontSize: 15, lineHeight: 22, color: C.textSoft },
  noraYou: { fontFamily: F.regular, fontSize: 13, lineHeight: 18, color: C.muted },
  noraActs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  replyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  replyInput: {
    flex: 1, height: 40, paddingHorizontal: 12, borderRadius: 20, fontFamily: F.regular, fontSize: 15, color: C.text, backgroundColor: 'rgba(255,255,255,0.06)',
  },
  acts: { flexDirection: 'row', paddingHorizontal: 8, paddingTop: 12 },
  act: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: 2 },
  actMark: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  actText: { fontFamily: F.medium, fontSize: 12, lineHeight: 16, color: C.text },
  datePane: { paddingTop: 8 },
  paneHead: { paddingBottom: 8 },
  days: { gap: 8, paddingHorizontal: 16 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  aspect: {
    height: 32, paddingHorizontal: 12, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.10)',
  },
  aspectText: { fontFamily: F.medium, fontSize: 14, lineHeight: 20, color: C.textSoft },
  notesField: { minHeight: 72 },
  flex: { flex: 1, alignItems: 'flex-start' },
  toastAt: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
});
