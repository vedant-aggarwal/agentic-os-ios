import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { C, F } from '@/theme';
import type { OrcaAgent, OrcaState } from '../../types';
import { orcaWaiting, orcaWorking } from '../../ui/orca';
import { Press } from '../../ui/Press';
import { GUTTER, LIVE, NEEDS, T } from '../../ui/tokens';
import type { HeaderProps } from '../types';
import { CHIP_BG, CHIP_LINE, useOrbitClock } from './kit';
import { RingSystem, type Sats } from './RingSystem';

// Orbit's head: the title, Orca's status as a mission line, then Claude and Codex as two ring systems side by side.

const GAP = 14;

const satsOf = (agents: OrcaAgent[], engine: string): Sats => ({
  working: agents.filter((a) => a.agent === engine && orcaWorking(a)).length,
  waiting: agents.filter((a) => a.agent === engine && orcaWaiting(a)).length,
});

export function OrbitHeader({ orca, orcaError, onOrcaPress }: HeaderProps) {
  const { width } = useWindowDimensions();
  const column = Math.min(width, 880) - 2 * GUTTER;
  const S = Math.max(128, Math.min(Math.floor((column - GAP) / 2), 196));
  const usage = orca?.usage ?? null;
  const up = orca ? orca.up : null;
  const agents = orca?.up ? orca.agents : [];
  const claude = satsOf(agents, 'claude'), codex = satsOf(agents, 'codex');
  // one slow clock turns every satellite; it only runs while there are some to move
  const spin = useOrbitClock(84_000, claude.working + claude.waiting + codex.working + codex.waiting > 0);
  const mode = usage ? 'data' : up === false ? 'off' : 'loading';
  return (
    <View style={s.header}>
      <Text accessibilityRole="header" style={T.title}>Work</Text>
      <MissionLine orca={orca} error={orcaError} onPress={onOrcaPress} />
      <View style={s.systems}>
        <RingSystem name="Claude" id="claude" u={usage?.claude ?? null} mode={mode} S={S} sats={claude} spin={spin} phase={28} />
        <RingSystem name="Codex" id="codex" u={usage?.codex ?? null} mode={mode} S={S} sats={codex} spin={spin} phase={208} />
      </View>
      {mode === 'off' ? <Text style={s.off}>Usage shows while Orca is open on your PC.</Text> : null}
    </View>
  );
}

/** "Orca online · 2 working · 1 waiting", with a thin line out to the chevron. Tap: what Orca is doing. */
function MissionLine({ orca, error, onPress }: { orca: OrcaState | null; error: string | null; onPress: () => void }) {
  const up = orca ? orca.up : null;
  const agents = orca?.up ? orca.agents : [];
  const working = agents.filter(orcaWorking).length;
  const waiting = agents.filter(orcaWaiting).length;
  const lead = up === null ? (error ? 'Can’t reach Orca right now' : 'Checking Orca…')
    : !up ? 'Orca isn’t running on your PC' : 'Orca online';
  const parts = up
    ? [
      working ? { text: `${working} working`, color: LIVE } : null,
      waiting ? { text: `${waiting} waiting`, color: NEEDS } : null,
    ].filter((p): p is { text: string; color: string } => !!p)
    : [];
  if (up && !parts.length) parts.push({ text: 'nothing running', color: C.faint });
  const dot = up === null ? (error ? NEEDS : 'rgba(200,214,255,0.35)') : !up || waiting ? NEEDS : working ? LIVE : 'rgba(200,214,255,0.55)';
  const glows = up === false || working > 0 || waiting > 0;
  return (
    <Press onPress={onPress} haptic hitSlop={8} style={s.missionWrap}
      accessibilityLabel={`${lead.replace(/…$/, '')}${parts.length ? `, ${parts.map((p) => p.text).join(', ')}` : ''}. Tap for details`}>
      {(pressed) => (
        <View style={s.mission}>
          <View style={[s.chip, pressed && s.chipPressed]}>
            <View style={s.mark}>
              <Svg width={12} height={12}><Circle cx={6} cy={6} r={5.2} stroke={dot} strokeOpacity={0.5} strokeWidth={1} fill="none" /></Svg>
              <View style={[s.markDot, { backgroundColor: dot }, glows ? { boxShadow: `0 0 6px ${dot}` } : null]} />
            </View>
            <Text numberOfLines={1} style={s.lead}>
              {lead}
              {parts.map((p) => (
                <Text key={p.text}><Text style={s.sep}>{'  ·  '}</Text><Text style={{ color: p.color }}>{p.text}</Text></Text>
              ))}
            </Text>
          </View>
          <View style={s.rule} />
          <Svg width={14} height={14} viewBox="0 0 14 14">
            <Path d="M5 3l4 4-4 4" stroke={C.muted} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </Svg>
        </View>
      )}
    </Press>
  );
}

const s = StyleSheet.create({
  header: { paddingBottom: 20 },
  systems: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 14 },
  off: { fontFamily: F.regular, fontSize: 13, lineHeight: 18, color: C.faint, textAlign: 'center', marginTop: 10, minHeight: 34 },

  missionWrap: { marginTop: 6, alignSelf: 'stretch' },
  mission: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 30 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 8, height: 28, paddingLeft: 9, paddingRight: 12, borderRadius: 14, flexShrink: 1,
    backgroundColor: CHIP_BG, borderWidth: StyleSheet.hairlineWidth, borderColor: CHIP_LINE,
  },
  chipPressed: { backgroundColor: 'rgba(200,214,255,0.12)' },
  mark: { width: 12, height: 12, alignItems: 'center', justifyContent: 'center' },
  markDot: { position: 'absolute', width: 5, height: 5, borderRadius: 3 },
  lead: { flexShrink: 1, fontFamily: F.medium, fontSize: 13, lineHeight: 18, color: C.textSoft, fontVariant: ['tabular-nums'] },
  sep: { color: 'rgba(142,147,155,0.7)' },
  rule: { flex: 1, height: StyleSheet.hairlineWidth, minWidth: 12, backgroundColor: CHIP_LINE },
});
