import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  Block, Button, Empty, Failed, Field, Group, Metric, Metrics, Screen, Skeleton, haptic, t, tint, useAspect,
} from '@/aspects/kit';
import { call, invalidate, useGet } from '@/lib/mod';
import { C } from '@/theme';
import { Dictate } from './Dictate';
import { READ, when } from './Read';
import type { ReadView } from './types';
import { Sym } from './ui';

type Verdict = 'got' | 'partly' | 'missed';
type Result = { verdict: Verdict | null; note: string | null; expected: string; by: 'ai' | 'self' | null; error?: string | null };
const WORD: Record<Verdict, string> = { got: 'You had it', partly: 'Partly there', missed: 'Not this time' };
const NEXT: Record<Verdict, string> = { got: 'It comes back later, further apart each time.', partly: 'It comes back sooner.', missed: 'It comes back in two days.' };

/**
 * Recall: one card at a time, each a question made from a line he saved while reading. He answers typed or
 * spoken and the PC checks it, or he looks and marks it himself. A miss only brings the card back sooner.
 */
export function RecallScreen({ open, onClose }: { open: boolean; onClose: () => void }) {
  const a = useAspect();
  const g = useGet<ReadView>(open ? READ : null);
  // the cards due when the screen opened, so answering one doesn't reshuffle the deck under him
  const [queue, setQueue] = useState<ReadView['recall']['due'] | null>(null);
  const [i, setI] = useState(0);
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [tally, setTally] = useState({ got: 0, partly: 0, missed: 0 });
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (!open) { setQueue(null); setI(0); setAnswer(''); setResult(null); setTally({ got: 0, partly: 0, missed: 0 }); }
  }
  if (open && !queue && g.data) setQueue(g.data.recall.due);

  const q = queue?.[i] ?? null;
  const count = (v: Verdict) => {
    setTally((x) => ({ ...x, [v]: x[v] + 1 }));
    if (v === 'got') haptic.success(); else haptic.light();
    invalidate('/mod/mind/');
  };
  const check = async () => {
    if (!q || !answer.trim()) return;
    setBusy('check');
    try {
      const r = await call<{ checked: boolean; verdict?: Verdict; note?: string; expected: string; error?: string }>(`/mod/mind/recall/${q.id}/answer`, { answer: answer.trim() });
      if (r.checked && r.verdict) { setResult({ verdict: r.verdict, note: r.note ?? null, expected: r.expected, by: 'ai' }); count(r.verdict); }
      else setResult({ verdict: null, note: null, expected: r.expected, by: null, error: r.error ?? null });
    } catch (e) { a.notice((e as Error).message); } finally { setBusy(null); }
  };
  // no answer: turn the card over and let him mark it; "missed" only brings it back sooner
  const reveal = () => { if (q) { haptic.light(); setResult({ verdict: null, note: null, expected: q.expected ?? '', by: null }); } };
  const mark = async (v: Verdict) => {
    if (!q) return;
    setBusy(v);
    try {
      await call(`/mod/mind/recall/${q.id}/mark`, { verdict: v, answer: answer.trim() || null });
      setResult((r) => (r ? { ...r, verdict: v, by: 'self' } : r));
      count(v);
    } catch (e) { a.notice((e as Error).message); } finally { setBusy(null); }
  };
  const next = () => { setI((x) => x + 1); setAnswer(''); setResult(null); };

  let body;
  if (!queue) {
    body = g.error ? <Failed message={g.error} onRetry={g.refresh} />
      : <View style={s.gap16}><Skeleton height={12} width={160} /><Skeleton height={220} radius={28} /><Skeleton height={120} radius={22} /></View>;
  } else if (!queue.length) {
    const nextDay = g.data?.recall.next;
    body = (
      <Empty title="Nothing to bring back today" icon={<Sym name="bulb" size={28} color={C.muted} />}
        body={nextDay ? `The next card is due ${when(nextDay)}.` : 'Cards are made from the lines you save while reading.'} />
    );
  } else if (!q) {
    const done = tally.got + tally.partly + tally.missed;
    body = (
      <>
        <Group pad>
          <Text style={t.title3}>{done === 1 ? 'One card done' : `${done} cards done`}</Text>
          <Metrics>
            <Metric size="s" label="Had it" value={String(tally.got)} color={tally.got ? a.color : undefined} />
            <Metric size="s" label="Partly" value={String(tally.partly)} />
            <Metric size="s" label="Coming back" value={String(tally.missed)} />
          </Metrics>
          <Text style={t.footnote}>The ones you had come back further apart. The rest come back sooner, so they stick.</Text>
        </Group>
        <Button label="Done" kind="accent" onPress={onClose} />
      </>
    );
  } else {
    body = (
      <>
        <View style={s.gap8}>
          <Text style={[t.footnote, t.num]}>{`Card ${i + 1} of ${queue.length}`}</Text>
          <View style={s.pips} accessibilityElementsHidden>
            {queue.map((x, n) => (
              <View key={x.id} style={[s.pip, { backgroundColor: n < i ? a.color : n === i ? tint(a.color, 0.55) : 'rgba(255,255,255,0.12)' }]} />
            ))}
          </View>
        </View>

        <View style={[s.card, { backgroundColor: tint(a.color, 0.1), borderColor: tint(a.color, 0.24) }]}>
          <Text style={[t.footnote, { color: a.color }]} numberOfLines={1}>{q.title ? `From ${q.title}` : 'From your reading'}</Text>
          <Text style={t.title3}>{q.q}</Text>
        </View>

        {!result ? (
          <>
            <View style={s.answerRow}>
              <View style={s.flex}>
                <Field label="Your answer" value={answer} onChangeText={setAnswer} placeholder="In your own words" multiline maxLength={1000} />
              </View>
              <View style={s.dictate}><Dictate what="your answer" onText={(x) => setAnswer((cur) => (cur ? `${cur} ${x}` : x))} /></View>
            </View>
            <View style={s.gap8}>
              <Button label="Check" kind="accent" onPress={check} busy={busy === 'check'} disabled={!answer.trim()} />
              <Button label="Show the answer" kind="quiet" onPress={reveal} />
            </View>
          </>
        ) : (
          <>
            {result.verdict ? (
              <Group pad tone={result.verdict === 'got' ? a.color : undefined}>
                <Text style={[t.headline, result.verdict === 'got' && { color: a.color }]}>{WORD[result.verdict]}</Text>
                {result.note ? <Text style={t.subhead}>{result.note}</Text> : null}
                <Text style={t.footnote}>{NEXT[result.verdict]}</Text>
              </Group>
            ) : (
              <Text style={t.subhead}>{result.error ? "The check couldn't run on the PC. Compare it yourself and mark it." : 'Here is what it was. Mark how close you were.'}</Text>
            )}
            {result.expected ? (
              <Block title="The answer">
                <Group pad><Text style={t.callout} selectable>{result.expected}</Text></Group>
              </Block>
            ) : null}
            {answer.trim() ? (
              <Block title="You said">
                <Group pad><Text style={[t.callout, s.soft]} selectable>{answer.trim()}</Text></Group>
              </Block>
            ) : null}
            {result.verdict ? (
              <Button label={i + 1 < queue.length ? 'Next card' : 'Finish'} kind="accent" onPress={next} />
            ) : (
              <View style={s.marks}>
                <Button label="Had it" kind="soft" onPress={() => mark('got')} busy={busy === 'got'} wrap={s.flex} />
                <Button label="Partly" kind="soft" onPress={() => mark('partly')} busy={busy === 'partly'} wrap={s.flex} />
                <Button label="Missed" kind="soft" onPress={() => mark('missed')} busy={busy === 'missed'} wrap={s.flex} />
              </View>
            )}
          </>
        )}
      </>
    );
  }
  return <Screen open={open} onClose={onClose} title="Recall" immersive>{body}</Screen>;
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  gap8: { gap: 8 },
  gap16: { gap: 16 },
  pips: { flexDirection: 'row', gap: 4 },
  pip: { flex: 1, height: 4, borderRadius: 2 },
  card: { borderRadius: 28, borderWidth: 1, padding: 24, gap: 12, minHeight: 180, justifyContent: 'center' },
  answerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  dictate: { paddingBottom: 6 },
  marks: { flexDirection: 'row', gap: 8 },
  soft: { color: C.textSoft },
});
