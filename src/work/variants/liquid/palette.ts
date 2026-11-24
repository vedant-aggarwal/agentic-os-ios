import { FAILED, LIVE, NEEDS } from '../../ui/tokens';

// Liquid's colours. The liquid carries the level: cool teal while there is room, amber from 70 %, red from 90 %.
// The glass itself stays colourless; the aurora behind the page is the only other colour.

export type Tone = {
  /** The bright band just under the surface, and the meniscus line. */
  surface: string;
  body: string;
  /** The colour near the bottom of a full vessel. */
  deep: string;
  /** The light the liquid throws around its vessel. */
  glow: string;
  /** Text that names the level. */
  ink: string;
};

export const COOL: Tone = { surface: '#A6FBEC', body: '#2EC4B6', deep: '#08404B', glow: '#25D0BC', ink: '#7FEFDD' };
export const WARM: Tone = { surface: '#FFE0B0', body: NEEDS, deep: '#5C1F07', glow: '#FF9548', ink: NEEDS };
export const HOT: Tone = { surface: '#FFC6C4', body: FAILED, deep: '#5E1019', glow: '#FF5464', ink: FAILED };

export const toneFor = (pct: number): Tone => (pct >= 90 ? HOT : pct >= 70 ? WARM : COOL);

/** The design's own accent, for marks that carry no state. */
export const AQUA = '#7FEFDD';

export { LIVE, NEEDS };
