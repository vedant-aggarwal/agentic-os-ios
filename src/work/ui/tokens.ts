import { Easing } from 'react-native-reanimated';
import { ASPECT_COLOR, C, F } from '@/theme';

// The hub's few extra tokens. Colour carries state only: green while an agent works (the work family's
// colour, the same green as the top bar's live dot), coral when something waits on him, red when a job failed.
export const LIVE = ASPECT_COLOR.mission;
export const NEEDS = '#FFA15C';
export const FAILED = C.danger;

/** Press feedback and small fills: 120 to 160 ms on the build rules' curve. */
export const EASE = Easing.bezier(0.23, 1, 0.32, 1);

/** Page side gutter, and the column every row's leading mark sits in, so all rows line up. */
export const GUTTER = 16;
export const LEAD = 24;

export const T = {
  title: { fontFamily: F.semibold, fontSize: 30, lineHeight: 36, letterSpacing: -0.6, color: C.text },
  row: { fontFamily: F.medium, fontSize: 16, lineHeight: 22, color: C.text },
  sub: { fontFamily: F.regular, fontSize: 14, lineHeight: 20, color: C.faint },
  meta: { fontFamily: F.medium, fontSize: 12, lineHeight: 16, color: C.faint, fontVariant: ['tabular-nums' as const] },
  label: { fontFamily: F.semibold, fontSize: 14, lineHeight: 20, color: C.muted },
  button: { fontFamily: F.semibold, fontSize: 14, lineHeight: 20, color: C.text },
} as const;
