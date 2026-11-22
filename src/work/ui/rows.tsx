import { type GestureResponderEvent, StyleSheet, Text, View } from 'react-native';
import { C, F } from '@/theme';
import type { Idea, JobBrief, ProjectCard, RepoState, SessionBrief, Task } from '../types';
import {
  ago, countsLine, dueLabel, folderName, isWorking, plural, projectTone, sessionLine, STATUS_WORD,
} from './format';
import { BranchIcon, FolderIcon, IdeaIcon, MicIcon, PinIcon } from './icons';
import { LiveDot, type Tone } from './LiveDot';
import { Press } from './Press';
import { FAILED, LEAD, LIVE, NEEDS, T } from './tokens';

// Every list row in the hub: a 24 pt leading mark, a title with one line under it, and a right column for
// time and counts. Same height and columns as Today's task rows, so the two screens read as one app.

function Row({ lead, title, titleExtra, sub, subColor, right, rightSub, onPress, onLongPress, label, actions, onAction }: {
  lead: React.ReactNode; title: string; titleExtra?: React.ReactNode; sub?: string | null; subColor?: string;
  right?: string | null; rightSub?: React.ReactNode; onPress: () => void; onLongPress?: (e: GestureResponderEvent) => void;
  label?: string; actions?: { name: string; label: string }[]; onAction?: (name: string) => void;
}) {
  return (
    <Press onPress={onPress} onLongPress={onLongPress} accessibilityLabel={label ?? [title, sub, right].filter(Boolean).join(', ')}
      accessibilityActions={actions} onAccessibilityAction={onAction ? (e) => onAction(e.nativeEvent.actionName) : undefined}
      style={s.row}>
      <View style={s.lead}>{lead}</View>
      <View style={s.mid}>
        <View style={s.titleLine}>
          <Text numberOfLines={2} style={[T.row, s.title]}>{title}</Text>
          {titleExtra}
        </View>
        {sub ? <Text numberOfLines={1} style={[T.sub, subColor ? { color: subColor } : null]}>{sub}</Text> : null}
      </View>
      {right || rightSub ? (
        <View style={s.right}>
          {right ? <Text numberOfLines={1} style={[T.meta, s.rightText]}>{right}</Text> : null}
          {rightSub}
        </View>
      ) : null}
    </Press>
  );
}

/** "+24 −9", green and red, for a job's changed lines. */
export function Diff({ add, del }: { add: number; del: number }) {
  return (
    <View style={s.diff} accessibilityLabel={`${add} lines added, ${del} removed`}>
      <Text style={[T.meta, { color: LIVE }]}>+{add}</Text>
      <Text style={[T.meta, { color: FAILED }]}>{'−'}{del}</Text>
    </View>
  );
}

export function ProjectRow({ project, onPress, onLongPress, onAction }: {
  project: ProjectCard; onPress: () => void; onLongPress: (e: GestureResponderEvent) => void; onAction: (name: 'pin' | 'settings') => void;
}) {
  const tone = projectTone(project);
  const state = tone === 'needs' ? 'needs you' : tone === 'live' ? 'agent working' : null;
  return (
    <Row
      lead={tone ? <LiveDot tone={tone} /> : <View style={s.dotSpace} />}
      title={project.name}
      titleExtra={project.pinned ? <View style={s.pin}><PinIcon /></View> : null}
      sub={countsLine(project.counts)}
      right={ago(project.lastActiveAt)}
      onPress={onPress}
      onLongPress={onLongPress}
      label={[project.name, project.pinned ? 'pinned' : null, state, countsLine(project.counts)].filter(Boolean).join(', ')}
      actions={[{ name: 'pin', label: project.pinned ? 'Unpin' : 'Pin to top' }, { name: 'settings', label: 'Settings' }]}
      onAction={(n) => { if (n === 'pin' || n === 'settings') onAction(n); }}
    />
  );
}

function jobTone(j: JobBrief): Tone {
  if (isWorking(j.status)) return 'live';
  if (j.status === 'needs_input') return 'needs';
  if (j.status === 'failed') return 'failed';
  if (j.status === 'idle') return 'idle';
  return 'quiet';
}

/** A job. Live ones show their current step; finished ones their outcome. `where` replaces the age (the hub shows the project). */
export function JobRow({ job, where, onPress }: { job: JobBrief; where?: string | null; onPress: () => void }) {
  const tone = jobTone(job);
  const live = tone === 'live' || tone === 'needs';
  const sub = job.status === 'failed'
    ? job.error ?? STATUS_WORD.failed
    : live ? job.step ?? STATUS_WORD[job.status] : STATUS_WORD[job.status];
  return (
    <Row
      lead={<LiveDot tone={tone} pulse={tone === 'live'} />}
      title={job.title}
      sub={sub}
      subColor={job.status === 'failed' ? FAILED : job.status === 'needs_input' ? NEEDS : live ? C.muted : undefined}
      right={where ?? ago(job.updatedAt)}
      rightSub={job.changes && (job.changes.add || job.changes.del) ? <Diff add={job.changes.add} del={job.changes.del} /> : null}
      onPress={onPress}
    />
  );
}

export function IdeaRow({ idea, onPress }: { idea: Idea; onPress: () => void }) {
  const voice = idea.source === 'voice';
  const body = idea.body?.split('\n').find((l) => l.trim() && l.trim() !== idea.title) ?? null;
  return (
    <Row
      lead={voice ? <MicIcon size={16} color={C.muted} /> : <IdeaIcon size={18} color={C.muted} />}
      title={idea.title || body || 'Untitled idea'}
      sub={idea.title ? body : null}
      right={ago(idea.createdAt)}
      label={`Idea${voice ? ' from a voice note' : ''}: ${idea.title || body || 'untitled'}`}
      onPress={onPress}
    />
  );
}

/** A task as the hub lists it. The ring is its state, not a checkbox: ticking from here isn't in the contract yet. */
export function TaskLine({ task, onPress }: { task: Task; onPress: () => void }) {
  const doing = task.status === 'doing';
  return (
    <Row
      lead={<View style={[s.ring, doing && { borderColor: C.muted }]}>{doing ? <View style={s.ringHalf} /> : null}</View>}
      title={task.title}
      sub={doing ? 'In progress' : null}
      right={dueLabel(task.due)}
      label={`Task: ${task.title}${doing ? ', in progress' : ''}${task.due ? `, due ${dueLabel(task.due)}` : ''}`}
      onPress={onPress}
    />
  );
}

export function SessionRow({ session, onPress }: { session: SessionBrief; onPress: () => void }) {
  return (
    <Row
      lead={session.live ? <LiveDot tone="live" /> : <View style={s.dotSpace} />}
      title={session.title}
      sub={sessionLine(session)}
      subColor={session.live ? C.muted : undefined}
      right={ago(session.updatedAt)}
      onPress={onPress}
    />
  );
}

export function RepoRow({ repo, folders, onPress }: { repo: RepoState; folders: ProjectCard['folders']; onPress: () => void }) {
  return (
    <Row
      lead={<FolderIcon size={16} />}
      title={folderName(folders, repo.folder)}
      sub={repo.branch ?? 'No branch'}
      right={repo.changed ? `${repo.changed} changed` : null}
      rightSub={repo.ahead ? <Text style={T.meta}>{repo.ahead} ahead</Text> : null}
      label={`${folderName(folders, repo.folder)}, branch ${repo.branch ?? 'none'}, ${plural(repo.changed, 'file')} changed${repo.ahead ? `, ${repo.ahead} ahead` : ''}`}
      onPress={onPress}
    />
  );
}

/** Branch name with its glyph, for the project header. */
export function BranchLabel({ branch }: { branch: string }) {
  return (
    <View style={s.branch}>
      <BranchIcon />
      <Text numberOfLines={1} style={s.branchText}>{branch}</Text>
    </View>
  );
}

/** Three quiet placeholder rows while a list has nothing cached yet. */
export function SkeletonRows({ n = 3 }: { n?: number }) {
  return (
    <View accessibilityLabel="Loading" accessibilityRole="progressbar">
      {Array.from({ length: n }, (_, i) => (
        <View key={i} style={s.row}>
          <View style={s.lead}><View style={s.skDot} /></View>
          <View style={[s.mid, { gap: 8 }]}>
            <View style={[s.skBar, { width: `${70 - i * 12}%` }]} />
            <View style={[s.skBar, s.skThin, { width: `${44 + i * 8}%` }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  dotSpace: { width: 8, height: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 8 },
  lead: { width: LEAD, alignItems: 'center', justifyContent: 'center' },
  mid: { flex: 1, minWidth: 0 },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flexShrink: 1 },
  pin: { paddingTop: 2 },
  right: { alignItems: 'flex-end', gap: 4, maxWidth: 120 },
  rightText: { textAlign: 'right' },
  diff: { flexDirection: 'row', gap: 4 },
  ring: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: 'rgba(161,166,174,0.45)', alignItems: 'center', justifyContent: 'center' },
  ringHalf: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.muted },
  branch: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  branchText: { flexShrink: 1, fontFamily: F.medium, fontSize: 14, lineHeight: 20, color: C.textSoft },
  skDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.08)' },
  skBar: { height: 14, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.07)' },
  skThin: { height: 12, backgroundColor: 'rgba(255,255,255,0.05)' },
});
