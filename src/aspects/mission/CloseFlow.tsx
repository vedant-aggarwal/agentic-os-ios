import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Card, Chip, Empty, haptic, Screen, Skeleton, t, useAspect } from '@/aspects/kit';
import { C } from '@/theme';
import { act, cap, count, endedAgo, message, OUTCOME_WORD, WHY_MISSED } from './data';
import { useNav } from './nav';
import { Dot, Link, s as ps, Tile } from './parts';
import type { Goal, Home, Horizon, Outcome } from './types';

const CARRY_TO: Horizon[] = ['week', 'month', 'quarter'];

/**
 * Closing one goal: what happened, in one tap. Missed and Let go take one more tap for why (or skip). Carry forward
 * asks where to. Nothing is deleted; the outcome stays on the record.
 */
export function CloseChoice({ goal, sunday, onClosed, nested }: { goal: Goal; sunday: boolean; onClosed: (out: Outcome, why?: string | null) => void; nested?: boolean }) {
  const a = useAspect();
  const [pick, setPick] = useState<Outcome | null>(null);
  const [busy, setBusy] = useState(false);
  const send = async (outcome: Outcome, extra: { why?: string | null; to?: Horizon } = {}) => {
    setBusy(true);
    try {
      await act('/close', { goal: goal.id, outcome, ...extra });
      if (outcome === 'done') haptic.success(); else haptic.medium();
      onClosed(outcome, extra.why ?? null);
    } catch (e) { a.notice(message(e)); } finally { setBusy(false); }
  };
  const carryLabel = (h: Horizon) => (h === 'week' ? (sunday ? 'Next week' : 'This week') : h === 'month' ? 'This month' : 'This quarter');
  return (
    <View style={st.choice}>
      <View style={st.tiles}>
        <Tile nested={nested} title="Done" selected={pick === 'done'} onPress={() => { setPick('done'); void send('done'); }} />
        <Tile nested={nested} title="Missed" selected={pick === 'missed'} onPress={() => setPick('missed')} />
        <Tile nested={nested} title="Carry forward" selected={pick === 'carried'} onPress={() => setPick('carried')} />
        <Tile nested={nested} title="Let go" selected={pick === 'dropped'} onPress={() => setPick('dropped')} />
      </View>
      {pick === 'missed' || pick === 'dropped' ? (
        <View style={st.follow}>
          <Text style={t.label}>What got in the way? One tap, or skip.</Text>
          <View style={st.chips}>
            {(pick === 'dropped' ? ['Plans changed', 'Lost interest', 'Done another way', 'Too big'] : WHY_MISSED).map((w) => (
              <Chip key={w} label={w} onPress={busy ? undefined : () => void send(pick, { why: w })} />
            ))}
            <Chip label="Skip" onPress={busy ? undefined : () => void send(pick, { why: null })} />
          </View>
        </View>
      ) : null}
      {pick === 'carried' ? (
        <View style={st.follow}>
          <Text style={t.label}>Carry it into</Text>
          <View style={st.chips}>
            {[...new Set<Horizon>([...CARRY_TO, ...(goal.horizon === 'year' ? ['year' as Horizon] : [])])].map((h) => (
              <Chip key={h} label={h === 'year' ? 'This year' : carryLabel(h)} selected={h === goal.horizon} onPress={busy ? undefined : () => void send('carried', { to: h })} />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** The clean-up: every goal past its end date, one card each. The first run clears out what is left from before. */
export function CloseFlow({ open, onClose, home }: { open: boolean; onClose: () => void; home: Home | null }) {
  const nav = useNav();
  const [items, setItems] = useState<{ g: Goal; out: Outcome | null; why?: string | null }[]>([]);
  const [was, setWas] = useState(false);
  if (open && !was) { setWas(true); setItems((home?.stale ?? []).map((g) => ({ g, out: null }))); }
  if (!open && was) setWas(false);
  if (open && home && !items.length && home.stale.length) setItems(home.stale.map((g) => ({ g, out: null })));

  const left = items.filter((i) => !i.out).length;
  const sunday = home?.weekday === 7;
  const live = home ? home.plan ?? home.week : null;
  const reopen = async (g: Goal) => {
    try { await act('/reopen', { goal: g.id }); setItems((xs) => xs.map((x) => (x.g.id === g.id ? { ...x, out: null } : x))); } catch {}
  };
  return (
    <Screen open={open} onClose={onClose} title="Close goals">
      {!home ? (
        <View style={st.gap}><Skeleton height={20} width="70%" /><Skeleton height={220} radius={24} /></View>
      ) : !items.length ? (
        <Empty title="Nothing ran past its date" body="When a goal's week, month or quarter ends, it comes here to be closed." />
      ) : (
        <>
          <Text style={t.body}>
            {left ? `${cap(count(left, 'goal'))} still open past ${left === 1 ? 'its' : 'their'} end. Say what happened to each. It all stays on your record.` : 'All closed. Your record keeps each one.'}
          </Text>
          {items.map(({ g, out, why }) => (
            <Card key={g.id} style={st.card}>
              <View style={st.head}>
                <Dot aspect={g.aspect} top={8} />
                <Text numberOfLines={3} style={[t.strong, ps.flex, out && { color: C.muted }]}>{g.title}</Text>
              </View>
              <Text style={t.caption}>{[cap(g.horizon === 'week' ? `Week of ${g.label}` : g.label), endedAgo(g.end)].filter(Boolean).join('. ')}</Text>
              {out ? (
                <View style={st.closed}>
                  <Text style={[t.label, ps.flex]}>{why ? `${OUTCOME_WORD[out]}, ${why.toLowerCase()}` : OUTCOME_WORD[out]}</Text>
                  <Link label="Undo" onPress={() => void reopen(g)} />
                </View>
              ) : (
                <CloseChoice nested goal={g} sunday={sunday} onClosed={(o, w) => setItems((xs) => xs.map((x) => (x.g.id === g.id ? { ...x, out: o, why: w } : x)))} />
              )}
            </Card>
          ))}
          {!left && live ? (
            <Button label={sunday ? 'Set next week' : 'Set this week'} onPress={() => { onClose(); nav.add({ horizon: 'week', start: live.start }); }} />
          ) : null}
        </>
      )}
    </Screen>
  );
}

const st = StyleSheet.create({
  gap: { gap: 16 },
  card: { gap: 8 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  closed: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 32 },
  choice: { gap: 12, marginTop: 4 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  follow: { gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
