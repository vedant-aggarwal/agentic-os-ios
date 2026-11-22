import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Card, Empty, Failed, Row, Screen, Section, Skeleton, SP, shortDay, t, today } from '@/aspects/kit';
import { useCollection } from '@/lib/mod';
import { C } from '@/theme';
import type { ReviewDoc } from './types';
import { NAME, range } from './ui';

// Every week he closed, newest first, and what it held. Drafts the first app wrote but never closed sit apart.

const VERDICT_WORD = { done: 'Done', partly: 'Partly', missed: 'Not done' } as const;
const MOVE_WORD: Record<string, string> = { offered: 'Waiting in Mission', accepted: 'Taken on', declined: 'Let go' };

export function ReviewsScreen({ open, onClose }: { open: boolean; onClose: () => void }) {
  const reviews = useCollection<ReviewDoc>('growth', 'reviews');
  const [focus, setFocus] = useState<string | null>(null);
  const all = (reviews.items ?? []).filter((r) => !r.deleted_at).sort((a, b) => b.week.localeCompare(a.week));
  const sealed = all.filter((r) => r.status === 'sealed');
  const drafts = all.filter((r) => r.status !== 'sealed' && !!r.to && r.to < today()); // the open week's draft is not past
  const doc = focus ? all.find((r) => r.id === focus) ?? null : null;

  return (
    <Screen open={open} onClose={doc ? () => setFocus(null) : onClose} title={doc ? range(doc.label ?? doc.week) : 'Past reviews'}>
      {!reviews.items ? (
        reviews.error ? <Failed message={reviews.error} onRetry={reviews.refresh} /> : (
          <View style={s.list}>{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} height={64} radius={16} />)}</View>
        )
      ) : doc ? (
        <Detail r={doc} />
      ) : (
        <View style={s.list}>
          {sealed.length ? (
            <Section title="Closed weeks">
              {sealed.map((r) => (
                <Row key={r.id} title={range(r.label ?? r.week)} sub={r.headline ?? null} onPress={() => setFocus(r.id)} chevron
                  label={`${range(r.label ?? r.week)}. ${r.headline ?? ''}`} />
              ))}
            </Section>
          ) : (
            <Card>
              <Empty title="No closed weeks yet" body="Each Sunday review you finish lands here: what moved, what missed and why, and the moves you picked." />
            </Card>
          )}
          {drafts.length ? (
            <Section title="Drafted, never closed">
              {drafts.map((r) => (
                <Row key={r.id} title={range(r.label ?? r.week)} sub={r.headline ?? null} onPress={() => setFocus(r.id)} chevron
                  label={`${range(r.label ?? r.week)}, a draft. ${r.headline ?? ''}`} />
              ))}
            </Section>
          ) : null}
        </View>
      )}
    </Screen>
  );
}

function Lines({ title, items }: { title: string; items: { text: string; sub?: string | null }[] }) {
  if (!items.length) return null;
  return (
    <Section title={title} gap={8}>
      {items.map((x, i) => (
        <View key={`${i}:${x.text}`} style={s.line}>
          <View style={s.bar} />
          <View style={s.flex}>
            <Text style={t.body}>{x.text}</Text>
            {x.sub ? <Text style={t.caption}>{x.sub}</Text> : null}
          </View>
        </View>
      ))}
    </Section>
  );
}

function Detail({ r }: { r: ReviewDoc }) {
  const moved = r.moved ?? r.wins ?? [];
  const sealed = r.status === 'sealed';
  return (
    <View style={s.list}>
      <View style={s.head}>
        {r.headline ? <Text style={t.lead}>{r.headline}</Text> : null}
        {r.feel?.line ? <Text style={t.body}>{r.feel.line}</Text> : null}
        <Text style={t.caption}>{sealed ? (r.sealed_at ? `Closed ${shortDay(r.sealed_at.slice(0, 10))}` : 'Closed') : 'A draft that was never closed'}</Text>
      </View>
      <Lines title="The week you set" items={(r.closed ?? []).map((c) => ({ text: c.text, sub: `${VERDICT_WORD[c.verdict]}${c.carry ? ', carried on' : ''}` }))} />
      <Lines title="What moved" items={moved.map((m) => ({ text: m.text, sub: m.aspect ? NAME[m.aspect] : null }))} />
      <Lines title="What missed" items={(r.misses ?? []).map((m) => ({ text: m.text, sub: [m.why, m.why2].filter(Boolean).join(', ') || null }))} />
      <Lines title="Rules" items={[
        ...(r.checks ?? []).map((c) => ({ text: c.text, sub: c.held ? 'Held' : 'Broke it' })),
        ...(r.ruleText ? [{ text: r.ruleText, sub: 'New this week' }] : []),
      ]} />
      <Lines title={sealed ? 'Moves for the next week' : 'Moves it suggested'} items={(r.moves ?? []).filter((m) => sealed || m.on !== false).map((m) => ({
        text: m.text, sub: sealed ? MOVE_WORD[m.state ?? ''] ?? null : null,
      }))} />
      {!sealed ? <Text style={[t.caption, { color: C.faint }]}>Kept as it was drafted. Nothing in it was confirmed.</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  list: { gap: SP[24] },
  head: { gap: SP[8] },
  line: { flexDirection: 'row', gap: SP[12] },
  bar: { width: 2, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.16)' },
});
