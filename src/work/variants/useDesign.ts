import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import { kv } from '../kv';
import { DESIGNS } from './registry';
import type { WorkDesign } from './types';

// Which Work design is on. Kept on the device; on web `?design=<key>` picks one for a preview tab.

const KEY = 'work.design.v1';
const subs = new Set<() => void>();
let current = 'current';

const fromUrl = Platform.OS === 'web' ? new URLSearchParams(globalThis.location?.search ?? '').get('design') : null;
if (fromUrl) current = fromUrl;
else kv.get(KEY).then((v) => { if (v && v !== current) { current = v; subs.forEach((f) => f()); } }, () => {});

export function setWorkDesign(key: string) {
  current = key;
  kv.set(KEY, key).catch(() => {});
  subs.forEach((f) => f());
}

export function useWorkDesign(): WorkDesign {
  const key = useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => current);
  return DESIGNS.find((d) => d.key === key) ?? DESIGNS[0];
}
