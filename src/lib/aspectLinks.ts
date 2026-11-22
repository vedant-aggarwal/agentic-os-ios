import { ASPECT_COLOR, type AspectKey } from '@/theme';
import type { Link } from './links';

// Where a link into a section page lands. Today listens for every aspect target (and the old names below), turns the
// link into an entry with this, opens the page and hands it the entry; the page opens the part (useEntry).

export const ASPECT_KEYS = Object.keys(ASPECT_COLOR) as AspectKey[];

/** Targets that are another name for a part that lives elsewhere: links the PC already sends under an older name. */
const ALIAS: Record<string, string[]> = {
  'growth/journal': ['soul', 'journal'], // Growth's journal streak push; the journal itself lives in Soul
  'life/score': ['growth', 'score'], // the life module's "Time to score your wheel"
  life: ['growth'],
};

/** Every target Today handles: the nine aspects and the aliases' own targets. */
export const SECTION_TARGETS: string[] = [...ASPECT_KEYS, ...new Set(Object.keys(ALIAS).map((k) => k.split('/')[0]))];

let seq = 0;

/** The page and parts a link opens, or null when its target isn't a section. */
export function sectionEntry(link: Link): { aspect: AspectKey; parts: string[]; query: Record<string, string>; stamp: number } | null {
  let segs = [link.target, ...link.parts];
  for (const n of [2, 1]) {
    const to = ALIAS[segs.slice(0, n).join('/').toLowerCase()];
    if (to && segs.length >= n) { segs = [...to, ...segs.slice(n)]; break; }
  }
  const [target, ...parts] = segs;
  if (!(target in ASPECT_COLOR)) return null;
  seq += 1;
  return { aspect: target as AspectKey, parts: parts.map((p, i) => (i === 0 ? p.toLowerCase() : p)), query: link.query, stamp: seq };
}
