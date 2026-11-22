import { type Href, router, usePathname } from 'expo-router';
import { type ComponentRef, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { C, F } from '@/theme';
import { useFanProjects, work } from '../store';
import type { Folder, ProjectCard } from '../types';
import { useFocusNextFrame } from './IdeaSheet';
import { FolderEditor, finalFolders } from './parts';
import { PrimaryButton, SecondaryButton, Sheet, SheetFooter, SheetHeader, sheetStyles, useSheet } from './Sheet';

// New project (name and folders; the first folder is where jobs start) and Project settings (rename, folders, pin,
// archive). Folders come from the PC's recent session folders or a pasted path, and can be relabelled, moved up or
// removed. Settings save with work.patchProject; archiving asks first.

export function NewProjectSheet({ name }: { name?: string }) {
  return (
    <Sheet label="New project">
      <NewProjectBody name={name} />
    </Sheet>
  );
}

function NewProjectBody({ name: initial }: { name?: string }) {
  const { dismiss } = useSheet();
  const [name, setName] = useState(initial ?? '');
  const [folders, setFolders] = useState<Folder[]>([]);
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<ComponentRef<typeof TextInput>>(null);
  useFocusNextFrame(nameRef);

  const canSave = !!name.trim() && !busy;
  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    const p = await work.createProject(name.trim(), finalFolders(folders));
    // offline, it exists only on the phone for now (the store queued it): stay where he is
    dismiss(() => { if (!p.slug.startsWith('tmp-')) router.push(`/work/${p.slug}` as Href); });
  };

  return (
    <>
      <SheetHeader title="New project" />
      <ScrollView style={s.scroll} contentContainerStyle={[sheetStyles.pad, { gap: 16, paddingTop: 4 }]} keyboardShouldPersistTaps="handled">
        <TextInput ref={nameRef} value={name} onChangeText={setName} placeholder="Project name" placeholderTextColor={C.faint}
          style={sheetStyles.titleField} returnKeyType="done" accessibilityLabel="Project name" maxLength={60} />
        <FolderEditor folders={folders} onChange={setFolders} />
      </ScrollView>
      <SheetFooter>
        <Text style={[sheetStyles.note, { flex: 1 }]} numberOfLines={2}>
          {folders.length ? `Jobs start in ${folders[0].label || 'the first folder'}.` : 'Folders can be added later.'}
        </Text>
        <PrimaryButton label="Create" onPress={save} disabled={!canSave} busy={busy} />
      </SheetFooter>
    </>
  );
}

export function ProjectSettingsSheet({ project }: { project: string }) {
  return (
    <Sheet label="Project settings">
      <SettingsGate slug={project} />
    </Sheet>
  );
}

/** The project card comes from the hub's list; until it is there, a loading or missing state. */
function SettingsGate({ slug }: { slug: string }) {
  const projects = useFanProjects();
  const card = projects?.find((p) => p.slug === slug) ?? null;
  if (card) return <SettingsBody card={card} />;
  return (
    <>
      <SheetHeader title="Project settings" />
      <View style={[sheetStyles.pad, s.state]}>
        {projects === null ? (
          <><ActivityIndicator size="small" color={C.muted} /><Text style={sheetStyles.note}>Loading the project</Text></>
        ) : (
          <Text style={sheetStyles.note}>This project isn’t on your PC anymore. It may have been archived.</Text>
        )}
      </View>
    </>
  );
}

function SettingsBody({ card }: { card: ProjectCard }) {
  const { dismiss } = useSheet();
  const path = usePathname();
  const [name, setName] = useState(card.name);
  const [folders, setFolders] = useState<Folder[]>(card.folders);
  const [pinned, setPinned] = useState(card.pinned);
  const [confirming, setConfirming] = useState(false);

  const sameFolders = folders.length === card.folders.length
    && folders.every((f, i) => f.path === card.folders[i].path && f.label === card.folders[i].label);
  const changed = name.trim() !== card.name || pinned !== card.pinned || !sameFolders;
  const canSave = changed && !!name.trim();

  const save = () => {
    if (!canSave) return;
    void work.patchProject(card.slug, {
      ...(name.trim() !== card.name ? { name: name.trim() } : {}),
      ...(pinned !== card.pinned ? { pinned } : {}),
      ...(!sameFolders ? { folders: finalFolders(folders) } : {}),
    });
    dismiss();
  };
  const archive = () => {
    void work.patchProject(card.slug, { status: 'archived' });
    // on the archived project's own page, go back to the hub
    dismiss(() => { if (path === `/work/${card.slug}`) router.replace('/work' as Href); });
  };

  return (
    <>
      <SheetHeader title="Project settings" sub={card.name} />
      <ScrollView style={s.scroll} contentContainerStyle={[sheetStyles.pad, { gap: 16, paddingTop: 4 }]} keyboardShouldPersistTaps="handled">
        <View style={{ gap: 8 }}>
          <Text style={s.label}>Name</Text>
          <TextInput value={name} onChangeText={setName} placeholder="Project name" placeholderTextColor={C.faint}
            style={[sheetStyles.box, s.nameField]} returnKeyType="done" accessibilityLabel="Project name" maxLength={60} />
        </View>
        <FolderEditor folders={folders} onChange={setFolders} />
        <View style={[sheetStyles.box, s.row]}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={s.rowTitle}>Pin to the top</Text>
            <Text style={sheetStyles.note}>Pinned projects come first in the fan and the hub.</Text>
          </View>
          <Switch value={pinned} onValueChange={setPinned} accessibilityLabel="Pin to the top" />
        </View>
        {confirming ? (
          <Animated.View entering={FadeIn.duration(160)} style={[sheetStyles.box, s.confirm]}>
            <Text style={s.rowTitle}>Archive {card.name}?</Text>
            <Text style={sheetStyles.note}>It leaves the fan and the hub. Its ideas, tasks and jobs are kept.</Text>
            <View style={s.confirmRow}>
              <SecondaryButton label="Keep it" onPress={() => setConfirming(false)} />
              <PrimaryButton label="Archive" tone="danger" onPress={archive} />
            </View>
          </Animated.View>
        ) : (
          <View style={{ alignItems: 'flex-start' }}>
            <SecondaryButton label="Archive project" danger onPress={() => setConfirming(true)} />
          </View>
        )}
      </ScrollView>
      <SheetFooter>
        <View style={{ flex: 1 }} />
        <PrimaryButton label="Save" onPress={save} disabled={!canSave} />
      </SheetFooter>
    </>
  );
}

const s = StyleSheet.create({
  scroll: { flexShrink: 1 },
  state: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 64 },
  label: { fontFamily: F.medium, fontSize: 14, lineHeight: 20, color: C.muted },
  nameField: { height: 44, paddingHorizontal: 12, fontFamily: F.medium, fontSize: 16, color: C.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  rowTitle: { fontFamily: F.semibold, fontSize: 16, lineHeight: 24, color: C.text },
  confirm: { padding: 12, gap: 8 },
  confirmRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, paddingTop: 4 },
});
