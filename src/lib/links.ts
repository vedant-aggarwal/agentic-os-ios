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
//   job/<id>             a job's thread in the Projects hub (handled by +native-intent as a route)
//   nora[/chat|/call]    Nora: chat, or a call (?id=<call id> to join one that is ringing)
//   today                Today

export type Link = { target: string; parts: string[]; query: Record<string, string>; url: string };
type Handler = (link: Link) => void;

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

/** Opens a link. Returns false when nothing handles its target yet (it then waits for a listener). */
export function openLink(url: string): boolean {
  const link = parseLink(url);
  if (!link) return false;
  const hs = handlers.get(link.target);
  if (!hs?.size) { waiting.set(link.target, link); return false; }
  for (const h of hs) h(link);
  return true;
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
