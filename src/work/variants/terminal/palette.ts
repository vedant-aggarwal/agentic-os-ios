import { Platform, StyleSheet } from 'react-native';
import { F } from '@/theme';

// Terminal: a mission-control console. Phosphor green for normal, amber for a warning, red for danger, on near-black.
// Mono for everything the console reads out; Geist only for the page title.

export const P = {
  green: '#3DDC97',
  amber: '#FFB547',
  red: '#FF6161',
  text: '#E4F2EA', // phosphor-tinted white
  soft: '#B6CABF',
  dim: '#7F968A', // labels and meta: about 6:1 on the panes
  faint: '#55685D', // rules and quiet glyphs only
  pane: 'rgba(6,11,9,0.84)',
  rule: 'rgba(61,220,151,0.16)',
  ruleStrong: 'rgba(61,220,151,0.42)',
} as const;

/** The platform's monospace (Geist Mono isn't loaded). */
export const MONO = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
});

/** A hex colour at an alpha, for tints, rules and glows. */
export const alpha = (hex: string, a: number) => `${hex}${Math.round(a * 255).toString(16).padStart(2, '0')}`;

/** Green under 70 %, amber from 70 %, red from 90 %. */
export const level = (p: number) => (p >= 90 ? P.red : p >= 70 ? P.amber : P.green);

export const M = StyleSheet.create({
  title: { fontFamily: F.semibold, fontSize: 30, lineHeight: 36, letterSpacing: -0.6, color: P.text },
  /** Upper-case console labels: LIMITS, WEEK, NEEDS YOU. */
  label: { fontFamily: MONO, fontWeight: '700', fontSize: 10, lineHeight: 14, letterSpacing: 1.6, textTransform: 'uppercase', color: P.dim },
  body: { fontFamily: MONO, fontSize: 12, lineHeight: 16, color: P.soft },
  meta: { fontFamily: MONO, fontSize: 11, lineHeight: 14, color: P.dim, fontVariant: ['tabular-nums'] },
});
