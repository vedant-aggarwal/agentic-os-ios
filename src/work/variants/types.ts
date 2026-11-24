import type { GestureResponderEvent } from 'react-native';
import type { OrcaState, ProjectCard } from '../types';

// The Work page's design slots. A design draws the page's head (title, Orca status, the usage limits), may lay an
// ambient layer behind the list, and may restyle section headers and Active project tiles. Rows, cards, sheets and
// all behaviour stay shared (src/work/ui), so every design works the same way.

export type HeaderProps = {
  /** Orca's agents and usage; null until the PC answers. `orca.up` false: Orca isn't running on the PC. */
  orca: OrcaState | null;
  /** Why Orca's state couldn't be read, when it couldn't. */
  orcaError: string | null;
  /** Tap on the Orca status: a notice says what Orca is doing. */
  onOrcaPress: () => void;
  /** What waits on him and what runs right now (app jobs and Orca agents), and how many projects are Active. */
  counts: { needs: number; live: number; active: number };
};

export type SectionHeaderProps = {
  title: string; count?: number; add?: { label: string; onPress: () => void }; extra?: React.ReactNode;
};

export type TileProps = {
  project: ProjectCard; orcaWorking: number; orcaWaiting: number;
  onPress: () => void; onLongPress: (e: GestureResponderEvent) => void;
};

export type WorkDesign = {
  key: string;
  /** Shown in the design switcher. */
  name: string;
  /** The page head. Required. */
  Header: (p: HeaderProps) => React.ReactElement;
  /** Behind the list, full screen, under the chrome. Keep it cheap: static, or UI-thread animation only. */
  Ambient?: () => React.ReactElement | null;
  SectionHeader?: (p: SectionHeaderProps) => React.ReactElement | null;
  /** One Active project tile; two sit side by side. */
  Tile?: (p: TileProps) => React.ReactElement;
};
