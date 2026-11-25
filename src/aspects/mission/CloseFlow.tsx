import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { addDays, Button, Chip, Empty, Group, haptic, Screen, Skeleton, t, today, undoable, useAspect, weekStart } from '@/aspects/kit';
import { useGet } from '@/lib/mod';
import { C, type AspectKey } from '@/theme';
import { act, ASPECT_LABEL, cap, count, endedAgo, message, nextStart, NUMBER_WORDS, OUTCOME_WORD, slotsPath, WHY_MISSED } from './data';
import { useNav } from './nav';
import { colorOf, Dot, Link, s as ps, Tile } from './parts';
import type { Full, Goal, Home, Horizon, Outcome } from './types';

const CARRY_TO: Horizon[] = ['week', 'month', 'quarter'];
const pad = (n: number) => String(n).padStart(2, '0');

/** The key of the period `day` is in, as the PC names it: 2026-W48 (ISO week), 2026-11, 2026-Q4, 2026. */
function periodKey(h: Horizon, day: string) {
  const [y, m] = day.split('-').map(Number);
  if (h === 'month') return `${y}-${pad(m)}`;
  if (h === 'quarter') return `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
  if (h !== 'week') return String(y);
  const thu = addDays(weekStart(day), 3); // an ISO week belongs to the year its Thursday is in
  const ty = Number(thu.slice(0, 4));
  const n = Math.round((Date.parse(`${weekStart(thu)}T00:00:00Z`) - Date.parse(`${weekStart(`${ty}-01-04`)}T00:00:00Z`)) / (7 * 86_400_000)) + 1;
  return `${ty}-W${pad(n)}`;
}
/**
 * Where Carry forward sends a goal, the way the PC picks it: the current period (next week on a Sunday), or the one
 * after when the goal already sits in the current one.
 */
function carryStart(goal: Goal, h: Horizon, sunday: boolean) {
  const day = h === 'week' && sunday ? addDays(today(), 1) : today();
  return goal.horizon === h && goal.period === periodKey(h, day) ? nextStart(h, day) : day;
}
const LATER: Record<string, [string, string]> = { month: ['this month', 'next month'], quarter: ['this quarter', 'next quarter'], year: ['this year', 'next year'] };
/** "next week", "the week after", "next month": the period starting `start`, named from where he stands. */
function periodName(h: Horizon, start: string, sunday: boolean) {
  const cur = h === 'week' && sunday ? addDays(today(), 1) : today();
  const w = h === 'week' ? [sunday ? 'next week' : 'this week', sunday ? 'the week after' : 'next week'] : LATER[h] ?? ['now', 'later'];
  const k = periodKey(h, start);
  return k === periodKey(h, cur) ? w[0] : k === periodKey(h, nextStart(h, cur)) ? w[1] : 'a later one';
}

/**
 * Closing one goal: what happened, in one tap. Missed and Let go take one more tap for why (or skip). Carry forward
 * asks where to. Nothing is deleted; the outcome stays on the record.
 */
export function CloseChoice({ goal, sunday, onClosed, nested }: { goal: Goal; sunday: boolean; onClosed: (out: Outcome, why?: string | null) => void; nested?: boolean }) {
  const a = useAspect();
  const [pick, setPick] = useState<Outcome | null>(null);
  const [into, setInto] = useState<Horizon | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // the period he carried it into was full: ask which open goal there it replaces, or carry it one period further
  const [full, setFull] = useState<{ h: Horizon; start: string; path: string } | null>(null);
  const slots = useGet<Full>(full?.path ?? null);
  const send = async (outcome: Outcome, extra: { why?: string | null; to?: string; replaces?: string } = {}, tag: string = outcome, at?: { h: Horizon; start: string }) => {
    setBusy(tag);
    try {
      await act('/close', { goal: goal.id, outcome, ...extra });
      if (outcome === 'done') haptic.success(); else haptic.medium();
      setFull(null);
      onClosed(outcome, extra.why ?? null);
    } catch (e) {
      const path = at ? slotsPath(e, at.h, at.start) : null;
      if (path && at) { setFull({ ...at, path }); haptic.light(); } else a.notice(message(e));
    } finally { setBusy(null); }
  };
  const carry = (h: Horizon) => { setInto(h); setFull(null); void send('carried', { to: h }, `to:${h}`, { h, start: carryStart(goal, h, sunday) }); };
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
          <Text style={t.footnote}>What got in the way? One tap, or skip.</Text>
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
          <Text style={t.footnote}>Carry it into</Text>
          <View style={st.chips}>
            {[...new Set<Horizon>([...CARRY_TO, ...(goal.horizon === 'year' ? ['year' as Horizon] : [])])].map((h) => (
              <Chip key={h} label={h === 'year' ? 'This year' : carryLabel(h)} selected={into === h} onPress={busy ? undefined : () => carry(h)} />
            ))}
          </View>
        </View>
      ) : null}
      {pick === 'carried' && full ? (
        <Replace goal={goal} full={full} f={slots.data} error={slots.error} busy={busy} sunday={sunday} nested={nested}
          onReplace={(f, id) => void send('carried', { to: f.key, replaces: id }, id)}
          onLater={(start) => void send('carried', { to: periodKey(full.h, start) }, 'later', { h: full.h, start })} />
      ) : null}
    </View>
  );
}

/** A full period: its open goals as tiles (tap the one this replaces), or carry it one period further. */
function Replace({ goal, full, f, error, busy, sunday, nested, onReplace, onLater }: {
  goal: Goal; full: { h: Horizon; start: string }; f: Full | null; error: string | null; busy: string | null; sunday: boolean; nested?: boolean;
  onReplace: (f: Full, id: string) => void; onLater: (start: string) => void;
}) {
  const a = useAspect();
  const open = f ? f.goals.filter((x) => x.status === 'active' && x.id !== goal.id) : [];
  const later = nextStart(full.h, full.start);
  return (
    <View style={st.follow}>
      <Text style={t.subhead}>
        {f ? `${f.label} already holds ${NUMBER_WORDS[f.limit] ?? f.limit}. ${open.length ? 'Pick the one this replaces. That one is let go, with the reason kept.' : 'None of them is still open to replace.'}` : 'That period is full.'}
      </Text>
      {!f ? (error ? <Text style={t.footnote}>{error}</Text> : <Skeleton height={56} radius={16} />) : open.map((x) => (
        <Tile key={x.id} nested={nested} title={x.title} sub={busy === x.id ? 'Replacing it' : ASPECT_LABEL[x.aspect as AspectKey] ?? 'Goal'}
          color={colorOf(x.aspect, a.color)} selected={busy === x.id} onPress={() => { if (!busy) onReplace(f, x.id); }} wrap={st.full} />
      ))}
      <Button label={`Carry it into ${periodName(full.h, later, sunday)} instead`} kind="quiet" small busy={busy === 'later'} disabled={!!busy} onPress={() => onLater(later)} wrap={st.left} />
    </View>
  );
}

/** The clean-up: every goal past its end date, one card each. The first run clears out what is left from before. */
export function CloseFlow({ open, onClose, home }: { open: boolean; onClose: () => void; home: Home | null }) {
  const a = useAspect();
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
    try { await act('/reopen', { goal: g.id }); setItems((xs) => xs.map((x) => (x.g.id === g.id ? { ...x, out: null } : x))); } catch (e) { a.notice(message(e)); }
  };
  const closed = (g: Goal, o: Outcome, w: string | null | undefined) => {
    setItems((xs) => xs.map((x) => (x.g.id === g.id ? { ...x, out: o, why: w } : x)));
    undoable(`${OUTCOME_WORD[o]}: ${g.title}`, () => reopen(g));
  };
  return (
    <Screen open={open} onClose={onClose} title="Close goals">
      {!home ? (
        <View style={st.gap}><Skeleton height={20} width="70%" /><Skeleton height={220} radius={24} /></View>
      ) : !items.length ? (
        <Empty title="Nothing ran past its date" body="When a goal's week, month or quarter ends, it comes here to be closed." />
      ) : (
        <>
          <Text style={t.subhead}>
            {left ? `${cap(count(left, 'goal'))} still open past ${left === 1 ? 'its' : 'their'} end. Say what happened to ${left === 1 ? 'it' : 'each'}. It all stays on your record.` : 'All closed. Your record keeps each one.'}
          </Text>
          {items.map(({ g, out, why }) => (
            <Group key={g.id} pad>
              <View style={st.headCol}>
                <View style={st.head}>
                  <Dot aspect={g.aspect} top={7} />
                  <Text numberOfLines={3} style={[t.headline, ps.flex, out && { color: C.faint }]}>{g.title}</Text>
                </View>
                <Text style={t.footnote}>{[cap(g.horizon === 'week' ? `Week of ${g.label}` : g.label), endedAgo(g.end)].filter(Boolean).join('. ')}</Text>
              </View>
              {out ? (
                <View style={st.closed}>
                  <Text style={[t.subhead, ps.flex]}>{why ? `${OUTCOME_WORD[out]}, ${why.toLowerCase()}` : OUTCOME_WORD[out]}</Text>
                  <Link label="Undo" onPress={() => void reopen(g)} />
                </View>
              ) : (
                <CloseChoice nested goal={g} sunday={sunday} onClosed={(o, w) => closed(g, o, w)} />
              )}
            </Group>
          ))}
          {!left && live ? (
            // a week that already holds its three has nothing left to set: go back to it on home instead
            live.commitments.filter((c) => c.status !== 'dropped').length >= live.limit
              ? <Button label={sunday ? 'See next week' : 'See this week'} kind="soft" onPress={onClose} />
              : <Button label={sunday ? 'Set next week' : 'Set this week'} kind="accent" onPress={() => { onClose(); nav.add({ horizon: 'week', start: live.start }); }} />
          ) : null}
        </>
      )}
    </Screen>
  );
}

const st = StyleSheet.create({
  gap: { gap: 16 },
  headCol: { gap: 4 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  closed: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  choice: { gap: 12 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  follow: { gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  full: { flexBasis: 'auto', flexGrow: 0 },
  left: { alignSelf: 'flex-start' },
});
