import type { WorkDesign } from '../types';
import { Ambient } from './Ambient';
import { Card } from './Card';
import { Chapter } from './Chapter';
import { Header } from './Header';

// Editorial: the Work page as a design magazine cover. See ink.ts for the palette and type.
export const design: WorkDesign = { key: 'editorial', name: 'Editorial', Header, Ambient, SectionHeader: Chapter, Tile: Card };
