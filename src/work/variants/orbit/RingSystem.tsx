import { StyleSheet, Text, View } from 'react-native';
import Animated, { type SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import Svg, { Circle, Defs, G, Path, RadialGradient, Stop } from 'react-native-svg';
import { C, F } from '@/theme';
import type { ProviderUsage, UsageWindow } from '../../types';
import { FAILED, LIVE, NEEDS } from '../../ui/tokens';
import { arcPath, clampPct, HAIR, HALO, level, polar, resetWhen, rings, STAR, TICK, TICK_MAJOR, TICKS, ticks } from './kit';

// One account's limits as a ring system: the weekly window is the main ring, the 5-hour window and model-only
// weeks (Fable) are thinner rings inside it, the week's % sits in the core. The dial's ticks turn amber from 70 %
// and red from 90 %, so the arc shows how near the line it is. Orca agents on this account ride the dotted outer
// orbit: green ones circle, amber ones (waiting on him) hold still and glow.

export type Sats = { working: number; waiting: number };
export type SystemMode = 'data' | 'loading' | 'off';
type Win = { label: string; a11y: string; w: UsageWindow };

function windowsOf(u: ProviderUsage) {
  const main = u.weekly ?? u.session;
  if (!main) return null;
  const inner: Win[] = [
    ...(u.weekly && u.session ? [{ label: '5h', a11y: '5-hour window', w: u.session }] : []),
    ...u.extra.map((e) => ({ label: e.label, a11y: e.label, w: e.window })),
  ];
  return { main, weekly: !!u.weekly, inner };
}

const pct = (w: UsageWindow) => Math.round(clampPct(w.usedPercent));

/** The used share as a trail that brightens toward its head: butt-ended segments, so nothing overlaps. */
function trail(c: number, r: number, f: number) {
  const n = Math.max(1, Math.round(f * 28));
  const R = Math.round(r * 100) / 100;
  return Array.from({ length: n }, (_, i) => {
    const p = polar(c, r, (f * i) / n), q = polar(c, r, (f * (i + 1)) / n);
    return { d: `M${p.x} ${p.y}A${R} ${R} 0 0 1 ${q.x} ${q.y}`, o: 0.42 + 0.58 * ((i + 1) / n) ** 1.4 };
  });
}

export function RingSystem({ name, id, u, mode, S, sats, spin, phase }: {
  name: string; id: string; u: ProviderUsage | null; mode: SystemMode; S: number;
  sats: Sats; spin: SharedValue<number>; phase: number;
}) {
  const g = rings(S);
  const { c, k } = g;
  const data = mode === 'data' && u && u.status === 'ok' ? windowsOf(u) : null;
  const absent = mode === 'data' && !data ? (u && u.status !== 'ok' ? 'Not signed in on the PC' : 'Not available') : null;

  const mainP = data ? clampPct(data.main.usedPercent) : 0;
  const mainColor = level(mainP);
  const peak = data ? Math.max(mainP, ...data.inner.filter((x) => x.label === '5h').map((x) => clampPct(x.w.usedPercent))) : 0;
  const glow = level(peak) ?? HALO;
  const when = data ? resetWhen(data.main) : null;
  const inner = data ? data.inner.slice(0, 3) : [];
  const coreR = g.core(data ? inner.length : 2);
  const fs = Math.min(k, 1.1);

  const label = data
    ? `${name}: ${pct(data.main)}% of the ${data.weekly ? 'week' : '5 hours'} used${when ? `, resets ${when}` : ''}${
      data.inner.length ? `. ${data.inner.map((x) => `${x.a11y} ${pct(x.w)}%`).join(', ')}` : ''}`
    : absent ? `${name} usage: ${absent}`
      : mode === 'off' ? `${name} usage shows while Orca is open on your PC` : `${name} usage loading`;

  const dim = !data;
  return (
    <View style={[s.system, { width: S }]} accessible accessibilityLabel={label}>
      <View style={{ width: S, height: S }}>
        <Svg width={S} height={S}>
          <Defs>
            <RadialGradient id={`orbit-core-${id}`} cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={glow} stopOpacity={dim ? 0.05 : 0.2} />
              <Stop offset="0.55" stopColor={glow} stopOpacity={dim ? 0.02 : 0.07} />
              <Stop offset="1" stopColor={glow} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={c} cy={c} r={g.tickOut + 4 * k} fill={`url(#orbit-core-${id})`} />
          {/* the satellites' orbit */}
          <Circle cx={c} cy={c} r={g.sat} stroke={HAIR} strokeWidth={1} strokeDasharray={`${1.2 * k} ${4.6 * k}`} fill="none" />
          {/* the dial */}
          <G opacity={dim ? 0.45 : 1}>
            <Path d={ticks(c, g.tickMinor, g.tickOut, TICKS.minor)} stroke={TICK} strokeWidth={1} />
            <Path d={ticks(c, g.tickMajor, g.tickOut, TICKS.major)} stroke={TICK_MAJOR} strokeWidth={1.2} />
            <Path d={ticks(c, g.tickMinor, g.tickOut, TICKS.warnMinor)} stroke={NEEDS} strokeOpacity={0.5} strokeWidth={1} />
            <Path d={ticks(c, g.tickMajor, g.tickOut, TICKS.warnMajor)} stroke={NEEDS} strokeOpacity={0.8} strokeWidth={1.2} />
            <Path d={ticks(c, g.tickMinor, g.tickOut, TICKS.dangerMinor)} stroke={FAILED} strokeOpacity={0.55} strokeWidth={1} />
            <Path d={ticks(c, g.tickMajor, g.tickOut, TICKS.dangerMajor)} stroke={FAILED} strokeOpacity={0.85} strokeWidth={1.2} />
            <Path d={ticks(c, g.tickMajor - 2 * k, g.tickOut + 2.5 * k, [0])} stroke={STAR} strokeOpacity={0.85} strokeWidth={1.5} strokeLinecap="round" />
          </G>
          {/* tracks, then the used share of each window */}
          {(data ? [data.main, ...inner.map((x) => x.w)] : [null, null, null]).map((w, i) => (
            <Circle key={`t${i}`} cx={c} cy={c} r={g.track[i]} stroke={HAIR} strokeWidth={i ? 1 : 1.2} fill="none"
              strokeDasharray={dim ? `${2 * k} ${3 * k}` : undefined} />
          ))}
          {data ? <MainArc c={c} r={g.track[0]} f={mainP / 100} w={g.width[0]} glow={glow} color={mainColor ?? STAR} /> : null}
          {inner.map((x, i) => (
            <MinorArc key={x.label} c={c} r={g.track[i + 1]} f={clampPct(x.w.usedPercent) / 100} w={g.width[i + 1]} />
          ))}
        </Svg>
        {mode === 'data' ? <Satellites S={S} r={g.sat} k={k} sats={sats} spin={spin} phase={phase} /> : null}
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, s.core]}>
          <View style={{ width: coreR * 2, alignItems: 'center' }}>
            <Text maxFontSizeMultiplier={1.2} numberOfLines={1} style={s.coreName}>{name}</Text>
            {data ? (
              <Text maxFontSizeMultiplier={1.15} numberOfLines={1} style={[s.pct, { fontSize: 31 * fs, lineHeight: 36 * fs }, mainColor ? { color: mainColor } : null]}>
                {pct(data.main)}<Text style={s.pctSign}>%</Text>
              </Text>
            ) : <Text style={s.dash}>—</Text>}
            <Text maxFontSizeMultiplier={1.2} numberOfLines={1} style={s.coreCap}>{data ? (data.weekly ? 'Weekly' : '5-hour') : ' '}</Text>
          </View>
        </View>
      </View>
      {mode === 'off' ? null : (
        <View style={s.foot}>
          {data ? (
            <>
              <Text numberOfLines={1} style={s.reset}>{when ? `Resets ${when}` : data.weekly ? 'This week' : 'Next 5 hours'}</Text>
              <Text numberOfLines={1} style={s.legend}>
                {data.inner.map((x, i) => {
                  const warn = level(clampPct(x.w.usedPercent));
                  return (
                    <Text key={x.label}>
                      {i ? <Text style={s.sep}>{'  ·  '}</Text> : null}
                      {x.label} <Text style={[s.legendPct, warn ? { color: warn } : null]}>{pct(x.w)}%</Text>
                    </Text>
                  );
                })}
              </Text>
            </>
          ) : absent ? (
            <Text numberOfLines={2} style={s.absent}>{absent}</Text>
          ) : <View style={s.skeleton} />}
        </View>
      )}
    </View>
  );
}

function MainArc({ c, r, f, w, glow, color }: { c: number; r: number; f: number; w: number; glow: string; color: string }) {
  const d = arcPath(c, r, f);
  const head = polar(c, r, f);
  return (
    <G>
      {d ? <Path d={d} stroke={glow} strokeOpacity={0.08} strokeWidth={w * 3.2} strokeLinecap="round" fill="none" /> : null}
      {d ? <Path d={d} stroke={glow} strokeOpacity={0.14} strokeWidth={w * 1.8} strokeLinecap="round" fill="none" /> : null}
      {d ? trail(c, r, f).map((t, i) => <Path key={i} d={t.d} stroke={color} strokeOpacity={t.o} strokeWidth={w * 0.9} fill="none" />) : null}
      <Circle cx={head.x} cy={head.y} r={w * 2.1} fill={glow} fillOpacity={0.24} />
      <Circle cx={head.x} cy={head.y} r={w} fill="#FFFFFF" />
    </G>
  );
}

function MinorArc({ c, r, f, w }: { c: number; r: number; f: number; w: number }) {
  const d = arcPath(c, r, f);
  const warn = level(f * 100);
  const color = warn ?? 'rgba(232,238,255,0.78)';
  const head = polar(c, r, f);
  return (
    <G>
      {d ? <Path d={d} stroke={warn ?? HALO} strokeOpacity={0.14} strokeWidth={w * 2.8} strokeLinecap="round" fill="none" /> : null}
      {d ? <Path d={d} stroke={color} strokeWidth={w} strokeLinecap="round" fill="none" /> : null}
      <Circle cx={head.x} cy={head.y} r={w * 0.95} fill={color} />
    </G>
  );
}

/** Agents on this account. Working ones circle on one turning layer; waiting ones hold still and glow. */
function Satellites({ S, r, k, sats, spin, phase }: { S: number; r: number; k: number; sats: Sats; spin: SharedValue<number>; phase: number }) {
  const turn = useAnimatedStyle(() => ({ transform: [{ rotate: `${(spin.value % 1) * 360 + phase}deg` }] }));
  const beacon = useAnimatedStyle(() => ({ opacity: 0.72 + 0.28 * Math.cos(spin.value * Math.PI * 2 * 16) }));
  const c = S / 2;
  const nw = Math.min(sats.working, 8), nq = Math.min(sats.waiting, 4);
  return (
    <>
      {nw ? (
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, turn]}>
          <Svg width={S} height={S}>
            {Array.from({ length: nw }, (_, i) => <Sat key={i} c={c} r={r} k={k} f={i / nw} color={LIVE} tail />)}
          </Svg>
        </Animated.View>
      ) : null}
      {nq ? (
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, beacon]}>
          <Svg width={S} height={S}>
            {Array.from({ length: nq }, (_, i) => <Sat key={i} c={c} r={r} k={k} f={0.875 - i * 0.075} color={NEEDS} />)}
          </Svg>
        </Animated.View>
      ) : null}
    </>
  );
}

function Sat({ c, r, k, f, color, tail = false }: { c: number; r: number; k: number; f: number; color: string; tail?: boolean }) {
  const p = polar(c, r, f);
  const t = polar(c, r, f - 0.075);
  const R = Math.round(r * 100) / 100;
  return (
    <G>
      {tail ? <Path d={`M${t.x} ${t.y}A${R} ${R} 0 0 1 ${p.x} ${p.y}`} stroke={color} strokeOpacity={0.4} strokeWidth={1.4 * k} strokeLinecap="round" fill="none" /> : null}
      <Circle cx={p.x} cy={p.y} r={6.2 * k} fill={color} fillOpacity={0.2} />
      <Circle cx={p.x} cy={p.y} r={2.9 * k} fill={color} />
      <Circle cx={p.x} cy={p.y} r={1.1 * k} fill="#FFFFFF" fillOpacity={0.85} />
    </G>
  );
}

const s = StyleSheet.create({
  system: { alignItems: 'center' },
  core: { alignItems: 'center', justifyContent: 'center' },
  coreName: { fontFamily: F.semibold, fontSize: 9.5, lineHeight: 12, letterSpacing: 1.6, color: C.muted, textTransform: 'uppercase' },
  pct: { fontFamily: F.semibold, letterSpacing: -0.9, color: C.text, fontVariant: ['tabular-nums'] },
  pctSign: { fontFamily: F.medium, fontSize: 15, letterSpacing: 0, color: C.muted },
  dash: { fontFamily: F.medium, fontSize: 24, lineHeight: 36, color: 'rgba(200,214,255,0.3)' },
  coreCap: { fontFamily: F.semibold, fontSize: 9.5, lineHeight: 12, letterSpacing: 1.4, color: C.faint, textTransform: 'uppercase' },
  foot: { alignItems: 'center', gap: 2, marginTop: 6, minHeight: 34, alignSelf: 'stretch' },
  reset: { fontFamily: F.medium, fontSize: 12.5, lineHeight: 16, color: C.textSoft, fontVariant: ['tabular-nums'] },
  legend: { fontFamily: F.medium, fontSize: 12, lineHeight: 16, color: C.faint, fontVariant: ['tabular-nums'] },
  legendPct: { color: C.muted },
  sep: { color: 'rgba(142,147,155,0.6)' },
  absent: { fontFamily: F.regular, fontSize: 12.5, lineHeight: 16, color: C.faint, textAlign: 'center' },
  skeleton: { width: 96, height: 10, marginTop: 3, borderRadius: 5, backgroundColor: 'rgba(200,214,255,0.07)' },
});