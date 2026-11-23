import { useSyncExternalStore } from 'react';

// Which PC file the file sheet is showing (src/components/FileViewer.tsx). Any tapped file link calls showFile.
export type OpenFile = { path: string; line?: number; at: number };
let current: OpenFile | null = null;
const subs = new Set<() => void>();

export function showFile(path: string, line?: number) { current = { path, line, at: Date.now() }; subs.forEach((f) => f()); }
export function closeFile() { current = null; subs.forEach((f) => f()); }
export function useOpenFile() {
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => current, () => null);
}
