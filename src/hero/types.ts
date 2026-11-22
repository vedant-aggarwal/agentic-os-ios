/** A message to or from the hero scene (hero-scene/main.js). */
export type SceneMsg = { t: string; [k: string]: unknown };

export type SurfaceHandle = { send: (m: SceneMsg) => void };
