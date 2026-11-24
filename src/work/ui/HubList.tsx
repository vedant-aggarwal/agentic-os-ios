import { useCallback } from 'react';
import { type GestureResponderEvent, RefreshControl, SectionList, type SectionListData, StyleSheet, View } from 'react-native';
import { C } from '@/theme';
import type { Idea, JobBrief, NeedItem, OrcaAgent, ProjectCard, RepoState, SessionBrief, Task } from '../types';
import { NeedCard } from './NeedCard';
import { notBuilt, openJob, openOrcaAgent, openProject } from './nav';
import { OrcaRow } from './orca';
import { IdeaProjectRow, TilePair } from './projects';
import { IdeaRow, JobRow, ProjectRow, RepoRow, SessionRow, SkeletonRows, TaskLine } from './rows';
import { EmptyLine, MoreLine, SectionHeader } from './Section';
import { useShellInsets } from './Shell';
import { ErrorState } from './States';
import { GUTTER } from './tokens';

// One virtualized list for both hub pages. A screen builds sections of typed items; this draws them.

type Add = { label: string; onPress: () => void };
export type Item =
  | { kind: 'need'; key: string; need: NeedItem; heading?: string | null }
  | { kind: 'job'; key: string; job: JobBrief; where?: string | null }
  | { kind: 'orca'; key: string; agent: OrcaAgent; where?: string | null }
  | { kind: 'tiles'; key: string; projects: { project: ProjectCard; orcaWorking: number; orcaWaiting: number }[] }
  | { kind: 'ideaProject'; key: string; project: ProjectCard }
  | { kind: 'project'; key: string; project: ProjectCard }
  | { kind: 'idea'; key: string; idea: Idea }
  | { kind: 'task'; key: string; task: Task }
  | { kind: 'session'; key: string; session: SessionBrief }
  | { kind: 'repo'; key: string; repo: RepoState; folders: ProjectCard['folders'] }
  | { kind: 'empty'; key: string; text: string; add?: Add }
  | { kind: 'more'; key: string; label: string; onPress: () => void }
  | { kind: 'loading'; key: string }
  | { kind: 'error'; key: string; title: string; message: string | null; onRetry: () => void };

export type Sec = { key: string; title?: string; count?: number; add?: Add; extra?: React.ReactNode; data: Item[] };

export type ListHandlers = {
  onHide: (id: string) => void;
  onUndo: (id: string) => void;
  onSent: () => void;
  onHold?: (project: ProjectCard, e: GestureResponderEvent) => void;
  onProjectAction?: (project: ProjectCard, action: 'pin' | 'settings') => void;
};

export function HubList({ sections, header, refreshing, onRefresh, handlers }: {
  sections: Sec[]; header: React.ReactElement; refreshing: boolean; onRefresh: () => void; handlers: ListHandlers;
}) {
  const pad = useShellInsets();
  const { onHide, onUndo, onSent, onHold, onProjectAction } = handlers;

  const renderItem = useCallback(({ item }: { item: Item }) => {
    switch (item.kind) {
      case 'need':
        return (
          <View style={s.card}>
            <NeedCard need={item.need} heading={item.heading} onHide={onHide} onUndo={onUndo} onSent={onSent} />
          </View>
        );
      case 'job': return <JobRow job={item.job} where={item.where} onPress={() => openJob(item.job.id)} />;
      case 'orca': return <OrcaRow agent={item.agent} where={item.where} onPress={() => openOrcaAgent(item.agent.id)} />;
      case 'tiles':
        return (
          <TilePair items={item.projects.map((t) => ({
            ...t, onPress: () => openProject(t.project.slug), onLongPress: (e: GestureResponderEvent) => onHold?.(t.project, e),
          }))} />
        );
      case 'ideaProject':
        return <IdeaProjectRow project={item.project} onPress={() => openProject(item.project.slug)} onLongPress={(e) => onHold?.(item.project, e)} />;
      case 'project':
        return (
          <ProjectRow project={item.project} onPress={() => openProject(item.project.slug)}
            onLongPress={(e) => onHold?.(item.project, e)} onAction={(a) => onProjectAction?.(item.project, a)} />
        );
      case 'idea': return <IdeaRow idea={item.idea} onPress={() => notBuilt('Opening an idea')} />;
      case 'task': return <TaskLine task={item.task} onPress={() => notBuilt('Editing a task')} />;
      case 'session': return <SessionRow session={item.session} onPress={() => notBuilt('Reading sessions')} />;
      case 'repo': return <RepoRow repo={item.repo} folders={item.folders} onPress={() => notBuilt('Uncommitted changes')} />;
      case 'empty': return <EmptyLine text={item.text} add={item.add} />;
      case 'more': return <MoreLine label={item.label} onPress={item.onPress} />;
      case 'loading': return <SkeletonRows />;
      case 'error': return <ErrorState title={item.title} message={item.message} onRetry={item.onRetry} />;
    }
  }, [onHide, onUndo, onSent, onHold, onProjectAction]);

  const renderSectionHeader = useCallback(({ section }: { section: SectionListData<Item, Sec> }) => (
    section.title ? <SectionHeader title={section.title} count={section.count} add={section.add} extra={section.extra} /> : null
  ), []);

  return (
    <SectionList<Item, Sec>
      sections={sections}
      keyExtractor={(i) => i.key}
      renderItem={renderItem}
      renderSectionHeader={renderSectionHeader}
      // 24 between sections; a card already carries 12 under it
      renderSectionFooter={({ section }) => <View style={['need', 'tiles'].includes(section.data.at(-1)?.kind ?? '') ? s.gapAfterCard : s.gap} />}
      ListHeaderComponent={header}
      stickySectionHeadersEnabled={false}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      initialNumToRender={14}
      contentContainerStyle={{ paddingTop: pad.top, paddingBottom: pad.bottom, paddingHorizontal: GUTTER }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.muted} progressViewOffset={pad.top} />}
    />
  );
}

const s = StyleSheet.create({
  card: { paddingBottom: 12 },
  gap: { height: 24 },
  gapAfterCard: { height: 12 },
});
