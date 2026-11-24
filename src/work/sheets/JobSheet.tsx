import { type Href, router } from 'expo-router';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { lightTap } from '@/components/Glass';
import { ApiError } from '@/lib/api';
import { DEMO } from '@/lib/demo';
import { C, F } from '@/theme';
import { workApi } from '../api';
import { closeSheet, openSheet } from '../bus';
import { includedOf, useFanProjects, useOrca, useProjectHome, useWorkHome, useWorkNotice, work } from '../store';
import type { Engine, EngineHealth, Idea, Perm, ProjectCard, Task } from '../types';
import { appendText, useDictation } from '../voice';
import { DictationLine, MicButton, ProjectChip, ProjectPicker, shortPath, startFolder } from './parts';
import { Chip, Glyph, Press, PrimaryButton, Segmented, SectionLabel, Sheet, SheetFooter, SheetHeader, sheetStyles } from './Sheet';

// New job: Claude or Codex as two big buttons, the idea and tasks it carries as chips, Additional context (the mic
// adds to it), the folder it starts in (tap for the project's other folders), and the permission mode. The engines'
// logins are checked first (GET /engines/health): Start stays off while the chosen one can't run, with its reason.
// Start opens the job's thread at once. With Orca up on the PC it can run there instead, as an Orca terminal, so the
// job shows in Orca too and he can follow it from either place; Orca's own permission settings apply then.

const ENGINES: { key: Engine; name: string }[] = [{ key: 'claude', name: 'Claude' }, { key: 'codex', name: 'Codex' }];
const PERMS: { value: Perm; label: string }[] = [{ value: 'ask', label: 'Ask' }, { value: 'edits', label: 'Edits' }, { value: 'auto', label: 'Auto' }];
const PERM_NOTE: Record<Perm, string> = {
  ask: 'Asks you before it edits a file or runs a command.',
  edits: 'Edits files on its own. Asks before running commands.',
  auto: 'Edits files and runs commands without asking.',
};
type Where = 'orca' | 'app';
const WHERE: { value: Where; label: string }[] = [{ value: 'orca', label: 'Orca' }, { value: 'app', label: 'App' }];
// the last choices, so the next job starts the way the last one did (this app run)
const last: { engine: Engine; perm: Perm; where: Where } = { engine: 'claude', perm: 'ask', where: 'orca' };
const remember = (engine: Engine, perm: Perm, where: Where) => { last.engine = engine; last.perm = perm; last.where = where; };

/** An Orca job's first message, laid out like the app's own job prompt. Orca opens it in the folder already. */
export function orcaPrompt(p: { project: Pick<ProjectCard, 'name'> | null; tasks: Task[]; idea: Idea | null; context: string }) {
  const lines: string[] = [];
  if (p.project) lines.push(`Project: ${p.project.name}.`);
  if (p.tasks.length) {
    lines.push('', p.tasks.length === 1 ? 'Task:' : 'Tasks:');
    p.tasks.forEach((t, i) => lines.push(`${p.tasks.length > 1 ? `${i + 1}. ` : ''}${t.title}${t.notes ? `\n   ${t.notes.replace(/\n/g, '\n   ')}` : ''}`));
  }
  if (p.idea) lines.push('', `Idea: ${p.idea.title}${p.idea.body ? `\n${p.idea.body}` : ''}`);
  if (p.context) lines.push('', p.tasks.length || p.idea ? `Additional context:\n${p.context}` : p.context);
  lines.push('', 'When you finish, reply with a short summary of what you did, the files you changed, and anything left for me.');
  return lines.join('\n').trim();
}

type Health = { s: 'loading' } | { s: 'ok'; h: EngineHealth } | { s: 'error'; status: number; message: string };
function useHealth() {
  const [health, setHealth] = useState<Health>({ s: 'loading' });
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let alive = true;
    const at = new Date().toISOString();
    const run = DEMO
      ? Promise.resolve<EngineHealth>({ claude: { ok: true, detail: null, checkedAt: at }, codex: { ok: true, detail: null, checkedAt: at } })
      : workApi.health();
    run.then((h) => { if (alive) setHealth({ s: 'ok', h }); })
      .catch((e) => { if (alive) setHealth({ s: 'error', status: e instanceof ApiError ? e.status : 0, message: (e as Error).message }); });
    return () => { alive = false; };
  }, [nonce]);
  return { health, retry: () => { setHealth({ s: 'loading' }); setNonce((n) => n + 1); } };
}

export function JobSheet(props: { project: string | null; text?: string; idea?: string | null; tasks?: string[] }) {
  return (
    <Sheet label="New job">
      <JobBody {...props} />
    </Sheet>
  );
}

function JobBody({ project: initial, text, idea, tasks }: { project: string | null; text?: string; idea?: string | null; tasks?: string[] }) {
  const projects = useFanProjects();
  const notice = useWorkNotice();
  const orca = useOrca();
  const { health, retry } = useHealth();
  const [engine, setEngine] = useState<Engine>(last.engine);
  const [perm, setPerm] = useState<Perm>(last.perm);
  const [whereRaw, setWhere] = useState<Where>(last.where);
  const [project, setProject] = useState(initial);
  const [picking, setPicking] = useState(false);
  const [context, setContext] = useState(text ?? '');
  const [ideaId, setIdeaId] = useState(idea ?? null);
  const [taskIds, setTaskIds] = useState(tasks ?? []);
  const [folderPick, setFolderPick] = useState<string | null>(null);
  const [choosingFolder, setChoosingFolder] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const latest = useRef(context);
  useLayoutEffect(() => { latest.current = context; });
  const dict = useDictation((words) => setContext(appendText(latest.current, words)));

  const card = project ? projects?.find((p) => p.slug === project) ?? null : null;
  const folders = card?.folders ?? [];
  const folder = folders.find((f) => f.path === folderPick) ?? startFolder(card);

  const state = (e: Engine): 'checking' | 'ready' | 'broken' | 'unknown' =>
    health.s === 'loading' ? 'checking' : health.s === 'error' ? 'unknown' : health.h[e]?.ok ? 'ready' : 'broken';
  const chosen = state(engine);
  // a PC without the health route yet still starts jobs; one that can't be reached can't
  const engineOk = chosen === 'ready' || (chosen === 'unknown' && health.s === 'error' && health.status !== 0);
  const hasWork = !!(context.trim() || ideaId || taskIds.length);
  const canStart = engineOk && !!folder && hasWork && dict.state === 'idle' && !busy;
  // Orca is a choice only while it answers on the PC; otherwise the job runs in the app.
  const orcaUp = !!orca.data?.up;
  const where: Where = orcaUp ? whereRaw : 'app';

  const start = async () => {
    if (!canStart || !folder) return;
    remember(engine, perm, orcaUp ? whereRaw : last.where);
    setBusy(true); setFailed(false);
    if (where === 'orca') {
      const inc = includedOf(project, ideaId, taskIds);
      if ((ideaId && !inc.idea) || inc.tasks.some((t) => !t)) {
        setBusy(false); setFailed(true);
        work.notify('The phone hasn’t loaded that idea or task yet. Start it in the app, or try again in a moment.');
        return;
      }
      const agent = await work.launchInOrca({
        agent: engine, folder: folder.path,
        prompt: orcaPrompt({ project: card, tasks: inc.tasks as Task[], idea: inc.idea, context: context.trim() }),
      });
      setBusy(false);
      if (agent === undefined) { setFailed(true); return; }
      closeSheet();
      if (agent) router.push(`/work/orca/${agent.id}` as Href);
      else work.notify('Started in Orca. It shows under Live in a few seconds.');
      return;
    }
    const job = await work.startJob({
      engine, project, perm, folder: folder.path,
      context: context.trim() || undefined, idea: ideaId ?? undefined, tasks: taskIds.length ? taskIds : undefined,
    });
    setBusy(false);
    if (!job) { setFailed(true); return; }
    closeSheet();
    router.push(`/work/job/${job.id}` as Href);
  };

  return (
    <>
      <SheetHeader title="New job" />
      <ScrollView style={s.scroll} contentContainerStyle={[sheetStyles.pad, { gap: 16, paddingTop: 4 }]} keyboardShouldPersistTaps="handled">
        <View style={{ gap: 8 }}>
          <View style={s.engines} accessibilityRole="radiogroup" accessibilityLabel="Engine">
            {ENGINES.map((e) => {
              const st = state(e.key);
              const on = engine === e.key;
              return (
                <Press key={e.key} label={`${e.name}. ${st === 'ready' ? 'Ready' : st === 'broken' ? 'Not ready' : st === 'checking' ? 'Checking' : 'Not checked'}`}
                  selected={on} onPress={() => setEngine(e.key)} style={[s.engine, on && s.engineOn]}>
                  <Text style={s.engineName}>{e.name}</Text>
                  <Text style={[s.engineSub, st === 'broken' && { color: C.danger }]}>
                    {st === 'ready' ? 'Ready' : st === 'broken' ? 'Not ready' : st === 'checking' ? 'Checking' : 'Not checked'}
                  </Text>
                </Press>
              );
            })}
          </View>
          <HealthLine health={health} engine={engine} onRetry={retry} />
        </View>

        {ideaId || taskIds.length ? (
          <Included project={project} idea={ideaId} tasks={taskIds}
            onDropIdea={() => setIdeaId(null)} onDropTask={(id) => setTaskIds((l) => l.filter((x) => x !== id))} />
        ) : null}

        <View style={{ gap: 8 }}>
          <SectionLabel>{ideaId || taskIds.length ? 'Additional context' : 'What should it do?'}</SectionLabel>
          <View style={[sheetStyles.box, s.contextBox]}>
            <TextInput value={context} onChangeText={setContext} multiline placeholder={ideaId || taskIds.length ? 'Anything it should know' : 'Describe the job'}
              placeholderTextColor={C.faint} style={s.context} accessibilityLabel="Additional context" />
            <View style={s.contextMic}><MicButton d={dict} size={36} /></View>
          </View>
          <DictationLine d={dict} />
        </View>

        <View style={{ gap: 8 }}>
          <SectionLabel>Starts in</SectionLabel>
          {!project ? (
            <Text style={sheetStyles.note}>Pick a project below. The job runs in its folder.</Text>
          ) : projects === null ? (
            <View style={s.inline}><ActivityIndicator size="small" color={C.muted} /><Text style={sheetStyles.note}>Loading the project</Text></View>
          ) : !folder ? (
            <View style={s.inline}>
              <Text style={[sheetStyles.note, { flex: 1 }]}>This project has no folder yet.</Text>
              <Pressable accessibilityRole="button" hitSlop={8} onPress={() => { lightTap(); openSheet({ kind: 'projectSettings', project }); }}>
                <Text style={s.link}>Link a folder</Text>
              </Pressable>
            </View>
          ) : (
            <>
              {folders.length > 1 ? (
                <Press label={`Starts in ${folder.label}, ${shortPath(folder.path)}. Change`} onPress={() => setChoosingFolder((v) => !v)}
                  selected={choosingFolder} style={[sheetStyles.box, s.folder]}>
                  <FolderText label={folder.label} path={folder.path} />
                  <Glyph name="chevron.up.chevron.down" size={14} color={C.muted} alt="⇅" />
                </Press>
              ) : (
                <View style={[sheetStyles.box, s.folder]} accessible accessibilityLabel={`Starts in ${folder.label}, ${shortPath(folder.path)}`}>
                  <FolderText label={folder.label} path={folder.path} />
                </View>
              )}
              {choosingFolder ? (
                <Animated.View entering={FadeIn.duration(160)} style={[sheetStyles.box, { paddingVertical: 4 }]}>
                  {folders.map((f, i) => (
                    <Pressable key={f.path} accessibilityRole="radio" accessibilityState={{ checked: f.path === folder.path }}
                      onPress={() => { lightTap(); setFolderPick(f.path); setChoosingFolder(false); }}
                      style={({ pressed }) => [s.folderOpt, i > 0 && s.folderLine, pressed && { backgroundColor: 'rgba(255,255,255,0.06)' }]}>
                      <FolderText label={f.label} path={f.path} />
                      {f.path === folder.path ? <Glyph name="checkmark" size={14} alt="✓" /> : null}
                    </Pressable>
                  ))}
                </Animated.View>
              ) : null}
            </>
          )}
        </View>

        {orcaUp ? (
          <View style={{ gap: 8 }}>
            <SectionLabel>Runs in</SectionLabel>
            <Segmented options={WHERE} value={where} onChange={setWhere} label="Where the job runs" />
            <Text style={sheetStyles.note}>
              {where === 'orca'
                ? 'Shows in Orca on your PC too, and takes replies from here. Permission prompts get answered in Orca.'
                : 'Permission questions come to your phone. It won’t show in Orca.'}
            </Text>
          </View>
        ) : null}

        {where === 'app' ? (
          <View style={{ gap: 8 }}>
            <SectionLabel>Permissions</SectionLabel>
            <Segmented options={PERMS} value={perm} onChange={setPerm} label="Permission mode" />
            <Text style={sheetStyles.note}>{PERM_NOTE[perm]}</Text>
          </View>
        ) : null}

        {failed ? <Text style={sheetStyles.error}>{notice ?? 'Couldn’t start the job. Try again.'}</Text> : null}
      </ScrollView>
      {picking ? <ProjectPicker slug={project} allowInbox={false} onPick={(p) => { setProject(p); setFolderPick(null); setChoosingFolder(false); setPicking(false); }} /> : null}
      <SheetFooter>
        <View style={s.flex}><ProjectChip slug={project} open={picking} onToggle={() => setPicking((v) => !v)} /></View>
        <PrimaryButton label="Start" onPress={start} disabled={!canStart} busy={busy} />
      </SheetFooter>
    </>
  );
}

function FolderText({ label, path }: { label: string; path: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={s.folderLabel} numberOfLines={1}>{label}</Text>
      <Text style={s.folderPath} numberOfLines={1} ellipsizeMode="middle">{shortPath(path)}</Text>
    </View>
  );
}

function HealthLine({ health, engine, onRetry }: { health: Health; engine: Engine; onRetry: () => void }) {
  const name = engine === 'claude' ? 'Claude' : 'Codex';
  const again = (
    <Pressable accessibilityRole="button" hitSlop={8} onPress={() => { lightTap(); onRetry(); }}><Text style={s.link}>Check again</Text></Pressable>
  );
  if (health.s === 'loading') return <Text style={sheetStyles.note}>Checking the {name} login on your PC</Text>;
  if (health.s === 'error') {
    if (health.status === 0) return <View style={s.inline}><Text style={[sheetStyles.error, { flex: 1 }]}>{health.message}</Text>{again}</View>;
    return (
      <View style={s.inline}>
        <Text style={[sheetStyles.note, { flex: 1 }]}>Couldn’t check the {name} login, so the job may fail to start.</Text>
        {again}
      </View>
    );
  }
  const e = health.h[engine];
  if (e?.ok) return null;
  return (
    <View style={s.inline}>
      <Text style={[sheetStyles.error, { flex: 1 }]}>{e?.detail ? `${name} can’t start: ${e.detail}` : `${name} can’t start on your PC right now.`}</Text>
      {again}
    </View>
  );
}

/** The idea and tasks the job carries, as chips. Tap one to leave it out. */
function Included(p: { project: string | null; idea: string | null; tasks: string[]; onDropIdea: () => void; onDropTask: (id: string) => void }) {
  return p.project ? <IncludedInProject {...p} project={p.project} /> : <IncludedInInbox {...p} />;
}
function IncludedInProject(p: { project: string; idea: string | null; tasks: string[]; onDropIdea: () => void; onDropTask: (id: string) => void }) {
  const { slot } = useProjectHome(p.project);
  return <IncludedChips {...p} ideas={slot.data?.ideas ?? []} taskRows={slot.data?.tasks ?? []} />;
}
function IncludedInInbox(p: { idea: string | null; tasks: string[]; onDropIdea: () => void; onDropTask: (id: string) => void }) {
  const home = useWorkHome();
  return <IncludedChips {...p} ideas={home.data?.inbox.ideas ?? []} taskRows={home.data?.inbox.tasks ?? []} />;
}
function IncludedChips({ idea, tasks, ideas, taskRows, onDropIdea, onDropTask }: {
  idea: string | null; tasks: string[]; ideas: { id: string; title: string }[]; taskRows: { id: string; title: string }[];
  onDropIdea: () => void; onDropTask: (id: string) => void;
}) {
  const x = <Glyph name="xmark" size={10} color={C.muted} alt="×" />;
  return (
    <View style={{ gap: 8 }}>
      <SectionLabel>Included</SectionLabel>
      <View style={s.chips}>
        {idea ? <Chip label={ideas.find((i) => i.id === idea)?.title ?? 'Idea'} trailing={x} onPress={onDropIdea} a11y="Idea included. Tap to leave it out" /> : null}
        {tasks.map((id) => (
          <Chip key={id} label={taskRows.find((t) => t.id === id)?.title ?? 'Task'} trailing={x} onPress={() => onDropTask(id)} a11y="Task included. Tap to leave it out" />
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  scroll: { flexShrink: 1 },
  engines: { flexDirection: 'row', gap: 8 },
  engine: {
    flex: 1, height: 72, borderRadius: 16, borderCurve: 'continuous', paddingHorizontal: 16, justifyContent: 'center', gap: 2,
    backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1.5, borderColor: 'transparent',
  },
  engineOn: { backgroundColor: 'rgba(255,255,255,0.12)', borderColor: 'rgba(255,255,255,0.7)' },
  engineName: { fontFamily: F.semibold, fontSize: 18, lineHeight: 24, color: C.text },
  engineSub: { fontFamily: F.medium, fontSize: 14, lineHeight: 20, color: C.muted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  contextBox: { minHeight: 104, paddingLeft: 12, paddingRight: 48, paddingVertical: 8 },
  context: { fontFamily: F.regular, fontSize: 16, lineHeight: 24, color: C.text, minHeight: 88, maxHeight: 180, paddingVertical: 0, textAlignVertical: 'top' },
  contextMic: { position: 'absolute', right: 8, bottom: 8 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  link: { fontFamily: F.semibold, fontSize: 14, lineHeight: 20, color: C.text },
  folder: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 8 },
  folderOpt: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 8 },
  folderLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.10)' },
  folderLabel: { fontFamily: F.semibold, fontSize: 16, lineHeight: 24, color: C.text },
  folderPath: { fontFamily: F.regular, fontSize: 14, lineHeight: 20, color: C.faint },
  flex: { flex: 1, alignItems: 'flex-start' },
});
