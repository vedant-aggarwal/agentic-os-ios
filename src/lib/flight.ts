// Where each channel tile sits on the home grid, so a finished Concept Generator sheet can fly into it.
type View = { measureInWindow(cb: (x: number, y: number, width: number, height: number) => void): void };
const tiles = new Map<string, View>();
const landers = new Map<string, Set<() => void>>();

export function registerTile(channelId: string, view: View | null) {
  if (view) tiles.set(channelId, view);
  else tiles.delete(channelId);
}

export type Rect = { x: number; y: number; width: number; height: number };

/** The tile's rectangle in window coordinates, or null when it isn't on screen. */
export function measureTile(channelId: string): Promise<Rect | null> {
  const v = tiles.get(channelId);
  if (!v) return Promise.resolve(null);
  return new Promise((resolve) => v.measureInWindow((x, y, width, height) => resolve(width ? { x, y, width, height } : null)));
}

/** Tell a tile something just landed in it (it plays its catch animation). */
export function land(channelId: string) {
  landers.get(channelId)?.forEach((f) => f());
}

export function onLand(channelId: string, f: () => void) {
  if (!landers.has(channelId)) landers.set(channelId, new Set());
  landers.get(channelId)!.add(f);
  return () => {
    landers.get(channelId)?.delete(f);
  };
}
