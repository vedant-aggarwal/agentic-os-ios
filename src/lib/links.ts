// One way into any screen: agenticos://<target>/<part...>?<query>.
// Deep links (src/app/+native-intent.tsx), notification taps, widgets, alarms and incoming calls all call openLink;
// the screen that owns a target listens with onLink. A link that arrives before its screen is mounted (a tap that
// launched the app) waits and is handed over when the listener registers.
//
// Targets in use:
//   <aspect>/<part>      a section page on one of its parts. Today opens the page and hands it the part (useEntry in
//                        src/aspects/context.ts); a bare <aspect> is the page's home. (*) marks links the PC sends.
//     body               gym, diet, face, voice; looks (*, the PM protocol push: Face); diet/meal (log a meal);
//                        gym/weigh (log weight)
//     mind               speak, read, courses, recall, drill/<id>, review/<id>; checkin (*, no screen yet: home)
//     soul               clean (*), journal (*), blocker (*, the lock question: Clean, where the plans are),
//                        write (a new entry), meditate, moment (the rough moment)
//     mission            (* bare: home, with the week); goal/<id>, ladder, projects, purpose, record, close,
//                        add[?aspect=<key>] (that section picked)
//     money              earn, spend, flow (*, = spend), save, jars (= save), statement[/<id>] (*)
//     growth             score, review (*), rules, reviews, time[/<aspect>], wheel/<aspect>;
//                        journal (*, Growth's streak push: goes to soul/journal)
//     family             person/<id>, date/<id>, memories[/<person id>], add
//     friends            person/<id>, plans, new, plan[?person=<id>], add
//     romance            people, person/<id>, debriefs, primer, out
//     life/score         (*) the life module's wheel push: growth/score (src/lib/aspectLinks.ts holds the aliases)
//   job/<id>             a job's thread in the Projects hub (a route)
//   orca/<id>            an Orca agent's thread (a route)
//   work[/jobs|/ideas|/<project>|/job/<id>|/orca/<id>|/resolved/<id>]  the Projects hub or one of its pages (a route)
//   term/<id>            an agent terminal's "needs you" / "finished" push: the Projects hub (no terminal view yet)
//   nora[/chat|/call]    Nora: chat, or a call (?id=<call id> to join one that is ringing)
//   tasks                Home, his task list (src/nora/NoraHost.tsx)
//   task/<id>            that task's view, over any screen (src/work/sheets/WorkSheets.tsx)
//   voice                the Voices page on Today
//   today                Today
//   record               the Capture widget: start a hands-free voice idea into the Work inbox (src/work/voice.ts)
// Anything else (capture, capture/share/<id>, content/..., an old or mistyped link) lands on Today instead of waiting
// forever.
//
// Today stays mounted under the Projects hub's pages, so a link for Today (a section, Nora, tasks) first goes back to
// Today; otherwise it would open behind the page he is looking at.

import { router } from 'expo-router';
import { SECTION_TARGETS } from './aspectLinks';
import { plog } from './log';

export type Link = { target: string; parts: string[]; query: Record<string, string>; url: string };
type Handler = (link: Link) => void;

/** Targets drawn on Today: before one opens, any Projects page on top of Today is closed. */
const ON_TODAY = new Set([...SECTION_TARGETS, 'today', 'nora', 'tasks', 'voice']);
/** Targets drawn over whatever screen is open: delivered where he is. */
const OVER_ANY = new Set(['record', 'task']);
/** Routes that aren't links: dev pages reached by path. */
const PLAIN_ROUTES = new Set(['petlab']);
/** Projects hub words that mean the hub itself, not a project called that. */
const HUB_WORDS = new Set(['jobs', 'ideas', 'inbox', 'hub', 'night', 'sessions']);

const enc = encodeURIComponent;

const handlers = new Map<string, Set<Handler>>();
const waiting = new Map<string, Link>(); // newest unhandled link per target

/** Parses agenticos://a/b?c=d, /a/b?c=d or a/b into { target: 'a', parts: ['b'], query: { c: 'd' } }; null if empty. */
export function parseLink(url: string): Link | null {
  let rest = url.trim().replace(/^agenticos:\/\//i, '').replace(/^\/+/, '');
  const q = rest.indexOf('?');
  const query: Record<string, string> = {};
  if (q >= 0) {
    for (const kv of rest.slice(q + 1).split('&')) {
      if (!kv) continue;
      const [k, v = ''] = kv.split('=');
      try { query[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' ')); } catch { query[k] = v; }
    }
    rest = rest.slice(0, q);
  }
  const segs = rest.split('/').filter(Boolean).map((s) => { try { return decodeURIComponent(s); } catch { return s; } });
  if (!segs.length) return null;
  return { target: segs[0].toLowerCase(), parts: segs.slice(1), query, url };
}

/** The screen (an expo-router path) a link opens as a route, or null when it opens on Today or over the open screen. */
export function routeFor(link: Link): string | null {
  const [a, b] = link.parts;
  switch (link.target) {
    case 'job': return a ? `/work/job/${enc(a)}` : '/work';
    case 'orca': return a ? `/work/orca/${enc(a)}` : '/work';
    case 'term': return '/work';
    case 'work':
      if (!a || HUB_WORDS.has(a.toLowerCase())) return '/work';
      if ((a === 'job' || a === 'orca' || a === 'resolved') && b) return `/work/${a}/${enc(b)}`;
      return `/work/${enc(a)}`; // a project page (or work/fan-lab)
    default: return null;
  }
}

/** Is this path one of the app's own routes rather than a link (a dev page)? */
export const isPlainRoute = (link: Link) => PLAIN_ROUTES.has(link.target);

// A push tapped while the app was closed arrives before the navigator is up (the root layout waits for its fonts):
// try again every quarter second for up to ten seconds.
function go(path: string, tries = 0) {
  try { router.push(path as never); } catch { if (tries < 40) setTimeout(() => go(path, tries + 1), 250); }
}

// Today sits at the bottom of the stack: close the Projects pages above it. After this tick, so a deep link being
// handled by the router (src/app/+native-intent.tsx) finishes first.
function backToToday() {
  setTimeout(() => {
    try { if (router.canDismiss()) router.dismissAll(); } catch {}
  }, 0);
}

function deliver(link: Link): boolean {
  const hs = handlers.get(link.target);
  if (!hs?.size) { waiting.set(link.target, link); return false; }
  for (const h of hs) h(link);
  return true;
}

/** Opens a link: a route, a screen on Today, or something drawn over the open screen. Returns false when the screen
 * that handles it isn't up yet (the link then waits for it). */
export function openLink(url: string): boolean {
  const link = parseLink(url);
  if (!link) return false;
  const route = routeFor(link);
  if (route) { go(route); return true; }
  if (OVER_ANY.has(link.target)) return deliver(link);
  if (!ON_TODAY.has(link.target)) {
    plog('link: no screen for', url, '- opening Today');
    backToToday();
    return deliver({ target: 'today', parts: [], query: {}, url: 'agenticos://today' });
  }
  backToToday();
  return deliver(link);
}

/** Listens for links to `target`. A link that was waiting for it is delivered at once. Returns the unsubscribe. */
export function onLink(target: string, handler: Handler): () => void {
  const key = target.toLowerCase();
  let hs = handlers.get(key);
  if (!hs) { hs = new Set(); handlers.set(key, hs); }
  hs.add(handler);
  const w = waiting.get(key);
  if (w) { waiting.delete(key); handler(w); }
  return () => { hs.delete(handler); };
}
