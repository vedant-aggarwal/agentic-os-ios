import { type ComponentRef, type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { C } from '@/theme';
import { work } from '../store';
import { appendText, useDictation } from '../voice';
import { DictationLine, MicButton, ProjectChip, ProjectPicker } from './parts';
import { PrimaryButton, Sheet, SheetFooter, SheetHeader, sheetStyles, useSheet } from './Sheet';

// New idea: the title is focused the frame after the sheet shows, an optional detail, a mic that adds what he says,
// and the project chip (prefilled from where it was opened; Inbox when cleared). Save files it with work.addIdea.

export function IdeaSheet({ project, text }: { project: string | null; text?: string }) {
  return (
    <Sheet label="New idea" dragAll>
      <IdeaBody project={project} text={text} />
    </Sheet>
  );
}

function IdeaBody({ project: initial, text }: { project: string | null; text?: string }) {
  const { dismiss } = useSheet();
  const [project, setProject] = useState(initial);
  const [picking, setPicking] = useState(false);
  const [title, setTitle] = useState(text ?? '');
  const [body, setBody] = useState('');
  const titleRef = useRef<ComponentRef<typeof TextInput>>(null);
  useFocusNextFrame(titleRef);

  // dictated words go to the title while it is empty, else after the detail
  const latest = useRef({ title, body });
  useLayoutEffect(() => { latest.current = { title, body }; });
  const dict = useDictation((words) => {
    const now = latest.current;
    if (now.title.trim()) { setBody(appendText(now.body, words)); return; }
    const [head, rest] = headAndRest(words);
    setTitle(head);
    if (rest) setBody(appendText(now.body, rest));
  });

  const canSave = !!(title.trim() || body.trim()) && dict.state === 'idle';
  const save = () => {
    if (!canSave) return;
    void work.addIdea(project, title.trim(), body.trim() || undefined, 'app');
    dismiss();
  };

  return (
    <>
      <SheetHeader title="New idea" />
      <View style={[sheetStyles.pad, { gap: 4 }]}>
        <TextInput ref={titleRef} value={title} onChangeText={setTitle} placeholder="What's the idea?" placeholderTextColor={C.faint}
          style={sheetStyles.titleField} returnKeyType="done" onSubmitEditing={save}
          accessibilityLabel="Idea" maxLength={300} />
        <TextInput value={body} onChangeText={setBody} placeholder="Add detail" placeholderTextColor={C.faint} multiline
          style={sheetStyles.bodyField} accessibilityLabel="Detail" scrollEnabled />
        <DictationLine d={dict} />
      </View>
      {picking ? <ProjectPicker slug={project} onPick={(p) => { setProject(p); setPicking(false); }} /> : null}
      <SheetFooter>
        <MicButton d={dict} />
        <View style={s.flex}><ProjectChip slug={project} open={picking} onToggle={() => setPicking((v) => !v)} /></View>
        <PrimaryButton label="Save" onPress={save} disabled={!canSave} />
      </SheetFooter>
    </>
  );
}

/** A long dictation: its first sentence (at most 100 characters) as the title, the rest as the detail. */
function headAndRest(words: string): [string, string] {
  const t = words.trim().replace(/\s+/g, ' ');
  if (t.length <= 100) return [t, ''];
  const m = t.match(/^.+?[.!?](?=\s|$)/);
  const head = m && m[0].length <= 100 ? m[0] : t.slice(0, 100).replace(/\s+\S*$/, '');
  return [head, t.slice(head.length).trim()];
}

/** Focus a field one frame after mount, so the sheet is drawn before the keyboard starts to rise. */
export function useFocusNextFrame(ref: RefObject<ComponentRef<typeof TextInput> | null>) {
  useEffect(() => {
    const id = requestAnimationFrame(() => ref.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [ref]);
}

const s = StyleSheet.create({ flex: { flex: 1, alignItems: 'flex-start' } });
