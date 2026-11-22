import { createContext, use } from 'react';
import type { Section } from '@/lib/today';
import type { AspectKey } from '@/theme';

/**
 * What Today shares with the section pages, so the app is one place and not ten: today's tasks by section (the very
 * rows Today draws, so a tick in a section shows on Today at once and back), the area to section map that also files
 * goals, and the tick itself. Today provides it around AspectHost; null outside it (a page previewed on its own).
 */
export type Life = { sections: Section[]; areaAspects: Record<string, AspectKey[]>; toggle: (id: string) => void };

export const LifeContext = createContext<Life | null>(null);
export const useLife = () => use(LifeContext);
