import { type ComponentRef, useRef, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { C } from '@/theme';
import { work } from '../store';
import { useFocusNextFrame } from './IdeaSheet';
import { ProjectChip, ProjectPicker } from './parts';
import { Chip, PrimaryButton, Sheet, SheetFooter, SheetHeader, sheetStyles, useSheet } from './Sheet';

// New task: title (focused the frame after the sheet shows), an optional due day (Today, Tomorrow, or a day picked
// from the next three weeks), the project chip. Save files it with work.addTask. Due is a plain date in phone time.

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayAt = (offset: number) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + offset); return d; };
const dayLabel = (d: Date) => d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });

export function TaskSheet({ project, text }: { project: string | null; text?: string }) {
  return (
    <Sheet label="New task" dragAll>
      <TaskBody project={project} text={text} />
    </Sheet>
  );
}

function TaskBody({ project: initial, text }: { project: string | null; text?: string }) {
  const { dismiss } = useSheet();
  const [project, setProject] = useState(initial);
  const [picking, setPicking] = useState(false);
  const [title, setTitle] = useState(text ?? '');
  const [due, setDue] = useState<string | null>(null);
  const [choosingDay, setChoosingDay] = useState(false);
  const titleRef = useRef<ComponentRef<typeof TextInput>>(null);
  useFocusNextFrame(titleRef);

  const [today] = useState(() => ymd(dayAt(0)));
  const [tomorrow] = useState(() => ymd(dayAt(1)));
  const [later] = useState(() => Array.from({ length: 21 }, (_, i) => dayAt(i + 2)));
  const picked = due && due !== today && due !== tomorrow ? later.find((d) => ymd(d) === due) ?? null : null;
  const toggle = (v: string) => { setDue((cur) => (cur === v ? null : v)); setChoosingDay(false); };

  const canSave = !!title.trim();
  const save = () => {
    if (!canSave) return;
    void work.addTask(project, title.trim(), due);
    dismiss();
  };

  return (
    <>
      <SheetHeader title="New task" />
      <View style={[sheetStyles.pad, { gap: 12 }]}>
        <TextInput ref={titleRef} value={title} onChangeText={setTitle} placeholder="What needs doing?" placeholderTextColor={C.faint}
          style={sheetStyles.titleField} returnKeyType="done" onSubmitEditing={save} accessibilityLabel="Task" maxLength={300} />
        <View style={s.row} accessibilityLabel="Due">
          <Chip label="Today" selected={due === today} onPress={() => toggle(today)} a11y="Due today" />
          <Chip label="Tomorrow" selected={due === tomorrow} onPress={() => toggle(tomorrow)} a11y="Due tomorrow" />
          <Chip label={picked ? dayLabel(picked) : 'Pick a day'} selected={!!picked || choosingDay}
            a11y={picked ? `Due ${dayLabel(picked)}. Change` : 'Pick a due day'}
            onPress={() => setChoosingDay((v) => !v)} />
        </View>
      </View>
      {choosingDay ? (
        <Animated.View entering={FadeIn.duration(160)} style={{ paddingTop: 12 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={s.days}>
            {later.map((d) => (
              <Chip key={ymd(d)} label={dayLabel(d)} selected={due === ymd(d)} a11y={`Due ${dayLabel(d)}`}
                onPress={() => { setDue(due === ymd(d) ? null : ymd(d)); setChoosingDay(false); }} />
            ))}
          </ScrollView>
        </Animated.View>
      ) : null}
      {picking ? <ProjectPicker slug={project} onPick={(p) => { setProject(p); setPicking(false); }} /> : null}
      <SheetFooter>
        <View style={s.flex}><ProjectChip slug={project} open={picking} onToggle={() => setPicking((v) => !v)} /></View>
        <PrimaryButton label="Save" onPress={save} disabled={!canSave} />
      </SheetFooter>
    </>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  days: { gap: 8, paddingHorizontal: 16 },
  flex: { flex: 1, alignItems: 'flex-start' },
});
