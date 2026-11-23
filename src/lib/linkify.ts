// Finds the links in a piece of chat text: web addresses, agenticos:// links and file paths on the PC. Pure (no React,
// no native modules) so scripts/linkify-check.ts can test it with bun.
//
// Matches: http(s):// and agenticos:// addresses; absolute Windows paths (C:\a\b.ts, C:/a/b.ts); and, when the text
// belongs to a job with a folder, paths inside it (src/foo.ts, ./foo.ts, src/foo.ts:42, foo.ts:42). A trailing :N or
// :N:M is a line number. Plain words with a slash or a dot (and/or, e.g., v2.0, Node.js/Express.js) stay text: a
// relative path needs a known file extension and at least one folder name without a dot.

export type Seg =
  | { t: 'text'; text: string }
  | { t: 'url'; text: string; url: string }
  | { t: 'app'; text: string; url: string }
  | { t: 'file'; text: string; path: string; line?: number };

const BS = String.fromCharCode(92);
const SEP = '[/' + BS + BS + ']'; // a regex class: / or \

const EXT = new Set((
  'ts tsx js jsx mjs cjs json jsonc md mdx txt rtf py rs go java kt kts swift m mm c h cpp hpp cc cs rb php sh bash zsh ps1 psm1 bat cmd ' +
  'yml yaml toml ini cfg conf css scss sass less html htm xml svg sql csv tsv log lock vue svelte prisma graphql gradle plist ' +
  'png jpg jpeg gif webp bmp heic pdf mp4 mov mp3 wav m4a zip docx doc xlsx xls pptx ppt apk ipa'
).split(' '));

// each ends before whitespace and quotes
const URL_RE = '(?:https?|agenticos)://[^\\s<>"\'`]+';
const WIN_RE = '[A-Za-z]:' + SEP + '[^\\s<>"\'`|?*:()\\[\\]{}]+';
const REL_RE = '(?:\\.' + SEP + ')?(?:[\\w@+~.-]+' + SEP + ')+[\\w@+~.-]+\\.[A-Za-z][A-Za-z0-9]{0,7}';
const BARE_RE = '[\\w@+~-][\\w@+~.-]*\\.[A-Za-z][A-Za-z0-9]{0,7}(?=:\\d)';
const LINE_RE = '(?::\\d{1,7}(?::\\d{1,5})?)?';
const TOKEN = new RegExp(`(${URL_RE})|(${WIN_RE}${LINE_RE})|(${REL_RE}${LINE_RE})|(${BARE_RE}${LINE_RE})`, 'g');
const INSIDE_WORD = new RegExp('[\\w/' + BS + BS + '.:@~-]');
const SPLIT = new RegExp(SEP);

const DOMAINISH = /\.(com|in|org|net|io|dev|app|ai|co|me|us|uk|gov|edu)$/i;

/** Takes trailing sentence punctuation, and a closing bracket with no opener in the link, off the end. */
function trimEnd(s: string) {
  for (;;) {
    const last = s[s.length - 1];
    if (last && '.,;:!?\'"*_'.includes(last)) { s = s.slice(0, -1); continue; }
    const open = last === ')' ? '(' : last === ']' ? '[' : last === '}' ? '{' : null;
    if (open && s.split(last).length > s.split(open).length) { s = s.slice(0, -1); continue; }
    return s;
  }
}

const lineOf = (s: string) => {
  const m = /:(\d+)(?::\d+)?$/.exec(s);
  return m ? { path: s.slice(0, m.index), line: Math.max(1, Number(m[1])) } : { path: s, line: undefined };
};

const ext = (p: string) => (/\.([A-Za-z0-9]+)$/.exec(p)?.[1] ?? '').toLowerCase();

/** True when `path` (a relative path without its :line) looks like a real file in the job's folder. */
function plausibleRelative(path: string) {
  if (!EXT.has(ext(path))) return false;
  const parts = path.split(SPLIT);
  if (parts.includes('..')) return false;
  const dotted = parts[0] === '.';
  const dirs = parts.slice(dotted ? 1 : 0, -1);
  if (!dirs.length) return dotted || parts.length === 1; // ./foo.ts, or a bare name that came with a :line
  if (dotted) return true;
  if (DOMAINISH.test(dirs[0])) return false; // example.com/page.html
  if (dirs.every((d) => d.includes('.') && !/^\.[A-Za-z]/.test(d))) return false; // Node.js/Express.js
  return true;
}

/** Splits text into plain runs and links. `folder` (a job's working folder) turns on relative paths. */
export function linkify(text: string, opts: { folder?: string | null } = {}): Seg[] {
  const out: Seg[] = [];
  let at = 0;
  const plain = (to: number) => { if (to > at) out.push({ t: 'text', text: text.slice(at, to) }); };
  for (const m of text.matchAll(TOKEN)) {
    const start = m.index ?? 0;
    // a path starting in the middle of a word or another path is not a path
    if (!m[1] && start > 0 && INSIDE_WORD.test(text[start - 1])) continue;
    if (start < at) continue;
    const tok = trimEnd(m[0]);
    if (!tok) continue;
    let link: Seg;
    if (m[1]) {
      if (/^agenticos:\/\/./i.test(tok)) link = { t: 'app', text: tok, url: tok };
      else if (/^https?:\/\/[^/?#\s]*[A-Za-z0-9]/i.test(tok)) link = { t: 'url', text: tok, url: tok };
      else continue;
    } else {
      const { path, line } = lineOf(tok);
      if (m[2]) {
        if (path.length < 4) continue;
        link = { t: 'file', text: tok, path: toWindows(path), line };
      } else {
        if (!opts.folder || !plausibleRelative(path)) continue;
        link = { t: 'file', text: tok, path: resolveRelative(path, opts.folder), line };
      }
    }
    plain(start);
    out.push(link);
    at = start + tok.length;
  }
  plain(text.length);
  return out;
}

/** A path with backslashes, doubled separators tidied and an upper-case drive letter. */
export function toWindows(p: string) {
  return p.split('/').join(BS).split(BS + BS).join(BS).replace(/^([a-z]):/, (_, d: string) => d.toUpperCase() + ':');
}

/** A path inside the job's folder as an absolute Windows path. */
export function resolveRelative(rel: string, folder: string) {
  let base = toWindows(folder);
  while (base.endsWith(BS)) base = base.slice(0, -1);
  let tail = toWindows(rel);
  if (tail.startsWith('.' + BS)) tail = tail.slice(2);
  return base + BS + tail;
}
