import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition, ReduceMotion, ZoomIn } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import {
  Button, Card, Chip, Glyph, haptic, Icon, Press, Screen, Section, Skeleton, SURF, t, timer, tint, today, useAspect,
} from '@/aspects/kit';
import { newId } from '@/lib/mod';
import { C } from '@/theme';
import { DEPTH, DEPTHS, EXPECT, PLACE, PLACES, RESPECT_FALLBACK } from './copy';
import { usePrimer } from './data';
import { flush, queuePut, setLive, useLocal } from './local';
import { placeName, useNow } from './parts';
import type { Depth, Expect, Outing, Place, Primer } from './types';

// ── Before you go: thirty seconds ────────────────────────────────────────────────────────────────────────────────
export function PrimerScreen({ open, onClose, onStart }: { open: boolean; onClose: () => void; onStart: () => void }) {
  const a = useAspect();
  const p = usePrimer();
  const [place, setPlace] = useState<Place | null>(null);
  const [turn, setTurn] = useState(0);
  const [expect, setExpect] = useState<Expect | null>(null);
  const where: Place = place ?? p.data?.last_place ?? 'cowork';
  const openers = p.data?.openers?.[where] ?? [];
  const opener = openers.length ? openers[turn % openers.length] : null;

  const start = () => {
    const o: Outing = {
      id: newId('out'), day: today(), start: new Date().toISOString(), end: null, place: where,
      primer: { try: p.data?.try.text ?? null, opener: opener?.id ?? null, expect }, reps: [],
    };
    setLive(o, null);
    queuePut('sessions', o as unknown as { id: string } & Record<string, unknown>);
    haptic.medium();
    setTurn(0); setExpect(null); setPlace(null);
    onStart();
  };

  return (
    <Screen open={open} onClose={onClose} title="Before you go">
      <Section title="Where are you?">
        <View style={s.chips}>
          {PLACES.map((k) => <Chip key={k} label={PLACE[k]} selected={where === k} onPress={() => { setPlace(k); setTurn(0); }} />)}
        </View>
      </Section>

      {!p.data && p.busy ? (
        <View style={s.gap12}><Skeleton height={112} radius={24} /><Skeleton height={136} radius={24} /></View>
      ) : (
        <>
          <Card style={s.gap8}>
            <Text style={t.label}>One thing to try</Text>
            <Text style={t.lead}>{p.data?.try.text ?? 'Say hello to one person. That is the whole step.'}</Text>
            <Text style={t.caption}>{tryFrom(p.data)}</Text>
          </Card>
          <Card style={s.gap8}>
            <View style={s.between}>
              <Text style={t.label}>A way in</Text>
              {openers.length > 1 ? (
                <Press label="Another opener" onPress={() => setTurn((n) => n + 1)} feel="tick" hitSlop={12} style={s.another}>
                  <Text style={[t.label, { color: a.color }]}>Another</Text>
                </Press>
              ) : null}
            </View>
            {opener ? (
              <Animated.View key={opener.id} entering={FadeIn.duration(160).reduceMotion(ReduceMotion.System)} style={s.gap8}>
                <Text style={t.lead}>{opener.line}</Text>
                <Text style={t.small}>{opener.when}</Text>
              </Animated.View>
            ) : (
              <Text style={t.body}>Ask one honest question about the place you are both in.</Text>
            )}
            <Text style={t.caption}>A question about the place, said once. Not a line to recite.</Text>
          </Card>
        </>
      )}

      <Section title="How many will be friendly, do you think?">
        <View style={s.chips}>
          {(Object.keys(EXPECT) as Expect[]).map((k) => (
            <Chip key={k} label={EXPECT[k]} selected={expect === k} onPress={() => setExpect(expect === k ? null : k)} />
          ))}
        </View>
        <Text style={t.caption}>Optional. Your debrief compares it with what happened.</Text>
      </Section>

      <View style={s.gap8}>
        {(p.data?.respect ?? RESPECT_FALLBACK).map((line) => (
          <View key={line} style={s.respect}>
            <View style={[s.bullet, { backgroundColor: tint(a.color, 0.6) }]} />
            <Text style={[t.small, s.flex]}>{line}</Text>
          </View>
        ))}
      </View>

      {p.stale ? <Text style={t.caption}>Your PC isn&apos;t answering, so this is the last primer it sent. The outing still counts.</Text> : null}
      <Button label="I'm out" kind="accent" onPress={start} />
    </Screen>
  );
}

function tryFrom(p: Primer | null) {
  if (!p) return 'A first step';
  if (p.try.from === 'ladder') return 'A first step. Your debriefs take over from here.';
  return p.try.by === 'ai' ? 'From your last debrief, read by AI' : 'From your last debrief';
}

// ── Out: the counter ─────────────────────────────────────────────────────────────────────────────────────────────
export function OutScreen({ open, onClose, onEnded }: { open: boolean; onClose: () => void; onEnded: (o: Outing) => void }) {
  const a = useAspect();
  const { live, outbox } = useLocal();
  const now = useNow(1000, open && !!live);
  const [ask, setAsk] = useState(false); // the "how far did it go" row after a tap
  const n = live?.reps.length ?? 0;

  // the row fades if he doesn't answer: it's optional
  useEffect(() => {
    if (!ask) return;
    const id = setTimeout(() => setAsk(false), 12_000);
    return () => clearTimeout(id);
  }, [ask, n]);

  if (!live) return <Screen open={open} onClose={onClose} title="Out" immersive><View /></Screen>;

  const write = (o: Outing) => { setLive(o); queuePut('sessions', o as unknown as { id: string } & Record<string, unknown>); };
  const count = () => { haptic.medium(); write({ ...live, reps: [...live.reps, { at: new Date().toISOString(), depth: null }] }); setAsk(true); };
  const mark = (d: Depth) => {
    const reps = [...live.reps];
    const last = reps.at(-1);
    if (!last) return;
    reps[reps.length - 1] = { ...last, depth: last.depth === d ? null : d };
    write({ ...live, reps });
    setAsk(false);
  };
  const undo = () => { write({ ...live, reps: live.reps.slice(0, -1) }); setAsk(false); };
  const end = () => {
    const done = { ...live, end: new Date().toISOString() };
    queuePut('sessions', done as unknown as { id: string } & Record<string, unknown>);
    setLive(null, done.id);
    void flush();
    onEnded(done);
  };
  const waiting = outbox.some((p) => p.coll === 'sessions' && p.id === live.id);
  const mins = Math.max(0, Math.floor((now - Date.parse(live.start ?? new Date().toISOString())) / 1000));
  const lastDepth = live.reps.at(-1)?.depth ?? null;

  return (
    <Screen open={open} onClose={onClose} title={placeName(live.place)} immersive scroll={false}
      right={<Text style={[t.label, t.num, s.elapsed]} accessibilityLabel={`Out for ${timer(mins)}`}>{timer(mins)}</Text>}>
      <View style={s.out}>
        {live.primer?.try ? (
          <View style={[s.tryLine, { backgroundColor: tint(a.color, 0.08) }]}>
            <Glyph sf="scope" d="M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18zM12 8a4 4 0 1 0 0 8a4 4 0 0 0 0-8zM12 11.5v1" size={16} color={a.color} />
            <Text style={[t.small, s.flex, { color: C.textSoft }]} numberOfLines={3}>{live.primer.try}</Text>
          </View>
        ) : <View />}

        <View style={s.centre}>
          <Counter n={n} size={Math.min(a.width - 80, 288)} onPress={count} color={a.color} />
          <View style={s.askSlot}>
            {ask && n > 0 ? (
              <Animated.View entering={FadeIn.duration(160).reduceMotion(ReduceMotion.System)} exiting={FadeOut.duration(160).reduceMotion(ReduceMotion.System)} style={s.ask}>
                <Text style={[t.small, s.centreText]}>How far did it go? Optional.</Text>
                <View style={[s.chips, s.centreRow]}>
                  {DEPTHS.map((d) => <Chip key={d} label={DEPTH[d]} selected={lastDepth === d} onPress={() => mark(d)} />)}
                </View>
              </Animated.View>
            ) : (
              <Text style={[t.small, s.centreText]}>
                {n === 0 ? 'Tap the circle each time you start a conversation. Every one counts, however it goes.' : lastDepth ? `Last one: ${DEPTH[lastDepth].toLowerCase()}.` : 'Every one counts, however it goes.'}
              </Text>
            )}
          </View>
        </View>

        <View style={s.gap8}>
          {waiting ? <Text style={[t.caption, s.centreText]}>Kept on this phone. It reaches your PC when it answers.</Text> : null}
          <View style={s.row}>
            <Button label="Undo" kind="quiet" onPress={undo} disabled={n === 0} wrap={s.flex} />
            <Button label="End outing" kind="primary" onPress={end} wrap={s.flex} />
          </View>
        </View>
      </View>
    </Screen>
  );
}

/** The counter: a ring that is the button. Each conversation adds one dot on the ring; the count sits in the middle. */
function Counter({ n, size, onPress, color }: { n: number; size: number; onPress: () => void; color: string }) {
  const stroke = 2, r = (size - 24) / 2, mid = size / 2;
  const slots = Math.max(12, n);
  const shown = Math.min(n, 48);
  return (
    <Press label="Count a conversation" onPress={onPress} feel="none" scale={0.97} state={{ busy: false }}
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={[StyleSheet.absoluteFill, { borderRadius: size / 2, backgroundColor: n ? tint(color, 0.06) : SURF.row }]} />
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={mid} cy={mid} r={r} stroke={n ? tint(color, 0.35) : SURF.line} strokeWidth={stroke} fill="none" />
      </Svg>
      {Array.from({ length: shown }, (_, i) => {
        const ang = (-90 + (i * 360) / Math.min(slots, 48)) * (Math.PI / 180);
        return (
          <Animated.View key={i} entering={ZoomIn.springify().damping(18).reduceMotion(ReduceMotion.System)} layout={LinearTransition.springify().damping(20).reduceMotion(ReduceMotion.System)}
            style={[s.ringDot, { backgroundColor: color, left: mid + r * Math.cos(ang) - 6, top: mid + r * Math.sin(ang) - 6 }]} />
        );
      })}
      <Text style={[t.display, t.num, { color: n ? color : C.text }]} accessibilityLabel={`${n} started`}>{n}</Text>
      <Text style={t.label}>{n === 1 ? 'conversation started' : 'conversations started'}</Text>
      {n === 0 ? <View style={s.plus}><Icon name="plus" size={20} color={C.muted} /></View> : null}
    </Press>
  );
}

// ── the outing just ended ────────────────────────────────────────────────────────────────────────────────────────
export function EndedScreen({ outing, onClose, onDebrief, onAdd }: { outing: Outing | null; onClose: () => void; onDebrief: () => void; onAdd: () => void }) {
  const a = useAspect();
  const n = outing?.reps.length ?? 0;
  const friendly = outing?.reps.filter((r) => r.depth === 'talked' || r.depth === 'contact').length ?? 0;
  const marked = outing?.reps.filter((r) => r.depth).length ?? 0;
  const guess = outing?.primer?.expect ?? null;
  return (
    <Screen open={!!outing} onClose={onClose} title="Outing done" immersive>
      <View style={s.endTop}>
        <Text style={[t.display, t.num, { color: n ? a.color : C.text }]}>{n}</Text>
        <Text style={t.lead}>{n === 0 ? 'Going out counts too.' : n === 1 ? 'conversation started. It counts.' : 'conversations started. Every one counts.'}</Text>
        {guess && marked ? (
          <Text style={[t.small, s.centreText]}>
            You guessed {EXPECT[guess].toLowerCase()} would be friendly. {marked === n ? `Of ${n}` : `Of the ${marked} you marked`}, {friendly} went past a hello.
          </Text>
        ) : null}
      </View>
      <View style={s.gap12}>
        <Button label="Debrief now" kind="accent" onPress={onDebrief} icon={<Icon name="mic" size={18} color="#14161C" />} />
        <Button label="Add someone to Talking to" kind="soft" onPress={onAdd} />
        <Button label="Later" kind="quiet" onPress={onClose} />
      </View>
      <Text style={[t.caption, s.centreText]}>Talking it through while it&apos;s fresh takes a minute.</Text>
    </Screen>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  gap8: { gap: 8 },
  gap12: { gap: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  another: { minHeight: 24, justifyContent: 'center' },
  respect: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  bullet: { width: 6, height: 6, borderRadius: 3, marginTop: 7 },
  elapsed: { width: 56, textAlign: 'right' },
  out: { flex: 1, justifyContent: 'space-between', gap: 16 },
  tryLine: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', padding: 12, borderRadius: 16, borderCurve: 'continuous' },
  centre: { alignItems: 'center', gap: 16 },
  askSlot: { minHeight: 96, alignSelf: 'stretch', justifyContent: 'flex-start' },
  ask: { gap: 12 },
  centreText: { textAlign: 'center' },
  centreRow: { justifyContent: 'center' },
  row: { flexDirection: 'row', gap: 12 },
  ringDot: { position: 'absolute', width: 12, height: 12, borderRadius: 6 },
  plus: { position: 'absolute', bottom: 40 },
  endTop: { alignItems: 'center', gap: 8, paddingVertical: 24 },
});
