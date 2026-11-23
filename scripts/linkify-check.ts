// Quick check of src/lib/linkify.ts. Run from the app folder: bun scripts/linkify-check.ts
import { linkify, type Seg } from '../src/lib/linkify';

const assert = {
  deepEqual(got: unknown, want: unknown, msg: string) {
    if (JSON.stringify(got) !== JSON.stringify(want)) throw new Error(`${msg}
  got  ${JSON.stringify(got)}
  want ${JSON.stringify(want)}`);
  },
  equal(got: string, want: string) { if (got !== want) throw new Error(`text changed: ${JSON.stringify(got)} vs ${JSON.stringify(want)}`); },
};

const BS = String.fromCharCode(92);
const win = (p: string) => p.split('/').join(BS);
const F = 'C:/Users/VEDANT/proj';
const links = (s: string, folder: string | null = F) => linkify(s, { folder }).filter((x) => x.t !== 'text')
  .map((x) => (x.t === 'file' ? `file:${x.path}${x.line ? `#${x.line}` : ''}` : `${x.t}:${(x as { url: string }).url}`));
let n = 0;
const eq = (s: string, want: string[], folder: string | null = F) => { assert.deepEqual(links(s, folder), want, JSON.stringify(s)); n++; };
const rebuilt = (s: string) => linkify(s, { folder: F }).map((x: Seg) => x.text).join('');
const P = 'C:/Users/VEDANT/proj/';

// web and app links
eq('see https://example.com/a?b=1.', ['url:https://example.com/a?b=1']);
eq('(https://en.wikipedia.org/wiki/Foo_(bar))', ['url:https://en.wikipedia.org/wiki/Foo_(bar)']);
eq('(see https://example.com/x)', ['url:https://example.com/x']);
eq('go to https://a.in, then https://b.in!', ['url:https://a.in', 'url:https://b.in']);
eq('open agenticos://job/abc123 now', ['app:agenticos://job/abc123']);
eq('http://localhost:8081/path:3000', ['url:http://localhost:8081/path:3000']);
eq('`https://x.io/y`', ['url:https://x.io/y']);
eq('https:// alone', []);

// absolute Windows paths
eq(`edit C:${BS}Users${BS}VEDANT${BS}a.ts now`, [win('file:C:/Users/VEDANT/a.ts')]);
eq('edit c:/work/a.ts:42.', [win('file:C:/work/a.ts#42')]);
eq('in C:/work/a.ts:42:7, done', [win('file:C:/work/a.ts#42')]);
eq('folder C:/Users/VEDANT/Downloads.', [win('file:C:/Users/VEDANT/Downloads')]);
eq('(C:/x/y.png)', [win('file:C:/x/y.png')]);
eq('abs works without a folder C:/x/y.png', [win('file:C:/x/y.png')], null);

// relative to the job's folder
eq('look at src/foo.ts', [win(`file:${P}src/foo.ts`)]);
eq('look at src/foo.ts:42', [win(`file:${P}src/foo.ts#42`)]);
eq('look at `src/work/thread/Markdown.tsx:9`.', [win(`file:${P}src/work/thread/Markdown.tsx#9`)]);
eq('see ./README.md and docs/a-b_c.md', [win(`file:${P}README.md`), win(`file:${P}docs/a-b_c.md`)]);
eq(`server${BS}index.ts`, [win(`file:${P}server/index.ts`)]);
eq('in index.ts:12 it breaks', [win(`file:${P}index.ts#12`)]);
eq('the .github/workflows/ci.yml file', [win(`file:${P}.github/workflows/ci.yml`)]);
eq('src/foo.ts', [], null); // no folder, no relative links

// must not over-match
for (const s of [
  'and/or', 'either/or and yes/no', 'e.g. this', 'i.e., that', 'version v2.0 and 1.2.3', 'Node.js/Express.js', 'next.js and react.js',
  'a/b', 'TCP/IP', 'w/o it', 'he said 3/4 or 1.5', 'foo.bar', 'README.md', 'ask Dr. Smith', 'cost Rs.500/-', 'example.com/page.html',
  'www.example.com', '../secret/a.ts', 'src/..', 'src/foo', 'src/foo.notanext', '10:30', 'time 12:30:45', 'C: drive', 'a:b', 'https://',
]) eq(s, []);

// text is never lost or reordered
for (const s of ['see src/foo.ts:42, then https://x.io/y. Also C:/a/b.ts!', 'plain', '', 'a/b and src/x.ts and agenticos://today']) assert.equal(rebuilt(s), s);

console.log(`linkify: ${n} checks passed`);
