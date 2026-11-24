import { ASPECT_NAME } from '@/aspects/context';
import type { AspectKey } from '@/theme';
import type { LifePayload } from './today';

// A task's place in his life, as the pickers show it: one of the nine Life aspects (GET /life), not the agentos areas
// underneath. The task record still keeps an area; the PC maps an aspect to the area that leads with it (store.ts
// areaForAspect, making one named after the aspect when none does). The phone sends the aspect and, for a PC that
// predates that, the area its own copy of the map gives.

export const ASPECT_KEYS: AspectKey[] = ['body', 'mind', 'soul', 'mission', 'money', 'growth', 'family', 'romance', 'friends'];
export { ASPECT_NAME };

type Map = Pick<LifePayload, 'areaAspects'> | null | undefined;

/** The aspect an area leads with: where Today files its tasks. */
export const aspectOfArea = (life: Map, area: string | null | undefined): AspectKey | null =>
  (area ? life?.areaAspects[area]?.[0] ?? null : null);

/** The area that leads with this aspect on the phone's copy of the map (the one named after it first), or null. */
export function areaOfAspect(life: Map, aspect: AspectKey | null): string | null {
  if (!aspect || !life) return null;
  const led = Object.entries(life.areaAspects).filter(([, a]) => a[0] === aspect).map(([area]) => area);
  return led.includes(aspect) ? aspect : led[0] ?? null;
}

/** The fields a task write carries for a picked aspect (null clears it). */
export function aspectFields(life: Map, aspect: AspectKey | null): { aspect: AspectKey | null; area?: string | null } {
  if (!aspect) return { aspect: null, area: null };
  const area = areaOfAspect(life, aspect);
  return area ? { aspect, area } : { aspect };
}
