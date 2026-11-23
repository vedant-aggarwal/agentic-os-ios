/** A message to or from the pet's scene (pet-scene/main.js, recv()). */
export type PetMsg = { t: string; [k: string]: unknown };

export type PetHandle = { send: (m: PetMsg) => void };

/** Read by the scene once, at load. box: where the pet's square sits in the canvas (pt). */
export type PetCfg = {
  size: number;
  small: boolean;
  box: { x: number; y: number; s: number };
  dpr: number;
  shadow: number;
  state: Record<string, number | boolean>;
};
