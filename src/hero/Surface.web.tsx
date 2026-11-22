import { createElement, type Ref, useEffect, useImperativeHandle, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { SCENE_HTML } from './sceneHtml';
import type { SceneMsg, SurfaceHandle } from './types';

export const SURFACE_OK = true;

// A page opened straight onto an aspect on a stage server (`?stage=8203&aspect=soul`) is a builder's preview or a
// screenshot. The scene would only sit hidden behind the page, and in a headless browser its WebGL runs in software
// and stalls the page for seconds at a time. Without `aspect=` the scene loads as usual.
const NO_SCENE = typeof location !== 'undefined' && /[?&]stage=\d/.test(location.search) && /[?&]aspect=\w/.test(location.search);

/** Web build: the same page in an iframe, talking over postMessage. */
export function Surface({ ref, onMessage }: { ref: Ref<SurfaceHandle>; onMessage: (m: SceneMsg) => void }) {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const handler = useRef(onMessage);
  useEffect(() => { handler.current = onMessage; }, [onMessage]);
  useImperativeHandle(ref, () => ({ send: (m) => frame.current?.contentWindow?.postMessage(m, '*') }), []);
  useEffect(() => {
    const f = (e: MessageEvent) => {
      if (e.source === frame.current?.contentWindow && e.data?.hero) handler.current(e.data.hero as SceneMsg);
    };
    window.addEventListener('message', f);
    return () => window.removeEventListener('message', f);
  }, []);
  if (NO_SCENE) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {createElement('iframe', {
        ref: frame, srcDoc: SCENE_HTML, title: 'Today',
        style: { border: 0, width: '100%', height: '100%', display: 'block', background: 'transparent' },
      })}
    </View>
  );
}
