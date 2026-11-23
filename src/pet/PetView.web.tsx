import { createElement, type Ref, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { PET_HTML } from './sceneHtml';
import type { PetCfg, PetHandle, PetMsg } from './types';

export const PET_OK = true;

/** Web build: the same page in an iframe, talking over postMessage. */
export function PetView({ ref, cfg, onMessage }: { ref: Ref<PetHandle>; cfg: PetCfg; onMessage: (m: PetMsg) => void }) {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const handler = useRef(onMessage);
  useEffect(() => { handler.current = onMessage; }, [onMessage]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const html = useMemo(() => PET_HTML.replace('/*CFG*/null', () => JSON.stringify(cfg)), []);
  useImperativeHandle(ref, () => ({ send: (m) => frame.current?.contentWindow?.postMessage(m, '*') }), []);
  useEffect(() => {
    const f = (e: MessageEvent) => {
      if (e.source === frame.current?.contentWindow && e.data?.pet) handler.current(e.data.pet as PetMsg);
    };
    window.addEventListener('message', f);
    return () => window.removeEventListener('message', f);
  }, []);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {createElement('iframe', {
        ref: frame, srcDoc: html, title: 'Mood pet', tabIndex: -1, 'aria-hidden': true,
        // the app's page is color-scheme dark and the scene's is light; an iframe whose scheme differs from its page's
        // gets an opaque backdrop, so it is told it's light too, and stays see-through
        style: { border: 0, width: '100%', height: '100%', display: 'block', background: 'transparent', pointerEvents: 'none', colorScheme: 'light' },
      })}
    </View>
  );
}
