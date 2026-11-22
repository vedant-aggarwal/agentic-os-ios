import { API, currentToken, STAGE } from './api';

// Phone-side failures, sent to the PC's log (server.err.log, lines starting "[phone]") so they can be read there.
// Batched, best effort, never throws. JS errors that nothing caught are sent too.
let queue: string[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

function flush() {
  timer = null;
  const lines = queue.splice(0, 20);
  const t = currentToken();
  if (!lines.length || !t || STAGE) return; // a stage server has no /pc/log; the line is already in the console
  fetch(`${API}/pc/log`, {
    method: 'POST', headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ lines }),
  }).catch(() => {});
}

export function plog(...parts: unknown[]) {
  const line = parts.map((p) => (p instanceof Error ? `${p.name}: ${p.message}` : typeof p === 'string' ? p : JSON.stringify(p))).join(' ');
  console.warn('[plog]', line);
  queue.push(`${new Date().toISOString().slice(11, 19)} ${line}`);
  if (queue.length > 100) queue = queue.slice(-100);
  if (!timer) timer = setTimeout(flush, 800);
}

// uncaught JS errors: log them, then let React Native show them as usual
type EU = { getGlobalHandler(): (e: Error, fatal?: boolean) => void; setGlobalHandler(h: (e: Error, fatal?: boolean) => void): void };
const eu = (globalThis as { ErrorUtils?: EU }).ErrorUtils;
if (eu) {
  const prev = eu.getGlobalHandler();
  // On web, import() of a lazy chunk first asks for the module, and loads the chunk when that throws. The throw
  // passes through here once per chunk and is not a failure, so it is passed on without a FATAL line.
  const chunkProbe = (e: Error) => typeof document !== 'undefined' && /^Requiring unknown module/.test(String(e?.message ?? ''));
  eu.setGlobalHandler((e, fatal) => { if (!chunkProbe(e)) plog(fatal ? 'FATAL' : 'error', e, String(e?.stack ?? '').split('\n').slice(0, 4).join(' | ')); prev(e, fatal); });
}
