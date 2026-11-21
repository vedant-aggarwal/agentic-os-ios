import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { live, resetSession, type KaiAction } from './live';

// Kai's chat lives here, outside any screen, so it survives tab switches and the hold-to-talk button
// can start a conversation from anywhere.

export type KaiMessage = { id: string; role: 'user' | 'kai'; text: string; tools: string[]; voice?: boolean; error?: string; done?: boolean };
export type Attachment = { kind: 'direction' | 'reel' | 'channel'; id: string; label: string };
export type KaiContext = { screen?: string; channelId?: string; reelId?: string; directionId?: string };

type State = { messages: KaiMessage[]; busy: boolean; attachments: Attachment[]; draft: string };
let state: State = { messages: [], busy: false, attachments: [], draft: '' };
let sessionId = newSession();
const listeners = new Set<(s: State) => void>();

function newSession() {
  return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l(state));
}
function patchMsg(id: string, f: (m: KaiMessage) => KaiMessage) {
  set({ messages: state.messages.map((m) => (m.id === id ? f(m) : m)) });
}

function runAction(a: KaiAction) {
  const params = Object.fromEntries(Object.entries(a.params || {}).filter(([, v]) => v)) as Record<string, string>;
  router.push(Object.keys(params).length ? { pathname: a.open as never, params } : (a.open as never));
}

/** Say something to Kai. `voice` marks a transcript so Kai reads it loosely. */
export function sendToKai(text: string, opts: { voice?: boolean; context?: KaiContext } = {}) {
  const message = text.trim();
  if (!message || state.busy) return;
  const attachments = state.attachments;
  const u: KaiMessage = { id: 'u' + Date.now(), role: 'user', text: message, tools: [], voice: opts.voice };
  const k: KaiMessage = { id: 'k' + Date.now(), role: 'kai', text: '', tools: [] };
  set({ messages: [...state.messages, u, k], busy: true, attachments: [], draft: '' });
  live('kai', {
    sessionId,
    message,
    voice: !!opts.voice,
    context: { ...(opts.context || {}), attachments: attachments.map((a) => ({ kind: a.kind, id: a.id, note: a.label })) },
  }, {
    onText: (t) => patchMsg(k.id, (m) => ({ ...m, text: m.text + t })),
    onTool: (label) => patchMsg(k.id, (m) => ({ ...m, tools: [...m.tools, label] })),
    onAction: runAction,
    onDone: () => { patchMsg(k.id, (m) => ({ ...m, text: m.text.trim(), done: true })); set({ busy: false }); },
    onError: (e) => { patchMsg(k.id, (m) => ({ ...m, error: e, done: true })); set({ busy: false }); },
  });
}

export function newKaiChat() {
  resetSession('kai:' + sessionId);
  sessionId = newSession();
  set({ messages: [], busy: false });
}

export function attachToKai(a: Attachment) {
  if (state.attachments.some((x) => x.kind === a.kind && x.id === a.id)) return;
  set({ attachments: [...state.attachments, a] });
}
export function detachFromKai(a: Attachment) {
  set({ attachments: state.attachments.filter((x) => !(x.kind === a.kind && x.id === a.id)) });
}
export function setKaiDraft(draft: string) {
  set({ draft });
}

export function useKai() {
  const [s, setS] = useState(state);
  useEffect(() => {
    listeners.add(setS);
    setS(state);
    return () => {
      listeners.delete(setS);
    };
  }, []);
  return s;
}
