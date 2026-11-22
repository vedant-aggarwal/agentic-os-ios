import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { C, F } from '@/theme';
import type { ProjectCard, RepoState } from '../types';
import { repoFor, shortPath, startFolder } from './format';
import { FolderIcon, LinkFolderIcon } from './icons';
import { Press } from './Press';
import { BranchLabel } from './rows';
import { T } from './tokens';

/**
 * A project's name, then the folder its jobs start in with that repo's branch and uncommitted count.
 * The chips are all its folders by label; tapping one shows that folder's path and branch here instead.
 * With no folder yet it offers "Link a folder".
 */
export function ProjectHeader({ project, repo, onLink }: { project: ProjectCard; repo: RepoState[]; onLink: () => void }) {
  const start = startFolder(project.folders);
  const [picked, setPicked] = useState<string | null>(null);
  const shown = project.folders.find((f) => f.path === picked) ?? start;
  const r = shown ? repoFor(repo, shown.path) : null;
  // start folder first, the rest as he ordered them
  const chips = start ? [start, ...project.folders.filter((f) => f !== start)] : [];

  return (
    <View style={s.wrap}>
      <Text accessibilityRole="header" style={T.title}>{project.name}</Text>
      {shown ? (
        <View style={s.meta}>
          <View style={s.line}>
            <FolderIcon />
            <Text numberOfLines={1} ellipsizeMode="middle" style={s.path}>{shortPath(shown.path)}</Text>
          </View>
          {r?.branch || r?.changed ? (
            <View style={s.line}>
              {r.branch ? <BranchLabel branch={r.branch} /> : null}
              {r.changed ? <View style={s.changed}><Text style={s.changedText}>{r.changed} changed</Text></View> : null}
            </View>
          ) : null}
        </View>
      ) : (
        <Press onPress={onLink} haptic style={s.link} accessibilityHint="Opens the project's settings">
          <LinkFolderIcon />
          <Text style={T.button}>Link a folder</Text>
        </Press>
      )}
      {chips.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipsScroll} contentContainerStyle={s.chips}>
          {chips.map((f) => {
            const on = f === shown;
            return (
              <Press key={f.path} onPress={() => setPicked(f.path)} accessibilityState={{ selected: on }}
                accessibilityLabel={`${f.label || 'Folder'}${f === start ? ', start folder' : ''}`}
                style={[s.chip, on && s.chipOn]}>
                <Text numberOfLines={1} style={[s.chipText, on && { color: C.text }]}>{f.label || shortPath(f.path)}</Text>
              </Press>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { paddingBottom: 24, gap: 12 },
  meta: { gap: 4 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 24 },
  path: { flexShrink: 1, fontFamily: F.regular, fontSize: 14, lineHeight: 20, color: C.muted },
  changed: { height: 24, paddingHorizontal: 8, borderRadius: 12, justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  changedText: { fontFamily: F.medium, fontSize: 12, lineHeight: 16, color: C.textSoft, fontVariant: ['tabular-nums'] },
  link: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, paddingHorizontal: 16,
    borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.1)',
  },
  // the chips run to the screen's edges while scrolling, but start on the page's gutter
  chipsScroll: { marginHorizontal: -16 },
  chips: { paddingHorizontal: 16, gap: 8 },
  chip: { height: 32, paddingHorizontal: 12, borderRadius: 16, justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.06)' },
  chipOn: { backgroundColor: 'rgba(255,255,255,0.16)' },
  chipText: { fontFamily: F.medium, fontSize: 14, lineHeight: 20, color: C.muted },
});
