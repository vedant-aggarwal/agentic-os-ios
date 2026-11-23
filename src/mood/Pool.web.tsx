import { createElement, type Ref, useEffect, useImperativeHandle, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { POOL_HTML } from './poolHtml';
import type { PoolHandle, PoolMsg } from './Pool';

export type { PoolHandle, PoolMsg } from './Pool';
export const POOL_OK = true;

/** Web build: the same page in an iframe, talking over postMessage. The iframe takes the pointer itself. */
export function PoolSurface({ ref, onMessage }: { ref: Ref<PoolHandle>; onMessage: (m: PoolMsg) => void }) {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const handler = useRef(onMessage);
  useEffect(() => { handler.current = onMessage; }, [onMessage]);
  useImperativeHandle(ref, () => ({ send: (m) => frame.current?.contentWindow?.postMessage(m, '*') }), []);
  useEffect(() => {
    const f = (e: MessageEvent) => {
      if (e.source === frame.current?.contentWindow && e.data?.pool) handler.current(e.data.pool as PoolMsg);
    };
    window.addEventListener('message', f);
    return () => window.removeEventListener('message', f);
  }, []);
  return (
    <View style={StyleSheet.absoluteFill}>
      {createElement('iframe', {
        ref: frame, srcDoc: POOL_HTML, title: 'Mood',
        style: { border: 0, width: '100%', height: '100%', display: 'block', background: 'transparent' },
      })}
    </View>
  );
}
