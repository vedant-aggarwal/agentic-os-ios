import * as Haptics from 'expo-haptics';
import { StyleSheet } from 'react-native';
import { Easing, ReduceMotion } from 'react-native-reanimated';
import { tap } from '@/components/Glass';
import { C, F } from '@/theme';

// The shared look of every aspect page. One typeface (Geist), sizes on the Tailwind scale, spacing from one
// short list, white-alpha surfaces on the dark scene. Colour comes only from the aspect, and only where it means
// something: what belongs to the aspect, what is done, what is live.

/** Type. Always a size with its line height. Add `t.num` to any number that changes. */
export const t = StyleSheet.create({
  display: { fontFamily: F.semibold, fontSize: 48, lineHeight: 48, letterSpacing: -1.4, color: C.text },
  big: { fontFamily: F.semibold, fontSize: 36, lineHeight: 40, letterSpacing: -0.9, color: C.text },
  title: { fontFamily: F.semibold, fontSize: 30, lineHeight: 36, letterSpacing: -0.6, color: C.text },
  title2: { fontFamily: F.semibold, fontSize: 24, lineHeight: 32, letterSpacing: -0.5, color: C.text },
  heading: { fontFamily: F.semibold, fontSize: 20, lineHeight: 28, letterSpacing: -0.3, color: C.text },
  lead: { fontFamily: F.medium, fontSize: 18, lineHeight: 28, letterSpacing: -0.2, color: C.text },
  body: { fontFamily: F.regular, fontSize: 16, lineHeight: 24, color: C.textSoft },
  strong: { fontFamily: F.medium, fontSize: 16, lineHeight: 24, color: C.text },
  label: { fontFamily: F.medium, fontSize: 14, lineHeight: 20, color: C.muted },
  section: { fontFamily: F.semibold, fontSize: 14, lineHeight: 20, color: C.muted },
  small: { fontFamily: F.regular, fontSize: 14, lineHeight: 20, color: C.muted },
  caption: { fontFamily: F.regular, fontSize: 12, lineHeight: 16, color: C.faint },
  num: { fontVariant: ['tabular-nums'] },
  // The life pages' scale (iOS sizes, set in Geist). The keys above stay for the rest of the app.
  /** One number per screen that IS the screen: Day 37, the session clock, this month's income. */
  hero: { fontFamily: F.semibold, fontSize: 64, lineHeight: 68, letterSpacing: -2.6, color: C.text },
  /** The page's own name at the top, and a big stat. */
  large: { fontFamily: F.semibold, fontSize: 34, lineHeight: 40, letterSpacing: -1.1, color: C.text },
  /** The lead card's title: today's session, this week's move. */
  title3: { fontFamily: F.semibold, fontSize: 22, lineHeight: 28, letterSpacing: -0.5, color: C.text },
  /** Group titles and anything that must read first in a row. */
  headline: { fontFamily: F.semibold, fontSize: 17, lineHeight: 22, letterSpacing: -0.25, color: C.text },
  /** A row's title. */
  callout: { fontFamily: F.medium, fontSize: 16, lineHeight: 22, letterSpacing: -0.15, color: C.text },
  /** Sentences. */
  subhead: { fontFamily: F.regular, fontSize: 15, lineHeight: 21, letterSpacing: -0.1, color: C.textSoft },
  /** A row's second line, a date, a source. */
  footnote: { fontFamily: F.regular, fontSize: 13, lineHeight: 18, color: C.muted },
  /** Axis letters and the smallest labels. */
  micro: { fontFamily: F.medium, fontSize: 11, lineHeight: 14, letterSpacing: 0.1, color: C.faint },
});

/** Spacing: use only these. Page padding is 16, the gap between sections 24, inside a card 16. */
export const SP = { 2: 2, 4: 4, 8: 8, 12: 12, 16: 16, 24: 24, 32: 32, 40: 40, 48: 48, 64: 64 } as const;

/** Corner radii. A shape nested in a padded card takes the card's radius minus the padding (16 in a 24 card: 8). */
export const R = { chip: 12, card: 24, inner: 8, row: 16, sheet: 28, group: 22, tile: 18 } as const;

/** Surfaces: white at low alpha on the dark scene. */
export const SURF = {
  row: 'rgba(255,255,255,0.04)',
  card: 'rgba(255,255,255,0.07)',
  raised: 'rgba(255,255,255,0.10)',
  pressed: 'rgba(255,255,255,0.14)',
  line: 'rgba(255,255,255,0.12)',
  track: 'rgba(255,255,255,0.08)',
  /** A Group's fill: one surface holding many rows. */
  group: 'rgba(255,255,255,0.055)',
  /** The line between rows inside a Group, and its rim. */
  hair: 'rgba(255,255,255,0.08)',
  /** The light catching a raised surface's top edge. */
  edge: 'rgba(255,255,255,0.13)',
} as const;

/** An aspect colour at an alpha (0..1), for soft fills and borders: `tint(color, 0.16)`. */
export function tint(color: string, alpha: number) {
  const a = Math.round(Math.min(Math.max(alpha, 0), 1) * 255).toString(16).padStart(2, '0');
  return `${color.slice(0, 7)}${a}`;
}

/** Motion. Springs for anything that moves, no bounce; timings for fades. All of it stands still under Reduce Motion. */
export const MOTION = {
  spring: { duration: 420, dampingRatio: 1, reduceMotion: ReduceMotion.System },
  slow: { duration: 700, dampingRatio: 0.9, reduceMotion: ReduceMotion.System },
  fade: { duration: 160, easing: Easing.bezier(0.23, 1, 0.32, 1), reduceMotion: ReduceMotion.System },
} as const;

/** Haptics, silent on web. `tick` for a selection changing, `light` for a tap, `medium` for completing, `success` for a goal met. */
export const haptic = {
  light: () => tap(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  medium: () => tap(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  tick: () => tap(() => Haptics.selectionAsync()),
  success: () => tap(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warn: () => tap(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
};
