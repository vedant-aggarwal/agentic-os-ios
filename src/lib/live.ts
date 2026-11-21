import { socketUrl, type Concept } from './api';

// One WebSocket to the PC (/api/live) shared by the whole app. AI work streams back over it:
// concepts one by one, Kai's words as he writes them, the tools he is using and screens he opens.

export type KaiAction = { open: string; params?: Record<string, string | undefined> };
export type LiveHandlers = {
  onConcept?: (c: Concept) => void;
  onText?: (t: string) => void;
  onTool?: (label: string, name: string) => void;
  onAction?: (a: KaiAction) => void;
  onDone?: () => void;
  onError?: (message: string) => void;
};

let ws: WebSocket | null = null;
let outbox: string[] = [];
const pending = new Map<string, LiveHandlers>();
let seq = 0;

function connect() {
  if (ws && (ws.readyState === 0 || ws.readyState === 1)) return ws;
  const sock = new WebSocket(socketUrl('/api/live'));
  ws = sock;
  sock.onopen = () => {
    outbox.splice(0).forEach((m) => sock.send(m));
  };
  sock.onmessage = (ev) => {
    let m: { id: string; type: string; concept?: Concept; text?: string; label?: string; name?: string; action?: KaiAction; message?: string };
    try { m = JSON.parse(String(ev.data)); } catch { return; }
    const h = pending.get(m.id);
    if (!h) return;
    if (m.type === 'concept' && m.concept) h.onConcept?.(m.concept);
    else if (m.type === 'text') h.onText?.(m.text || '');
    else if (m.type === 'tool') h.onTool?.(m.label || '', m.name || '');
    else if (m.type === 'action' && m.action) h.onAction?.(m.action);
    else if (m.type === 'done') { pending.delete(m.id); h.onDone?.(); }
    else if (m.type === 'error') { pending.delete(m.id); h.onError?.(m.message || 'Something went wrong'); }
  };
  const drop = () => {
    if (ws !== sock) return;
    ws = null;
    // Anything still running lost its connection: tell its owner so the UI never spins forever.
    pending.forEach((h) => h.onError?.('Lost the connection to the PC. Try again.'));
    pending.clear();
  };
  sock.onclose = drop;
  sock.onerror = drop;
  return sock;
}

/** Start one streamed job. Returns a cancel function. */
export function live(type: 'draft' | 'refine' | 'kai', payload: Record<string, unknown>, h: LiveHandlers) {
  const id = `${type}-${Date.now().toString(36)}-${++seq}`;
  pending.set(id, h);
  const msg = JSON.stringify({ id, type, ...payload });
  const sock = connect();
  if (sock.readyState === 1) sock.send(msg);
  else outbox.push(msg);
  return () => {
    pending.delete(id);
    if (ws?.readyState === 1) ws.send(JSON.stringify({ id, type: 'cancel' }));
  };
}

/** Forget a chat on the PC (Kai's "New chat", or leaving the Concept Generator). */
export function resetSession(sessionId: string) {
  const msg = JSON.stringify({ id: 'reset', type: 'reset', sessionId });
  const sock = connect();
  if (sock.readyState === 1) sock.send(msg);
  else outbox.push(msg);
}

/** Open the socket early (app start) so the first request doesn't wait for the handshake. */
export function warmLive() {
  connect();
}
