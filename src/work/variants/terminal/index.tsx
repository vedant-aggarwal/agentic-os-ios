import type { WorkDesign } from '../types';
import { Ambient } from './Ambient';
import { Header } from './Header';
import { SectionHeader } from './Section';
import { Tile } from './Tile';

// Terminal: the Work page as a mission-control console for an agent operator. Phosphor green, amber and red on
// near-black; usage limits as segmented block meters; Orca as a prompt line; projects as terminal panes.

export const design: WorkDesign = { key: 'terminal', name: 'Terminal', Header, Ambient, SectionHeader, Tile };
