import { StyleSheet, Text, View } from 'react-native';
import { C, F } from '@/theme';
import type { OrcaUsage, ProviderUsage, UsageWindow } from '../types';
import { FAILED, NEEDS } from './tokens';

// His Claude and Codex limits at the top of Work, read by Orca on the PC (it signs in as him). One tile per
// account: the weekly window big, the 5-hour window and model-only weeks under it. Colour only when it matters:
// amber from 70 %, red from 90 %.

const levelColor = (p: number) => (p >= 90 ? FAILED : p >= 70 ? NEEDS : 'rgba(243,244,246,0.86)');

/** When a window resets, short enough for half a phone: "4:30 pm" within the day, else "Sun 6:30 pm". */
function resetWhen(w: UsageWindow, now = Date.now()) {
  const t = w.resetsAt ? Date.parse(w.resetsAt) : NaN;
  if (!Number.isFinite(t)) return w.reset;
  const d = new Date(t);
  const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  return t - now < 20 * 3_600_000 ? time : `${d.toLocaleDateString('en-IN', { weekday: 'short' })} ${time}`;
}

function Bar({ w, thin = false }: { w: UsageWindow; thin?: boolean }) {
  return (
    <View style={[s.track, thin && s.trackThin]}>
      <View style={[s.fill, { width: `${Math.max(2, w.usedPercent)}%`, backgroundColor: levelColor(w.usedPercent) }]} />
    </View>
  );
}

function Tile({ name, u }: { name: string; u: ProviderUsage | null }) {
  const main = u?.weekly ?? u?.session ?? null;
  if (!u || u.status !== 'ok' || !main) {
    return (
      <View style={s.tile} accessibilityLabel={`${name} usage not available`}>
        <Text style={s.name}>{name}</Text>
        <Text style={s.none} numberOfLines={2}>{u?.error ? 'Not signed in on the PC' : 'Not available'}</Text>
      </View>
    );
  }
  const peak = Math.max(main.usedPercent, u.session?.usedPercent ?? 0);
  const minor = [
    u.session && u.weekly ? `5h ${u.session.usedPercent}%` : null,
    ...u.extra.map((e) => `${e.label} ${e.window.usedPercent}%`),
  ].filter(Boolean).join(' · ');
  const when = resetWhen(main);
  const label = `${name}: ${main.usedPercent}% of the ${u.weekly ? 'week' : '5 hours'} used${when ? `, resets ${when}` : ''}${minor ? `. ${minor}` : ''}`;
  return (
    <View style={s.tile} accessible accessibilityLabel={label}>
      <View style={s.headLine}>
        <Text style={s.name}>{name}</Text>
        <Text style={[s.pct, { color: levelColor(peak) }]}>{main.usedPercent}%</Text>
      </View>
      <Bar w={main} />
      <Text numberOfLines={1} style={s.reset}>{when ? `Resets ${when}` : u.weekly ? 'This week' : 'Next 5 hours'}</Text>
      {minor ? <Text numberOfLines={1} style={s.minor}>{minor}</Text> : null}
    </View>
  );
}

/** Two tiles, Claude and Codex. `usage` null while Orca hasn't answered yet; `up` false when Orca isn't running. */
export function UsageStrip({ usage, up }: { usage: OrcaUsage | null; up: boolean | null }) {
  if (!usage) {
    return (
      <View style={s.row}>
        {up === false
          ? <Text style={s.off}>Usage shows here while Orca is open on your PC.</Text>
          : [0, 1].map((i) => <View key={i} style={[s.tile, s.skeleton]} accessibilityLabel="Loading usage" />)}
      </View>
    );
  }
  return (
    <View style={s.row}>
      <Tile name="Claude" u={usage.claude} />
      <Tile name="Codex" u={usage.codex} />
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
  tile: {
    flex: 1, minHeight: 84, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 12, gap: 6,
    backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.09)',
  },
  skeleton: { backgroundColor: 'rgba(255,255,255,0.04)' },
  headLine: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  name: { fontFamily: F.semibold, fontSize: 13, lineHeight: 18, color: C.muted, letterSpacing: 0.2 },
  pct: { fontFamily: F.semibold, fontSize: 20, lineHeight: 24, letterSpacing: -0.4, fontVariant: ['tabular-nums'] },
  track: { height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.10)', overflow: 'hidden' },
  trackThin: { height: 3 },
  fill: { height: '100%', borderRadius: 3 },
  reset: { fontFamily: F.medium, fontSize: 12, lineHeight: 16, color: C.faint },
  minor: { fontFamily: F.medium, fontSize: 12, lineHeight: 16, color: C.faint, fontVariant: ['tabular-nums'] },
  none: { fontFamily: F.regular, fontSize: 13, lineHeight: 18, color: C.faint },
  off: { flex: 1, fontFamily: F.regular, fontSize: 13, lineHeight: 18, color: C.faint, paddingVertical: 8 },
});
