import type { JobDiff } from '../types';

// Unified diff text into lines the viewer draws, with old and new line numbers.

export type DiffLine = { t: 'hunk' | 'add' | 'del' | 'ctx' | 'meta'; text: string; num: number | null };
export type ParsedDiff = { lines: DiffLine[]; notes: string[]; width: number };

const MAX_LINE = 2000; // longer lines are cut so one minified file can't stall the view

/** Splits a multi-file patch by its `diff --git a/x b/y` headers, keyed by the new path. */
export function splitPatch(patch: string): Map<string, string> {
  const out = new Map<string, string>();
  const re = /^diff --git a\/(.+?) b\/(.+)$/gm;
  const heads = [...patch.matchAll(re)];
  heads.forEach((m, i) => {
    const end = i + 1 < heads.length ? heads[i + 1].index : patch.length;
    out.set(m[2], patch.slice(m.index, end));
  });
  return out;
}

/** The patch for one file: per file in the contract, or one string for the request on the current server. */
export function pickPatch(d: JobDiff, path: string): string {
  const f = d.files.find((x) => x.path === path);
  if (typeof f?.patch === 'string') return f.patch;
  const whole = (d as JobDiff & { patch?: string }).patch ?? '';
  const parts = splitPatch(whole);
  if (!parts.size) return whole;
  return parts.get(path) ?? [...parts.entries()].find(([k]) => k.endsWith(path) || path.endsWith(k))?.[1] ?? '';
}

export function parsePatch(patch: string): ParsedDiff {
  const lines: DiffLine[] = [];
  const notes: string[] = [];
  let oldN = 0, newN = 0, inHunk = false, width = 0;
  for (const raw of patch.replace(/\r\n/g, '\n').split('\n')) {
    if (!inHunk || raw.startsWith('diff --git')) {
      if (raw.startsWith('new file mode')) notes.push('New file');
      else if (raw.startsWith('deleted file mode')) notes.push('Deleted file');
      else if (raw.startsWith('rename from ')) notes.push(`Renamed from ${raw.slice(12)}`);
      else if (raw.startsWith('Binary files')) notes.push('Binary file, no text to show');
    }
    const h = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/.exec(raw);
    if (h) {
      inHunk = true;
      oldN = Number(h[1]); newN = Number(h[2]);
      lines.push({ t: 'hunk', text: h[3].trim() ? `@@ ${h[3].trim()}` : `Line ${newN}`, num: null });
      continue;
    }
    if (!inHunk) continue;
    if (raw.startsWith('diff --git')) { inHunk = false; continue; }
    const text = (raw.length > MAX_LINE ? `${raw.slice(0, MAX_LINE)}…` : raw).replace(/\t/g, '  ');
    const c = raw[0];
    if (c === '+') { lines.push({ t: 'add', text, num: newN++ }); }
    else if (c === '-') { lines.push({ t: 'del', text, num: oldN++ }); }
    else if (c === ' ' || raw === '') {
      if (raw === '' && lines.length && lines[lines.length - 1].t === 'meta') continue;
      lines.push({ t: 'ctx', text: text || ' ', num: newN++ }); oldN++;
    } else if (c === '\\') { lines.push({ t: 'meta', text: raw.slice(2), num: null }); continue; }
    else { lines.push({ t: 'meta', text, num: null }); continue; }
    if (text.length > width) width = text.length;
  }
  // a trailing blank context line is the patch's final newline, not content
  while (lines.length && lines[lines.length - 1].t === 'ctx' && lines[lines.length - 1].text === ' ') lines.pop();
  return { lines, notes, width };
}
