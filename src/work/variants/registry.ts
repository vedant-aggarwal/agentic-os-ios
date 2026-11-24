import { design as current } from './current';
import { design as editorial } from './editorial';
import { design as liquid } from './liquid';
import { design as orbit } from './orbit';
import { design as terminal } from './terminal';
import type { WorkDesign } from './types';

// Every Work page design, in the switcher's order. "Now" is the design from before the design round.
export const DESIGNS: WorkDesign[] = [current, orbit, terminal, liquid, editorial];
