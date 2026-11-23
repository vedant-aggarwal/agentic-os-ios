import { requireOptionalNativeModule } from 'expo';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { ApiError } from '@/lib/api';
import { fileSource, upload } from '@/lib/mod';

// Pictures in Nora's chat. Each goes up to the PC as soon as it is picked (POST /jobs/attachments, raw bytes), so
// Send only names the ids; the PC puts their paths in the message, where Nora opens them and the app draws them back.

type Picker = typeof import('expo-image-picker');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const picker: Picker | null = Platform.OS === 'web' || requireOptionalNativeModule('ExponentImagePicker') ? require('expo-image-picker') : null;

export type Pic = { key: string; uri: string; id: string | null; error: string | null };
export const MAX_PICS = 10;

/** The attachment block the PC appends to a message (server/attachments.ts withAttachments). */
const BLOCK = /\n*Attached files \(saved on the PC; read them\):\n((?:- .*(?:\n|$))+)\s*$/;
const IMAGE = /\.(jpe?g|png|gif|webp)$/i;

/** A message's own words and the pictures named in its attachment block. */
export function splitAttached(text: string): { text: string; pics: { id: string; name: string }[] } {
  const m = text.match(BLOCK);
  if (!m) return { text, pics: [] };
  const pics = m[1].split('\n').flatMap((line) => {
    const name = line.match(/^- (.+?): /)?.[1] ?? '';
    const id = line.match(/[\\/]att[\\/](a_[a-f0-9]{16})[\\/]/)?.[1];
    return id && IMAGE.test(name) ? [{ id, name }] : [];
  });
  const words = text.slice(0, m.index).trim();
  return { text: words === 'See the attached files.' ? '' : words, pics };
}

/** Where an attached picture loads from, with the sign-in an image needs on the phone. */
export const picSource = (id: string) => fileSource(`/jobs/attachments/${id}`);

let seq = 0;
async function send(uri: string, type: string, name: string) {
  const r = await upload<{ attachment: { id: string } }>(`/jobs/attachments?name=${encodeURIComponent(name)}`, uri, type);
  return r.attachment.id;
}

/** The pictures waiting to go with the next message. `bind` wires paste and drop on web while the chat is open. */
export function useAttach(open: boolean) {
  const [pics, setPics] = useState<Pic[]>([]);
  const live = useRef(pics);
  useEffect(() => { live.current = pics; }, [pics]);

  const add = useCallback((files: { uri: string; type: string; name: string }[]) => {
    const room = MAX_PICS - live.current.length;
    for (const f of files.slice(0, Math.max(0, room))) {
      const key = `p${seq++}`;
      setPics((cur) => [...cur, { key, uri: f.uri, id: null, error: null }]);
      send(f.uri, f.type, f.name)
        .then((id) => setPics((cur) => cur.map((p) => (p.key === key ? { ...p, id } : p))))
        .catch((e) => setPics((cur) => cur.map((p) => (p.key === key ? { ...p, error: e instanceof ApiError ? e.message : "Couldn't send that picture." } : p))));
    }
  }, []);

  const pick = useCallback(async () => {
    if (!picker) return;
    const r = await picker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: MAX_PICS, quality: 0.85, exif: false });
    if (r.canceled) return;
    add(r.assets.map((a, i) => ({ uri: a.uri, type: a.mimeType ?? 'image/jpeg', name: a.fileName ?? `image-${i + 1}.jpg` })));
  }, [add]);

  const remove = useCallback((key: string) => setPics((cur) => cur.filter((p) => p.key !== key)), []);
  const clear = useCallback(() => setPics([]), []);

  // Web: paste a screenshot or drop image files anywhere while the chat is open.
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'web' || !open) return;
    const images = (list: FileList | null | undefined) => [...(list ?? [])].filter((f) => f.type.startsWith('image/'));
    const take = (files: File[]) => add(files.map((f) => ({ uri: URL.createObjectURL(f), type: f.type, name: f.name || 'pasted.png' })));
    const paste = (e: ClipboardEvent) => { const f = images(e.clipboardData?.files); if (f.length) { e.preventDefault(); take(f); } };
    const over = (e: DragEvent) => { if ([...(e.dataTransfer?.items ?? [])].some((i) => i.kind === 'file')) { e.preventDefault(); setDragging(true); } };
    const leave = (e: DragEvent) => { if (!e.relatedTarget) setDragging(false); };
    const drop = (e: DragEvent) => { const f = images(e.dataTransfer?.files); setDragging(false); if (f.length) { e.preventDefault(); take(f); } };
    window.addEventListener('paste', paste);
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('paste', paste);
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, [open, add]);

  const ready = pics.every((p) => p.id || p.error);
  const ids = pics.filter((p) => p.id).map((p) => p.id!);
  return { pics, pick: picker ? pick : null, remove, clear, ready, ids, dragging };
}
export type Attach = ReturnType<typeof useAttach>;
