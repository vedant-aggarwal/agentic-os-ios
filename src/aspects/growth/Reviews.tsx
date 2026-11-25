import { StyleSheet, Text, View } from 'react-native';
import { Block, Failed, Group, Item, Screen, shortDay, Skeleton, t, today } from '@/aspects/kit';
import { useCollection } from '@/lib/mod';
import { useNav } from './nav';
import { ReviewLead } from './Now';
import type { Home, ReviewDoc } from './types';
import { NAME, range, weekWords } from './ui';

// The weekly review: this week's (due, part done or closed) at the top, then every week he closed, newest first,
// each opening to what it held. Drafts the first app wrote but never closed sit apart.

const VERDICT_WORD = { done: 'Done', partly: 'Partly', missed: 'Not done' } as const;
const MOVE_WORD: Record<string, string> = { offered: 'Waiting in Mission', accepted: 'In Mission’s week', declined: 'Let go' };

export const useReviews = () => useCollection<ReviewDoc>('growth', 'reviews');
/** "16 to 22 Nov", or "The week of 16 Nov" for an old review without a label. */
const weekTitle = (r: ReviewDoc) => (r.label ? range(r.label) : `The week of ${weekWords(r.week)}`);

export function ReviewTab({ home }: { home: Home }) {
  const nav = useNav();
  const reviews = useReviews();
  const all = (reviews.items ?? []).filter((r) => !r.deleted_at).sort((a, b) => b.week.localeCompare(a.week));
  const sealed = all.filter((r) => r.status === 'sealed');
  const drafts = all.filter((r) => r.status !== 'sealed' && !!r.to && r.to < today()); // the open week's draft is not past
  const kept = sealed.reduce((n, r) => n + (r.moves ?? []).filter((m) => m.on !== false).length, 0);
  return (
    <>
      <ReviewLead home={home} reviewOnly />
      <Block title="Closed weeks" sub={sealed.length ? `${sealed.length === 1 ? 'One week' : `${sealed.length} weeks`} closed, ${kept === 1 ? 'one move' : `${kept} moves`} picked along the way.` : null}>
        {!reviews.items ? (
          reviews.error ? <Failed message={reviews.error} onRetry={reviews.refresh} /> : <Skeleton height={216} radius={22} />
        ) : sealed.length ? (
          <Group>
            {sealed.map((r) => (
              <Item key={r.id} title={weekTitle(r)} sub={r.headline ?? null} onPress={() => nav.openFlow({ kind: 'past', id: r.id })} chevron
                label={`${weekTitle(r)}. ${r.headline ?? ''}`} />
            ))}
          </Group>
        ) : (
          <Group pad>
            <Text style={t.callout}>No closed weeks yet</Text>
            <Text style={t.footnote}>Each Sunday review you finish lands here: what moved, what missed and why, and the moves you picked.</Text>
          </Group>
        )}
      </Block>
      {drafts.length ? (
        <Block title="Drafted, never closed">
          <Group>
            {drafts.map((r) => (
              <Item key={r.id} title={weekTitle(r)} sub={r.headline ?? null} onPress={() => nav.openFlow({ kind: 'past', id: r.id })} chevron
                label={`${weekTitle(r)}, a draft. ${r.headline ?? ''}`} />
            ))}
          </Group>
        </Block>
      ) : null}
    </>
  );
}

/** One past week, full screen: what he set, what moved and missed, the rules, the moves. */
export function PastScreen({ open, id, onClose }: { open: boolean; id: string | null; onClose: () => void }) {
  const reviews = useReviews();
  const doc = id ? (reviews.items ?? []).find((r) => r.id === id) ?? null : null;
  return (
    <Screen open={open} onClose={onClose} title={doc ? weekTitle(doc) : 'Past review'}>
      {doc ? <Detail r={doc} /> : reviews.error ? <Failed message={reviews.error} onRetry={reviews.refresh} /> : <Skeleton height={240} radius={22} />}
    </Screen>
  );
}

function Lines({ title, items }: { title: string; items: { text: string; sub?: string | null }[] }) {
  if (!items.length) return null;
  return (
    <Block title={title}>
      <Group>{items.map((x, i) => <Item key={`${i}:${x.text}`} title={x.text} sub={x.sub ?? null} lines={4} />)}</Group>
    </Block>
  );
}

function Detail({ r }: { r: ReviewDoc }) {
  const moved = r.moved ?? r.wins ?? [];
  const sealed = r.status === 'sealed';
  return (
    <View style={s.list}>
      <View style={s.head}>
        {r.headline ? <Text style={t.title3}>{r.headline}</Text> : null}
        {r.feel?.line ? <Text style={t.subhead}>{r.feel.line}</Text> : null}
        <Text style={t.footnote}>{sealed ? (r.sealed_at ? `Closed ${shortDay(r.sealed_at.slice(0, 10))}` : 'Closed') : 'A draft that was never closed. Nothing in it was confirmed.'}</Text>
      </View>
      <Lines title="The week you set" items={(r.closed ?? []).map((c) => ({ text: c.text, sub: `${VERDICT_WORD[c.verdict]}${c.carry ? ', carried on' : ''}` }))} />
      <Lines title="What moved" items={moved.map((m) => ({ text: m.text, sub: m.aspect ? NAME[m.aspect] : null }))} />
      <Lines title="What missed" items={(r.misses ?? []).map((m) => ({ text: m.text, sub: [m.why, m.why2].filter(Boolean).join(', ') || null }))} />
      <Lines title="Rules" items={[
        ...(r.checks ?? []).map((c) => ({ text: c.text, sub: c.held ? 'Held' : 'Broke it' })),
        ...(r.ruleText ? [{ text: r.ruleText, sub: 'New that week' }] : []),
      ]} />
      <Lines title={sealed ? 'Moves for the next week' : 'Moves it suggested'} items={(r.moves ?? []).filter((m) => sealed || m.on !== false).map((m) => ({
        text: m.text, sub: sealed ? MOVE_WORD[m.state ?? ''] ?? null : null,
      }))} />
    </View>
  );
}

const s = StyleSheet.create({
  list: { gap: 24 },
  head: { gap: 8 },
});
