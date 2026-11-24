import { useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { C } from '@/theme';
import { openSheet } from '../bus';
import { work } from '../store';
import type { Task } from '../types';
import { ProjectChip, ProjectPicker } from './parts';
import { Chip, PrimaryButton, SecondaryButton, SectionLabel, Segmented, Sheet, SheetFooter, SheetHeader, sheetStyles, useSheet } from './Sheet';

// A task, opened from a list: rename it, add notes, set or clear its due day, move it, set where it stands
// (To do, Doing, Done), drop it, or start a job that carries it. Save keeps the edits.

type Stand = 'todo' | 'doing' | 'done';
const STANDS: { value: Stand; label: string }[] = [{ value: 'todo', label: 'To do' }, { value: 'doing', label: 'Doing' }, { value: 'done', label: 'Done' }];

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayAt = (offset: number) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + offset); return d; };
const dayLabel = (d: Date) => d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
const parseDay = (s: string) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d, 12); };

export function EditTaskSheet({ task }: { task: Task }) {
  return (
    <Sheet label="Task">
      <Body task={task} />
    </Sheet>
  );
}

function Body({ task }: { task: Task }) {
  const { dismiss } = useSheet();
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes ?? '');
  const [due, setDue] = useState<string | null>(task.due ? task.due.slice(0, 10) : null);
  const [stand, setStand] = useState<Stand>(task.status === 'doing' ? 'doing' : task.status === 'done' ? 'done' : 'todo');
  const [project, setProject] = useState(task.project);
  const [picking, setPicking] = useState(false);
  const [choosingDay, setChoosingDay] = useState(false);

  const [today] = useState(() => ymd(dayAt(0)));
  const [tomorrow] = useState(() => ymd(dayAt(1)));
  const [later] = useState(() => Array.from({ length: 21 }, (_, i) => dayAt(i + 2)));
  const picked = due && due !== today && due !== tomorrow ? parseDay(due) : null;
  const toggle = (v: string) => { setDue((cur) => (cur === v ? null : v)); setChoosingDay(false); };

  const wasStand: Stand = task.status === 'doing' ? 'doing' : task.status === 'done' ? 'done' : 'todo';
  const patch = {
    ...(title.trim() !== task.title ? { title: title.trim() } : {}),
    ...(notes.trim() !== (task.notes ?? '') ? { notes: notes.trim() || null } : {}),
    ...(due !== (task.due ? task.due.slice(0, 10) : null) ? { due } : {}),
    ...(project !== task.project ? { project } : {}),
    // an Inbox task he edits without touching its standing stays in the Inbox
    ...(stand !== wasStand || (task.status === 'inbox' && stand !== 'todo') ? { status: stand } : {}),
  };
  const dirty = Object.keys(patch).length > 0;
  const canSave = !!title.trim();

  const keep = () => (dirty ? work.patchTask(task.id, patch) : Promise.resolve(null));
  const save = () => { if (!canSave) return; void keep(); dismiss(); };
  const startJob = () => { void keep(); openSheet({ kind: 'job', project, tasks: [task.id] }); };
  const drop = () => {
    void work.patchTask(task.id, { ...patch, status: task.status === 'dropped' ? 'todo' : 'dropped' });
    work.notify(task.status === 'dropped' ? 'Task back on the list.' : 'Task dropped.');
    dismiss();
  };

  return (
    <>
      <SheetHeader title="Task" sub={task.status === 'inbox' ? 'In the Inbox' : task.status === 'dropped' ? 'Dropped' : null} />
      <ScrollView style={s.scroll} contentContainerStyle={[sheetStyles.pad, { gap: 12 }]} keyboardShouldPersistTaps="handled">
        <TextInput value={title} onChangeText={setTitle} placeholder="What needs doing?" placeholderTextColor={C.faint}
          style={sheetStyles.titleField} accessibilityLabel="Task" maxLength={300} multiline />
        <TextInput value={notes} onChangeText={setNotes} placeholder="Notes" placeholderTextColor={C.faint} multiline
          style={[sheetStyles.bodyField, s.notes]} accessibilityLabel="Notes" scrollEnabled />
        <View style={{ gap: 8 }}>
          <SectionLabel>Where it stands</SectionLabel>
          <Segmented options={STANDS} value={stand} onChange={setStand} label="Where the task stands" />
        </View>
        <View style={{ gap: 8 }}>
          <SectionLabel>Due</SectionLabel>
          <View style={s.row} accessibilityLabel="Due">
            <Chip label="Today" selected={due === today} onPress={() => toggle(today)} a11y="Due today" />
            <Chip label="Tomorrow" selected={due === tomorrow} onPress={() => toggle(tomorrow)} a11y="Due tomorrow" />
            <Chip label={picked ? dayLabel(picked) : 'Pick a day'} selected={!!picked || choosingDay}
              a11y={picked ? `Due ${dayLabel(picked)}. Change` : 'Pick a due day'} onPress={() => setChoosingDay((v) => !v)} />
            {due ? <Chip label="No due day" onPress={() => { setDue(null); setChoosingDay(false); }} a11y="Clear the due day" /> : null}
          </View>
          {choosingDay ? (
            <Animated.View entering={FadeIn.duration(160)}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={s.days}>
                {later.map((d) => (
                  <Chip key={ymd(d)} label={dayLabel(d)} selected={due === ymd(d)} a11y={`Due ${dayLabel(d)}`}
                    onPress={() => { setDue(due === ymd(d) ? null : ymd(d)); setChoosingDay(false); }} />
                ))}
              </ScrollView>
            </Animated.View>
          ) : null}
        </View>
        <View style={s.row}>
          <PrimaryButton label="Start a job" onPress={startJob} disabled={!title.trim()} />
          <SecondaryButton label={task.status === 'dropped' ? 'Bring back' : 'Drop'} onPress={drop} danger={task.status !== 'dropped'} />
        </View>
      </ScrollView>
      {picking ? <ProjectPicker slug={project} onPick={(p) => { setProject(p); setPicking(false); }} /> : null}
      <SheetFooter>
        <View style={s.flex}><ProjectChip slug={project} open={picking} onToggle={() => setPicking((v) => !v)} /></View>
        <PrimaryButton label={dirty ? 'Save' : 'Done'} onPress={dirty ? save : dismiss} disabled={dirty && !canSave} />
      </SheetFooter>
    </>
  );
}

const s = StyleSheet.create({
  scroll: { flexShrink: 1 },
  notes: { minHeight: 72 },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  days: { gap: 8, paddingHorizontal: 0 },
  flex: { flex: 1, alignItems: 'flex-start' },
});
