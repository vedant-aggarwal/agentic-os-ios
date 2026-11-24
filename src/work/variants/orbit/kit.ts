import { useIsFocused } from 'expo-router';
import { useEffect } from 'react';
import { cancelAnimation, Easing, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import type { UsageWindow } from '../../types';
import { FAILED, NEEDS } from '../../ui/tokens';

// Orbit's palette, ring geometry and its one motion primitive. Everything drawn here is static SVG; the only
// things that move are whole layers (a satellite ring, the star field) turned or shifted on the UI thread.

/** Starlight: arcs and heads at rest. */
export const STAR = '#EEF2FF';
/** The blue the arcs glow with while under 70 %. */
export const HALO = '#8EA6FF';
export const HAIR = 'rgba(200,214,255,0.11)';
export const TICK = 'rgba(200,214,255,0.24)';
export const TICK_MAJOR = 'rgba(200,214,255,0.46)';
export const CHIP_BG = 'rgba(200,214,255,0.045)';
export const CHIP_LINE = 'rgba(200,214,255,0.16)';

/** Warning colour from 70 %, danger from 90 %, null below. */
export const level = (p: number) => (p >= 90 ? FAILED : p >= 70 ? NEEDS : null);
export const clampPct = (p: number) => Math.min(100, Math.max(0, Number.isFinite(p) ? p : 0));

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const clock = (d: Date) => {
  const h = d.getHours();
  return `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
};
/** When a window resets: "4:30 pm" within 20 hours, else "Sun 6:30 pm". Falls back to the PC's own words. */
export function resetWhen(w: UsageWindow, now = Date.now()) {
  const t = w.resetsAt ? Date.parse(w.resetsAt) : NaN;
  if (!Number.isFinite(t)) return w.reset;
  const d = new Date(t);
  return t - now < 20 * 3_600_000 ? clock(d) : `${DAYS[d.getDay()]} ${clock(d)}`;
}

// ---- geometry: fractions run clockwise from 12 o'clock ----
const TAU = Math.PI * 2;
const n = (v: number) => Math.round(v * 100) / 100;
export function polar(c: number, r: number, f: number) {
  const a = f * TAU - Math.PI / 2;
  return { x: n(c + r * Math.cos(a)), y: n(c + r * Math.sin(a)) };
}
/** An arc from 12 o'clock through `f` of the circle; '' for nothing. */
export function arcPath(c: number, r: number, f: number) {
  if (f <= 0.002) return '';
  if (f >= 0.9995) return `M${n(c)} ${n(c - r)}A${n(r)} ${n(r)} 0 1 1 ${n(c)} ${n(c + r)}A${n(r)} ${n(r)} 0 1 1 ${n(c)} ${n(c - r)}`;
  const a = polar(c, r, 0), b = polar(c, r, f);
  return `M${a.x} ${a.y}A${n(r)} ${n(r)} 0 ${f > 0.5 ? 1 : 0} 1 ${b.x} ${b.y}`;
}
/** Radial tick marks at the given percents, as one path. */
export function ticks(c: number, r0: number, r1: number, at: number[]) {
  return at.map((p) => { const a = polar(c, r0, p / 100), b = polar(c, r1, p / 100); return `M${a.x} ${a.y}L${b.x} ${b.y}`; }).join('');
}
const range = (from: number, to: number, step: number) => Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step);
const minor = (from: number, to: number) => range(from, to, 2).filter((p) => p % 10 !== 0);
const major = (from: number, to: number) => range(from, to, 10);
/** The dial's tick percents: neutral below 70, the warning band 70 to 90, the danger band 90 to 100. */
export const TICKS = {
  minor: minor(2, 68), major: major(10, 60),
  warnMinor: minor(72, 88), warnMajor: major(70, 80),
  dangerMinor: minor(92, 98), dangerMajor: [90],
};

/**
 * A ring system's radii for a box `S` wide: the satellite orbit outside, the dial's ticks, then the weekly ring
 * and the minor windows inward. Built on a 168 unit system and scaled.
 */
export function rings(S: number) {
  const k = S / 168;
  return {
    c: S / 2, k,
    sat: 77 * k,
    tickOut: 71.5 * k, tickMinor: 68 * k, tickMajor: 65 * k,
    track: [58.5 * k, 50 * k, 43.5 * k, 38 * k],
    width: [3.6 * k, 2.4 * k, 2 * k, 1.8 * k],
    /** Radius left for the core text when there are `inner` minor rings. */
    core: (inner: number) => [52, 44, 38, 33][Math.min(inner, 3)] * k,
  };
}

/**
 * A clock that counts up by 1 every `period` ms on the UI thread while `on`, and holds where it is otherwise.
 * Off when the screen isn't focused and under Reduce Motion. Read it as `t % 1` for a turn.
 */
export function useOrbitClock(period: number, on: boolean) {
  const focused = useIsFocused();
  const reduce = useReducedMotion();
  const run = on && focused && !reduce;
  const t = useSharedValue(0);
  useEffect(() => {
    if (!run) return;
    const from = t.get();
    t.set(withRepeat(withTiming(from + 1, { duration: period, easing: Easing.linear }), -1, false));
    return () => cancelAnimation(t);
  }, [run, period, t]);
  return t;
}
