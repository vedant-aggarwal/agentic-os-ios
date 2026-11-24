import type { WorkDesign } from '../types';
import { OrbitAmbient } from './Ambient';
import { OrbitHeader } from './Header';
import { OrbitSectionHeader } from './Section';
import { OrbitTile } from './Tile';

// Orbit: Work as a calm cosmic instrument. Each account's limits are a ring system with Orca's agents as
// satellites; a fixed star field behind the list; orbit-chip section labels; tiles with an activity orbit.

export const design: WorkDesign = {
  key: 'orbit',
  name: 'Orbit',
  Header: OrbitHeader,
  Ambient: OrbitAmbient,
  SectionHeader: OrbitSectionHeader,
  Tile: OrbitTile,
};
