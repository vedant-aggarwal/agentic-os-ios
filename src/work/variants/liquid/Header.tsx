import { StyleSheet, Text, View } from 'react-native';
import Animated, { type SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { C, F } from '@/theme';
import type { OrcaState, OrcaUsage, ProviderUsage, UsageWindow } from '../../types';
import { orcaWaiting, orcaWorking } from '../../ui/orca';
import { Press } from '../../ui/Press';
import type { HeaderProps } from '../types';
import { useClock } from './motion';
import { LIVE, NEEDS, toneFor } from './palette';
import { EmptyTube, Glow, Vessel } from './Vessel';

// The Work head in Liquid: the title with Orca as a frosted pill, then one glass capsule per account, filled with
// glowing liquid up to the share of the week used. The 5-hour window and model-only weeks are small glass beads
// beside it. One clock drives every wave, bubble and the pill's breathing dot.

const TUBE = { w: 70, h: 176 } as const;
const BEAD = 18;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function clock12(d: Date) {
  const h = d.getHours();
  return `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

/** When a window resets: "4:30 pm" within 20 hours, else "Sun 6:30 pm". */
function resetWhen(w: UsageWindow, now = Date.now()) {
  const t = w.resetsAt ? Date.parse(w.resetsAt) : NaN;
  if (!Number.isFinite(t)) return w.reset;
  const d = new Date(t);
  return t - now < 20 * 3_600_000 ? clock12(d) : `${DAYS[d.getDay()]} ${clock12(d)}`;
}

export function LiquidHeader({ orca, orcaError, onOrcaPress }: HeaderProps) {
  const { t, moving } = useClock();
  return (
    <View style={s.header}>
      <View style={s.titleRow}>
        <Text accessibilityRole="header" style={s.title}>Work</Text>
        <OrcaPill orca={orca} error={orcaError} onPress={onOrcaPress} clock={t} />
      </View>
      <Limits usage={orca?.usage ?? null} up={orca ? orca.up : null} clock={t} moving={moving} />
    </View>
  );
}

// ---- Orca ----

function OrcaPill({ orca, error, onPress, clock }: {
  orca: OrcaState | null; error: string | null; onPress: () => void; clock: SharedValue<number>;
}) {
  const working = orca?.up ? orca.agents.filter(orcaWorking).length : 0;
  const waiting = orca?.up ? orca.agents.filter(orcaWaiting).length : 0;
  let dot: string;
  let breathe: boolean;
  let label: string;
  let body: React.ReactNode;
  if (!orca) {
    dot = 'rgba(255,255,255,0.4)';
    breathe = !error;
    label = error ? 'Can’t reach Orca on your PC' : 'Checking whether Orca is running';
    body = <Text style={s.pillLead}>{error ? 'Can’t reach Orca' : 'Checking Orca'}</Text>;
  } else if (!orca.up) {
    dot = NEEDS;
    breathe = false;
    label = 'Orca isn’t running on your PC';
    body = <Text style={s.pillLead}>Orca isn’t running on your PC</Text>;
  } else {
    dot = waiting ? NEEDS : working ? LIVE : 'rgba(255,255,255,0.5)';
    breathe = working + waiting > 0;
    label = `Orca is running: ${working} working${waiting ? `, ${waiting} waiting for you` : ''}`;
    body = (
      <>
        <Text style={s.pillLead}>Orca</Text>
        {working || waiting ? null : <Text style={s.pillRest}>{'  idle'}</Text>}
        {working ? <Text style={s.pillRest}>{`  ${working} working`}</Text> : null}
        {waiting ? <Text style={[s.pillRest, s.pillWait]}>{`  ${waiting} waiting`}</Text> : null}
      </>
    );
  }
  return (
    <Press onPress={onPress} haptic hitSlop={8} style={s.pillPress} accessibilityLabel={`${label}. Tap for details`}>
      {(pressed) => (
        <View style={[s.pill, pressed && s.pillPressed]}>
          <View style={s.pillGlint} />
          <BreathDot color={dot} on={breathe} clock={clock} />
          <Text numberOfLines={1} style={s.pillText}>{body}</Text>
        </View>
      )}
    </Press>
  );
}

/** Orca's dot: it breathes while agents work or wait, three slow breaths a lap. */
function BreathDot({ color, on, clock }: { color: string; on: boolean; clock: SharedValue<number> }) {
  const halo = useAnimatedStyle(() => {
    const b = on ? 0.5 - 0.5 * Math.cos(clock.value * Math.PI * 6) : 0.25;
    return { opacity: 0.1 + 0.36 * b, transform: [{ scale: 0.7 + 0.6 * b }] };
  });
  return (
    <View style={s.dotBox}>
      <Animated.View style={[s.dotHalo, { backgroundColor: color }, halo]} />
      <View style={[s.dotCore, { backgroundColor: color }, on && { boxShadow: `0 0 8px ${color}` }]} />
    </View>
  );
}

// ---- Limits ----

function Limits({ usage, up, clock, moving }: {
  usage: OrcaUsage | null; up: boolean | null; clock: SharedValue<number>; moving: boolean;
}) {
  if (!usage) {
    if (up === false) return <Offline />;
    return (
      <View style={s.row} accessible accessibilityLabel="Loading usage">
        <Skeleton clock={clock} />
        <Skeleton clock={clock} />
      </View>
    );
  }
  return (
    <View style={s.row}>
      <Provider name="Claude" u={usage.claude} clock={clock} moving={moving} />
      <Provider name="Codex" u={usage.codex} clock={clock} moving={moving} />
    </View>
  );
}

function Provider({ name, u, clock, moving }: { name: string; u: ProviderUsage | null; clock: SharedValue<number>; moving: boolean }) {
  const main = u?.weekly ?? u?.session ?? null;
  if (!u || u.status !== 'ok' || !main) {
    const msg = u && u.status !== 'ok' ? 'Not signed in on the PC' : 'Not available';
    return (
      <View style={s.provider} accessible accessibilityLabel={`${name}: ${msg}`}>
        <EmptyTube w={TUBE.w} h={TUBE.h} />
        <View style={s.info}>
          <Text style={s.name}>{name}</Text>
          <Text style={s.none}>{msg}</Text>
        </View>
      </View>
    );
  }
  const pct = Math.round(main.usedPercent);
  const tone = toneFor(pct);
  const when = resetWhen(main);
  const minors = [
    ...(u.session && u.weekly ? [{ key: '5h', label: '5h', spoken: '5-hour window', w: u.session }] : []),
    ...u.extra.map((e) => ({ key: `x:${e.label}`, label: e.label, spoken: e.label, w: e.window })),
  ];
  const span = u.weekly ? 'week' : '5 hours';
  const label = [
    `${name}: ${pct}% of the ${span} used${when ? `, resets ${when}` : ''}`,
    ...minors.map((m) => `${m.spoken} ${Math.round(m.w.usedPercent)}%`),
  ].join('. ');
  return (
    <View style={s.provider} accessible accessibilityLabel={label}>
      <View style={s.tubeBox}>
        <Glow w={TUBE.w} h={TUBE.h} pct={pct} tone={tone} />
        <Vessel w={TUBE.w} h={TUBE.h} pct={pct} tone={tone} clock={clock} amp={3} shape="tube" moving={moving} />
      </View>
      <View style={s.info}>
        <Text numberOfLines={1} style={s.name}>{name}</Text>
        <Text numberOfLines={1} style={[s.pct, pct >= 70 && { color: tone.ink }]}>
          {pct}<Text style={[s.pctSign, { color: tone.ink }]}>%</Text>
        </Text>
        <Text style={s.caption}>{`of the ${span}`}</Text>
        {when ? (
          <View style={s.reset}>
            <Text style={s.resetLabel}>Resets</Text>
            <Text numberOfLines={1} style={s.resetWhen}>{when}</Text>
          </View>
        ) : null}
        {minors.length ? (
          <View style={s.minors}>
            {minors.slice(0, 3).map((m) => <Minor key={m.key} label={m.label} w={m.w} clock={clock} moving={moving} />)}
          </View>
        ) : null}
      </View>
    </View>
  );
}

/** A minor window (the 5-hour session, a model-only week) as a glass bead with its own level. */
function Minor({ label, w, clock, moving }: { label: string; w: UsageWindow; clock: SharedValue<number>; moving: boolean }) {
  const pct = Math.round(w.usedPercent);
  const tone = toneFor(pct);
  return (
    <View style={s.minor}>
      <Vessel w={BEAD} h={BEAD} pct={pct} tone={tone} clock={clock} amp={1.1} shape="ball" moving={moving} />
      <Text numberOfLines={1} style={s.minorLabel}>{label}</Text>
      <Text style={[s.minorPct, pct >= 70 && { color: tone.ink }]}>{pct}%</Text>
    </View>
  );
}

/** Before the PC answers: empty glass, breathing softly. */
function Skeleton({ clock }: { clock: SharedValue<number> }) {
  const pulse = useAnimatedStyle(() => ({ opacity: 0.55 + 0.45 * (0.5 - 0.5 * Math.cos(clock.value * Math.PI * 12)) }));
  return (
    <Animated.View style={[s.provider, pulse]}>
      <EmptyTube w={TUBE.w} h={TUBE.h} />
      <View style={s.info}>
        <View style={[s.bone, s.boneName]} />
        <View style={[s.bone, s.bonePct]} />
        <View style={[s.bone, s.boneLine]} />
        <View style={[s.bone, s.boneReset]} />
      </View>
    </Animated.View>
  );
}

function Offline() {
  return (
    <View style={s.offline}>
      <View style={s.offTubes}>
        <EmptyTube w={20} h={50} />
        <EmptyTube w={20} h={50} />
      </View>
      <Text style={s.offText}>Usage shows while Orca is open on your PC.</Text>
    </View>
  );
}

const s = StyleSheet.create({
  header: { paddingBottom: 30, gap: 20 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { fontFamily: F.semibold, fontSize: 32, lineHeight: 38, letterSpacing: -0.9, color: C.text },

  pillPress: { flexShrink: 1 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 9, height: 36, paddingLeft: 12, paddingRight: 14, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.16)',
    boxShadow: '0 6px 18px rgba(0,0,0,0.22)',
  },
  pillPressed: { backgroundColor: 'rgba(255,255,255,0.13)' },
  pillGlint: { position: 'absolute', top: 0, left: 18, right: 18, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.32)' },
  pillText: { flexShrink: 1, fontFamily: F.medium, fontSize: 13, lineHeight: 18, color: C.muted },
  pillLead: { fontFamily: F.semibold, color: C.textSoft },
  pillRest: { fontFamily: F.medium, color: C.muted, fontVariant: ['tabular-nums'] },
  pillWait: { color: NEEDS },
  dotBox: { width: 8, height: 8, alignItems: 'center', justifyContent: 'center' },
  dotHalo: { position: 'absolute', width: 18, height: 18, borderRadius: 9 },
  dotCore: { width: 8, height: 8, borderRadius: 4 },

  row: { flexDirection: 'row', gap: 14 },
  provider: { flex: 1, flexDirection: 'row', gap: 12 },
  tubeBox: { width: TUBE.w, height: TUBE.h },
  info: { flex: 1, minWidth: 0 },
  name: { fontFamily: F.semibold, fontSize: 13, lineHeight: 18, letterSpacing: 0.2, color: C.muted },
  pct: { marginTop: 2, fontFamily: F.semibold, fontSize: 34, lineHeight: 40, letterSpacing: -1.2, color: C.text, fontVariant: ['tabular-nums'] },
  pctSign: { fontFamily: F.medium, fontSize: 18, letterSpacing: 0 },
  caption: { fontFamily: F.medium, fontSize: 11, lineHeight: 14, color: C.faint },
  reset: { marginTop: 12 },
  resetLabel: { fontFamily: F.medium, fontSize: 11, lineHeight: 14, color: C.faint },
  resetWhen: { fontFamily: F.semibold, fontSize: 13, lineHeight: 18, color: C.textSoft, fontVariant: ['tabular-nums'] },
  minors: { marginTop: 12, gap: 6 },
  minor: { flexDirection: 'row', alignItems: 'center', gap: 7, height: 20 },
  minorLabel: { flex: 1, minWidth: 0, fontFamily: F.medium, fontSize: 12, lineHeight: 16, color: C.muted },
  minorPct: { fontFamily: F.semibold, fontSize: 12, lineHeight: 16, color: C.textSoft, fontVariant: ['tabular-nums'] },
  none: { marginTop: 6, fontFamily: F.regular, fontSize: 13, lineHeight: 18, color: C.faint },

  bone: { borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.08)' },
  boneName: { width: 44, height: 10, marginTop: 4 },
  bonePct: { width: 62, height: 26, marginTop: 12 },
  boneLine: { width: 54, height: 9, marginTop: 10 },
  boneReset: { width: 70, height: 9, marginTop: 22 },

  offline: {
    flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.1)',
  },
  offTubes: { flexDirection: 'row', gap: 6, opacity: 0.8 },
  offText: { flex: 1, fontFamily: F.regular, fontSize: 14, lineHeight: 20, color: C.muted },
});
