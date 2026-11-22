import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Bar, Button, Card, Empty, Failed, Field, Screen, Skeleton, dayLabel, haptic, t, useAspect } from '@/aspects/kit';
import { call, invalidate, useGet } from '@/lib/mod';
import { C } from '@/theme';
import { Dictate } from './Dictate';
import { READ } from './Read';
import type { ReadView } from './types';
import { Sym } from './ui';

type Verdict = 'got' | 'partly' | 'missed';
type Result = { verdict: Verdict | null; note: string | null; expected: string; by: 'ai' | 'self' | null; error?: string | null };
const WORD: Record<Verdict, string> = { got: 'You had it', partly: 'Partly there', missed: 'Not this time' };
const NEXT: Record<Verdict, string> = { got: 'It comes back later, further apart each time.', partly: 'It comes back sooner.', missed: 'It comes back in two days.' };

/**
 * One recall question at a time, made from his own takeaways. He answers typed or spoken; the PC checks it, or
 * he marks it himself when the check can't run. A miss only brings the question back sooner.
 */
export function RecallScreen({ open, onClose }: { open: boolean; onClose: () => void }) {
  const a = useAspect();
  const g = useGet<ReadView>(open ? READ : null);
  // the questions due when the screen opened, so answering one doesn't reshuffle the list under him
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
  const check = async () => {
    if (!q || !answer.trim()) return;
    setBusy('check');
    try {
      const r = await call<{ checked: boolean; verdict?: Verdict; note?: string; expected: string; error?: string }>(`/mod/mind/recall/${q.id}/answer`, { answer: answer.trim() });
      if (r.checked && r.verdict) { setResult({ verdict: r.verdict, note: r.note ?? null, expected: r.expected, by: 'ai' }); count(r.verdict); }
      else setResult({ verdict: null, note: null, expected: r.expected, by: null, error: r.error ?? null });
    } catch (e) { a.notice((e as Error).message); } finally { setBusy(null); }
  };
  // no answer: show what it was and let him mark it; "missed" only brings it back sooner
  const reveal = () => { if (q) setResult({ verdict: null, note: null, expected: q.expected ?? '', by: null }); };
  const mark = async (v: Verdict) => {
    if (!q) return;
    setBusy(v);
    try {
      await call(`/mod/mind/recall/${q.id}/mark`, { verdict: v, answer: answer.trim() || null });
      setResult((r) => (r ? { ...r, verdict: v, by: 'self' } : r));
      count(v);
    } catch (e) { a.notice((e as Error).message); } finally { setBusy(null); }
  };
  const count = (v: Verdict) => { setTally((x) => ({ ...x, [v]: x[v] + 1 })); if (v === 'got') haptic.success(); else haptic.light(); invalidate('/mod/mind/'); };
  const next = () => { setI((x) => x + 1); setAnswer(''); setResult(null); };

  let body;
  if (!queue) body = g.error ? <Failed message={g.error} onRetry={g.refresh} /> : <View style={s.gap16}><Skeleton height={20} width={140} /><Skeleton height={96} /><Skeleton height={120} /></View>;
  else if (!queue.length) {
    const nextDay = g.data?.recall.next;
    body = <Empty title="Nothing to bring back today" body={nextDay ? `The next question is due ${dayLabel(nextDay).toLowerCase()}.` : 'Questions are made from the lines you save after a sitting.'} icon={<Sym name="bulb" size={28} color={C.muted} />} />;
  } else if (!q) {
    const done = tally.got + tally.partly + tally.missed;
    body = (
      <View style={s.gap16}>
        <Text style={t.title2}>{done === 1 ? 'One question done' : `${done} questions done`}</Text>
        <Text style={t.body}>{`You had ${tally.got}${tally.partly ? `, partly ${tally.partly}` : ''}${tally.missed ? `, and ${tally.missed} will come back in two days` : ''}.`}</Text>
        <Button label="Done" kind="primary" onPress={onClose} />
      </View>
    );
  } else {
    body = (
      <>
        <View style={s.gap8}>
          <Text style={[t.label, t.num]}>{`Question ${i + 1} of ${queue.length}`}</Text>
          <Bar progress={i / queue.length} height={4} />
        </View>
        <View style={s.gap8}>
          <Text style={t.small}>{q.title ? `From ${q.title}` : 'From your reading'}</Text>
          <Text style={t.title2}>{q.q}</Text>
        </View>
        {!result ? (
          <>
            <View style={s.lineRow}>
              <View style={s.flex}>
                <Field label="Your answer" value={answer} onChangeText={setAnswer} placeholder="In your own words" multiline maxLength={1000} />
              </View>
              <View style={s.dictate}><Dictate what="your answer" onText={(x) => setAnswer((cur) => (cur ? `${cur} ${x}` : x))} /></View>
            </View>
            <Button label="Check" kind="primary" onPress={check} busy={busy === 'check'} disabled={!answer.trim()} />
            <Button label="I can't remember" kind="quiet" small onPress={reveal} wrap={s.centre} />
          </>
        ) : (
          <>
            {result.verdict ? (
              <Card tone={result.verdict === 'got' ? a.color : undefined}>
                <View style={s.gap8}>
                  <Text style={[t.lead, result.verdict === 'got' && { color: a.color }]}>{WORD[result.verdict]}</Text>
                  {result.note ? <Text style={t.body}>{result.note}</Text> : null}
                  <Text style={t.caption}>{NEXT[result.verdict]}</Text>
                </View>
              </Card>
            ) : (
              <Text style={t.small}>{result.error ? "The check couldn't run on the PC. Compare it yourself and mark it." : 'Here is what it was. Mark how close you were.'}</Text>
            )}
            {result.expected ? (
              <View style={s.gap8}>
                <Text style={t.label}>The answer</Text>
                <Text style={t.body} selectable>{result.expected}</Text>
              </View>
            ) : null}
            {answer.trim() ? (
              <View style={s.gap8}>
                <Text style={t.label}>You said</Text>
                <Text style={t.body} selectable>{answer.trim()}</Text>
              </View>
            ) : null}
            {result.verdict ? (
              <Button label={i + 1 < queue.length ? 'Next question' : 'Finish'} kind="primary" onPress={next} />
            ) : (
              <View style={s.marks}>
                <Button label="Had it" kind="soft" onPress={() => mark('got')} busy={busy === 'got'} wrap={s.flex} />
                <Button label="Partly" kind="quiet" onPress={() => mark('partly')} busy={busy === 'partly'} wrap={s.flex} />
                <Button label="Missed" kind="quiet" onPress={() => mark('missed')} busy={busy === 'missed'} wrap={s.flex} />
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
  centre: { alignSelf: 'center' },
  gap8: { gap: 8 },
  gap16: { gap: 16 },
  lineRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  dictate: { paddingBottom: 6 },
  marks: { flexDirection: 'row', gap: 8 },
});
