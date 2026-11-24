import { StyleSheet, Text, View } from 'react-native';
import { C, F } from '@/theme';
import type { CacheState, OrcaAgent, OrcaState } from '../types';
import { ago } from './format';
import { LiveDot, type Tone } from './LiveDot';
import { Press } from './Press';
import { LEAD, LIVE, NEEDS, T } from './tokens';

// Orca's agents in the hub: the header pill (is Orca there, how many agents work), and one row per agent.

export const orcaWorking = (a: OrcaAgent) => a.state === 'working';
export const orcaWaiting = (a: OrcaAgent) => a.state === 'blocked' || a.state === 'waiting';
/** Live in the hub's sense: working, or stopped on something only he can answer. */
export const orcaLive = (a: OrcaAgent) => orcaWorking(a) || orcaWaiting(a);

export function orcaTone(a: OrcaAgent): Tone {
  if (orcaWorking(a)) return 'live';
  if (orcaWaiting(a)) return 'needs';
  return 'quiet';
}
const ENGINE: Record<string, string> = { claude: 'Claude', codex: 'Codex' };
export const engineName = (a: OrcaAgent) => ENGINE[a.agent] ?? a.agent.charAt(0).toUpperCase() + a.agent.slice(1);

export function orcaStateWord(a: OrcaAgent) {
  if (a.state === 'working') return 'Working';
  if (a.state === 'blocked') return 'Needs your OK in Orca';
  if (a.state === 'waiting') return 'Waiting for your answer';
  return 'Done';
}

/** "warm · 23m" while the cache holds, "cold" after; null when there is no session yet. */
export function cacheWord(c: CacheState, working: boolean, now = Date.now()): { text: string; cold: boolean } | null {
  if (c.state === 'none' || !c.warmUntil) return null;
  if (working) return null;
  const left = Math.round((Date.parse(c.warmUntil) - now) / 60_000);
  if (c.state === 'cold' || left <= 0) return { text: 'cache cold', cold: true };
  return { text: `warm · ${left}m`, cold: false };
}

/** One Orca agent: state dot, title, where and what it's doing, its age and cache. */
export function OrcaRow({ agent, where, onPress }: { agent: OrcaAgent; where?: string | null; onPress: () => void }) {
  const tone = orcaTone(agent);
  const cache = cacheWord(agent.cache, orcaWorking(agent));
  const live = tone !== 'quiet';
  const sub = live ? `${engineName(agent)} · ${orcaStateWord(agent)}` : agent.last ?? `${engineName(agent)} in Orca`;
  return (
    <Press onPress={onPress} style={s.row}
      accessibilityLabel={[agent.title, `${engineName(agent)} in Orca`, orcaStateWord(agent), where, cache?.text].filter(Boolean).join(', ')}>
      <View style={s.lead}><LiveDot tone={tone} pulse={tone === 'live'} /></View>
      <View style={s.mid}>
        <Text numberOfLines={1} style={T.row}>{agent.title}</Text>
        <Text numberOfLines={1} style={[T.sub, live && { color: tone === 'needs' ? NEEDS : C.muted }]}>{sub}</Text>
      </View>
      <View style={s.right}>
        <Text numberOfLines={1} style={[T.meta, s.rightText]}>{where ?? ago(agent.updatedAt)}</Text>
        {cache ? <Text style={[s.cache, cache.cold && s.cold]}>{cache.text}</Text> : null}
      </View>
    </Press>
  );
}

/** The header's Orca pill: green while agents work, quiet when idle, amber when Orca isn't answering. */
export function OrcaPill({ state, onPress }: { state: OrcaState | null; onPress: () => void }) {
  const up = state?.up ?? null;
  const working = state?.agents.filter(orcaWorking).length ?? 0;
  const waiting = state?.agents.filter(orcaWaiting).length ?? 0;
  const text = up === null ? 'Orca' : !up ? 'Orca offline' : waiting ? `Orca · ${waiting} waiting` : working ? `Orca · ${working} working` : 'Orca';
  const dot = up === null ? 'rgba(255,255,255,0.25)' : !up ? NEEDS : waiting ? NEEDS : working ? LIVE : 'rgba(255,255,255,0.45)';
  return (
    <Press onPress={onPress} haptic hitSlop={8} accessibilityLabel={up === false ? 'Orca is offline. Tap for details' : `${text}. Tap for details`}>
      {(pressed) => (
        <View style={[s.pill, pressed && s.pillPressed]}>
          <View style={[s.pillDot, { backgroundColor: dot }, (working || waiting) && up ? { boxShadow: `0 0 8px ${dot}` } : null]} />
          <Text style={s.pillText}>{text}</Text>
        </View>
      )}
    </Press>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 8 },
  lead: { width: LEAD, alignItems: 'center', justifyContent: 'center' },
  mid: { flex: 1, minWidth: 0 },
  right: { alignItems: 'flex-end', gap: 4, maxWidth: 120 },
  rightText: { textAlign: 'right' },
  cache: { fontFamily: F.medium, fontSize: 11, lineHeight: 14, color: C.faint },
  cold: { color: NEEDS },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 8, height: 32, paddingHorizontal: 12, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.1)',
  },
  pillPressed: { backgroundColor: 'rgba(255,255,255,0.14)' },
  pillDot: { width: 7, height: 7, borderRadius: 4 },
  pillText: { fontFamily: F.semibold, fontSize: 13, lineHeight: 18, color: C.textSoft },
});
