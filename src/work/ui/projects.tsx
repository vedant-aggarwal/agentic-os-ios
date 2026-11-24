import { type GestureResponderEvent, StyleSheet, Text, View } from 'react-native';
import { C, F } from '@/theme';
import type { ProjectCard } from '../types';
import { ago, countsLine, plural } from './format';
import { JobIcon, PinIcon } from './icons';
import { Press } from './Press';
import { LIVE, NEEDS, T } from './tokens';

// The hub's projects: Active ones as tiles two to a row, idea projects (kept for later, paused on the PC) as quiet
// rows under a switch, so the list he works from stays short.

export type ProjectTab = 'active' | 'ideas';
export const isIdeaProject = (p: ProjectCard) => p.status === 'paused';

/** "Active 7 | Ideas 8": which projects the section lists. */
export function ProjectTabs({ tab, counts, onChange }: { tab: ProjectTab; counts: Record<ProjectTab, number>; onChange: (t: ProjectTab) => void }) {
  return (
    <View style={s.tabs} accessibilityRole="tablist">
      {(['active', 'ideas'] as const).map((k) => {
        const on = tab === k;
        return (
          <Press key={k} onPress={() => onChange(k)} haptic accessibilityRole="tab" accessibilityState={{ selected: on }}
            accessibilityLabel={`${k === 'active' ? 'Active' : 'Ideas'}, ${counts[k]}`}>
            <View style={[s.tab, on && s.tabOn]}>
              <Text style={[s.tabText, on && s.tabTextOn]}>{k === 'active' ? 'Active' : 'Ideas'}</Text>
              <Text style={[s.tabCount, on && s.tabTextOn]}>{counts[k]}</Text>
            </View>
          </Press>
        );
      })}
    </View>
  );
}

export type TileProps = {
  project: ProjectCard; orcaWorking: number; orcaWaiting: number;
  onPress: () => void; onLongPress: (e: GestureResponderEvent) => void;
};

function Tile({ project: p, orcaWorking, orcaWaiting, onPress, onLongPress }: TileProps) {
  const needs = p.counts.needs + orcaWaiting;
  const working = p.counts.live + orcaWorking;
  const status = needs ? { text: needs === 1 ? 'Needs you' : `${needs} need you`, color: NEEDS }
    : working ? { text: `${working} working`, color: LIVE } : null;
  const folders = p.folders.map((f) => f.label).filter(Boolean).slice(0, 3).join(' · ');
  return (
    <Press onPress={onPress} onLongPress={onLongPress} style={s.tileWrap}
      accessibilityLabel={[p.name, p.pinned ? 'pinned' : null, status?.text, countsLine(p.counts), ago(p.lastActiveAt)].filter(Boolean).join(', ')}
      accessibilityHint="Hold for pin, move to ideas and settings">
      {(pressed) => (
        <View style={[s.tile, pressed && s.tilePressed, status && { borderColor: `${status.color}55` }]}>
          <View style={s.tileTop}>
            <Text numberOfLines={2} style={s.tileName}>{p.name}</Text>
            {p.pinned ? <View style={s.pin}><PinIcon /></View> : null}
          </View>
          <Text numberOfLines={1} style={s.tileSub}>{countsLine(p.counts)}</Text>
          <View style={s.tileFoot}>
            {status ? (
              <View style={s.status}>
                <View style={[s.dot, { backgroundColor: status.color, boxShadow: `0 0 8px ${status.color}` }]} />
                <Text numberOfLines={1} style={[s.statusText, { color: status.color }]}>{status.text}</Text>
              </View>
            ) : <Text numberOfLines={1} style={s.folders}>{folders || 'No folder'}</Text>}
            <Text style={T.meta}>{ago(p.lastActiveAt)}</Text>
          </View>
        </View>
      )}
    </Press>
  );
}

/** One row of the Active grid: two tiles, or one and a gap. */
export function TilePair({ items, Tile: Custom }: { items: TileProps[]; Tile?: (p: TileProps) => React.ReactElement }) {
  const One = Custom ?? Tile;
  return (
    <View style={s.pair}>
      {items.map((t) => <One key={t.project.slug} {...t} />)}
      {items.length === 1 ? <View style={s.tileWrap} /> : null}
    </View>
  );
}

/** An idea project: kept for later, so it reads quieter than the active ones. The round button starts a job in it. */
export function IdeaProjectRow({ project: p, onPress, onLongPress, onStart }: {
  project: ProjectCard; onPress: () => void; onLongPress: (e: GestureResponderEvent) => void; onStart: () => void;
}) {
  const open = p.counts.ideas + p.counts.tasks;
  return (
    <Press onPress={onPress} onLongPress={onLongPress} style={s.idea}
      accessibilityLabel={`${p.name}, idea project${open ? `, ${plural(open, 'open item')}` : ''}`} accessibilityHint="Hold to move it to Active">
      <View style={s.ideaMark} />
      <Text numberOfLines={1} style={s.ideaName}>{p.name}</Text>
      {open ? <Text style={s.ideaCount}>{open}</Text> : null}
      <Text style={T.meta}>{ago(p.lastActiveAt)}</Text>
      <Press onPress={onStart} haptic hitSlop={6} style={s.start} accessibilityRole="button" accessibilityLabel={`Start a job in ${p.name}`}>
        <JobIcon size={14} color={C.textSoft} />
      </Press>
    </Press>
  );
}

const s = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: 6, padding: 3, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.06)' },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 28, paddingHorizontal: 12, borderRadius: 11 },
  tabOn: { backgroundColor: 'rgba(255,255,255,0.14)' },
  tabText: { fontFamily: F.semibold, fontSize: 13, lineHeight: 18, color: C.faint },
  tabCount: { fontFamily: F.medium, fontSize: 12, lineHeight: 16, color: C.faint, fontVariant: ['tabular-nums'] },
  tabTextOn: { color: C.text },

  pair: { flexDirection: 'row', gap: 10, paddingBottom: 10 },
  tileWrap: { flex: 1 },
  tile: {
    height: 112, borderRadius: 20, padding: 14, justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.055)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.1)',
  },
  tilePressed: { backgroundColor: 'rgba(255,255,255,0.1)' },
  tileTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  tileName: { flex: 1, fontFamily: F.semibold, fontSize: 16, lineHeight: 21, letterSpacing: -0.2, color: C.text },
  pin: { paddingTop: 4 },
  tileSub: { fontFamily: F.regular, fontSize: 13, lineHeight: 18, color: C.faint },
  tileFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontFamily: F.semibold, fontSize: 12, lineHeight: 16, flexShrink: 1 },
  folders: { flexShrink: 1, fontFamily: F.medium, fontSize: 12, lineHeight: 16, color: 'rgba(161,166,174,0.75)' },

  idea: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingVertical: 6 },
  start: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.07)' },
  ideaMark: { width: 8, height: 8, marginHorizontal: 8, borderRadius: 4, borderWidth: 1.5, borderColor: 'rgba(161,166,174,0.5)' },
  ideaName: { flex: 1, fontFamily: F.medium, fontSize: 15, lineHeight: 20, color: C.textSoft },
  ideaCount: {
    minWidth: 22, textAlign: 'center', paddingHorizontal: 6, borderRadius: 10, overflow: 'hidden',
    fontFamily: F.medium, fontSize: 12, lineHeight: 18, color: C.muted, backgroundColor: 'rgba(255,255,255,0.07)',
  },
});
