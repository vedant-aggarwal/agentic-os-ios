import type { WorkDesign } from '../types';
import { Aurora } from './Aurora';
import { LiquidHeader } from './Header';
import { LiquidSectionHeader, LiquidTile } from './List';

// Liquid: fluid glass. Each account's weekly limit is a glass capsule of glowing liquid filled to the share used,
// its surface always moving a little; the colour warms with the level. Orca is a frosted pill with a breathing
// dot, the list sits on a slow aurora, and Active tiles carry a thin line of liquid that flows while agents work.
export const design: WorkDesign = {
  key: 'liquid',
  name: 'Liquid',
  Header: LiquidHeader,
  Ambient: Aurora,
  SectionHeader: LiquidSectionHeader,
  Tile: LiquidTile,
};
