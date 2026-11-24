import { useLayoutEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { C, F } from '@/theme';
import { openSheet } from '../bus';
import { work } from '../store';
import type { Idea } from '../types';
import { ago } from '../ui/format';
import { appendText, useDictation } from '../voice';
import { DictationLine, MicButton, ProjectChip, ProjectPicker } from './parts';
import { PrimaryButton, SecondaryButton, SectionLabel, Sheet, SheetFooter, SheetHeader, sheetStyles, useSheet } from './Sheet';

// An idea, opened from a list: edit its title and detail (the mic adds to the detail), move it to another project or
// the Inbox, and act on it: start a job that carries it, turn it into a task, or archive it. Save keeps the edits.

const STATUS: Record<Idea['status'], string> = { open: 'Open', tasked: 'Made a task', jobbed: 'A job carried it', archived: 'Archived' };

export function EditIdeaSheet({ idea }: { idea: Idea }) {
  return (
    <Sheet label="Idea">
      <Body idea={idea} />
    </Sheet>
  );
}

function Body({ idea }: { idea: Idea }) {
  const { dismiss } = useSheet();
  const [title, setTitle] = useState(idea.title);
  const [body, setBody] = useState(idea.body ?? '');
  const [project, setProject] = useState(idea.project);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);

  const latest = useRef(body);
  useLayoutEffect(() => { latest.current = body; });
  const dict = useDictation((words) => setBody(appendText(latest.current, words)));

  const patch = {
    ...(title.trim() !== idea.title ? { title: title.trim() } : {}),
    ...(body.trim() !== (idea.body ?? '') ? { body: body.trim() } : {}),
    ...(project !== idea.project ? { project } : {}),
  };
  const dirty = Object.keys(patch).length > 0;
  const canSave = !!title.trim() && dict.state === 'idle';

  /** Keep the edits first, so whatever happens next works on the idea as he sees it. */
  const keep = () => (dirty ? work.patchIdea(idea.id, patch) : Promise.resolve(null));
  const save = () => { if (!canSave) return; void keep(); dismiss(); };
  const startJob = () => { void keep(); openSheet({ kind: 'job', project, idea: idea.id }); };
  const makeTask = async () => {
    setBusy(true);
    await keep();
    const ok = await work.ideaToTask(idea.id);
    setBusy(false);
    if (ok) { work.notify('Made a task from the idea.'); dismiss(); }
  };
  const archive = () => {
    void work.patchIdea(idea.id, { ...patch, status: idea.status === 'archived' ? 'open' : 'archived' });
    work.notify(idea.status === 'archived' ? 'Idea back in the list.' : 'Idea archived.');
    dismiss();
  };

  return (
    <>
      <SheetHeader title="Idea" sub={`${STATUS[idea.status]} · ${ago(idea.createdAt)}${idea.source && idea.source !== 'app' ? ` · from ${idea.source}` : ''}`} />
      <ScrollView style={s.scroll} contentContainerStyle={[sheetStyles.pad, { gap: 4 }]} keyboardShouldPersistTaps="handled">
        <TextInput value={title} onChangeText={setTitle} placeholder="What's the idea?" placeholderTextColor={C.faint}
          style={sheetStyles.titleField} accessibilityLabel="Idea" maxLength={300} multiline />
        <TextInput value={body} onChangeText={setBody} placeholder="Add detail" placeholderTextColor={C.faint} multiline
          style={[sheetStyles.bodyField, s.body]} accessibilityLabel="Detail" scrollEnabled />
        <DictationLine d={dict} />
        <View style={s.actions}>
          <SectionLabel>Do with it</SectionLabel>
          <View style={s.row}>
            <PrimaryButton label="Start a job" onPress={startJob} disabled={!title.trim()} />
            {idea.status === 'open' ? <SecondaryButton label="Make a task" onPress={makeTask} disabled={busy} /> : null}
            <SecondaryButton label={idea.status === 'archived' ? 'Unarchive' : 'Archive'} onPress={archive} />
          </View>
          {idea.status === 'tasked' ? <Text style={s.note}>This idea is already a task. Starting a job still carries it.</Text> : null}
        </View>
      </ScrollView>
      {picking ? <ProjectPicker slug={project} onPick={(p) => { setProject(p); setPicking(false); }} /> : null}
      <SheetFooter>
        <MicButton d={dict} />
        <View style={s.flex}><ProjectChip slug={project} open={picking} onToggle={() => setPicking((v) => !v)} /></View>
        <PrimaryButton label={dirty ? 'Save' : 'Done'} onPress={dirty ? save : dismiss} disabled={dirty && !canSave} />
      </SheetFooter>
    </>
  );
}

const s = StyleSheet.create({
  scroll: { flexShrink: 1 },
  body: { minHeight: 96 },
  actions: { gap: 8, paddingTop: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  note: { fontFamily: F.regular, fontSize: 13, lineHeight: 18, color: C.faint },
  flex: { flex: 1, alignItems: 'flex-start' },
});
