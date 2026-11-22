import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { Button, Card, haptic, Ring, t, timer, useAspect } from '@/aspects/kit';
import type { Step } from './api';
import { s as u, useNow } from './ui';

/**
 * One guided card: a step at a time, each with its timer. When a step's time runs out the next one starts its
 * text (the timer waits for a tap); after the last step `onFinish` runs. Used by the face routine and voice drills.
 */
export function Guide({ title, steps, onFinish, finish = 'Done', children }: {
  title: string; steps: Step[]; onFinish: () => void; finish?: string; children?: ReactNode;
}) {
  const a = useAspect();
  const [step, setStep] = useState(0);
  const [until, setUntil] = useState<number | null>(null);
  const [paused, setPaused] = useState<number | null>(null); // seconds left while paused
  const now = useNow(until ? 250 : 1000, until != null);
  const rang = useRef(false);

  const st = steps[step] ?? { text: title };
  const sec = st.sec ?? 0;
  const left = until ? Math.max(0, Math.ceil((until - now) / 1000)) : paused ?? sec;
  const lastStep = step >= steps.length - 1;

  const next = () => {
    setUntil(null); setPaused(null); rang.current = false;
    if (!lastStep) { setStep(step + 1); haptic.tick(); return; }
    onFinish();
  };
  // a running timer that reaches zero moves on by itself
  useEffect(() => {
    if (until && left <= 0 && !rang.current) { rang.current = true; haptic.success(); next(); }
  });

  const start = () => { setUntil(Date.now() + (paused ?? sec) * 1000); setPaused(null); haptic.light(); };
  const pause = () => { setPaused(left); setUntil(null); };

  return (
    <>
      <Card style={[u.gap16, { alignItems: 'center' }]}>
        <Text style={[t.label, { color: a.color, alignSelf: 'stretch' }]}>{title}</Text>
        {sec ? (
          <Ring size={168} progress={1 - left / sec} stroke={10}>
            <Text style={[t.display, t.num]} accessibilityLiveRegion="polite">{timer(left)}</Text>
          </Ring>
        ) : null}
        <Text style={[t.heading, { textAlign: 'center' }]}>{st.text}</Text>
        {steps.length > 1 ? <Text style={[t.caption, t.num]}>{`Step ${step + 1} of ${steps.length}`}</Text> : null}
      </Card>
      {children}
      {sec ? (
        <View style={u.row}>
          {until ? <Button label="Pause" kind="soft" onPress={pause} wrap={u.flex} />
            : <Button label={paused != null ? 'Resume' : 'Start timer'} kind="accent" onPress={start} wrap={u.flex} />}
          <Button label={lastStep ? finish : 'Next step'} kind="quiet" onPress={next} />
        </View>
      ) : (
        <Button label={lastStep ? finish : 'Next step'} kind="accent" onPress={next} />
      )}
    </>
  );
}
