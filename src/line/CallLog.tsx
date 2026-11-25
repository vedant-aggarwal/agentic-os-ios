import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dayLabel, dayOf, clock as timeOf, Empty, Failed, Glyph, Segmented, Skeleton, SURF, t } from '@/aspects/kit';
import { clock } from '@/lib/nora';
import {
  callerOf, categoryOf, downText, line, noteNeedsYou, notSetUp, PHASE, refreshLineCounts, useLineCounts,
  type LineCallSummary, type LineFilter,
} from '@/lib/line';
import { useElapsed } from '@/nora/parts';
import { Chevron } from '@/today2/parts';
import { C, F } from '@/theme';
import {
  CategoryMark, Dots, errText, LineScreen, LineTop, NORA, NORA_TEXT, ONCALL, openCall, openSetup, RoundButton, StatusDot,
} from './parts';

// The call log: every call Nora handled on her line, newest first, by day. A call with a decision for him says
// "Needs you" and opens on the decision; a call on now sits on top and opens the live screen. Filters: All, Needs
// you, Spam, Missed. The gear opens forwarding setup and the line's status.

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'needs-you', label: 'Needs you' },
  { key: 'spam', label: 'Spam' },
  { key: 'missed', label: 'Missed' },
] as const satisfies readonly { key: LineFilter; label: string }[];

type List = { calls: LineCallSummary[] | null; error: string | null; missing: boolean; more: boolean; loadingMore: boolean };
const FRESH: List = { calls: null, error: null, missing: false, more: false, loadingMore: false };
const PAGE = 50;

function useCalls(filter: LineFilter) {
  const cache = useRef(new Map<LineFilter, List>());
  const [list, setList] = useState<List>(FRESH);
  const [refreshing, setRefreshing] = useState(false);
  const shown = useRef(filter);
  const put = useCallback((f: LineFilter, l: List) => { cache.current.set(f, l); if (shown.current === f) setList(l); }, []);

  const load = useCallback(async (f: LineFilter, quiet: boolean) => {
    if (!quiet) setRefreshing(true);
    try {
      const page = await line.calls(f);
      noteNeedsYou(page.counts?.needsYou ?? 0);
      put(f, { calls: page.calls, error: null, missing: false, more: page.calls.length >= PAGE, loadingMore: false });
    } catch (e) {
      const had = cache.current.get(f) ?? FRESH;
      put(f, { ...had, error: errText(e), missing: notSetUp(e) });
    } finally { if (!quiet) setRefreshing(false); }
  }, [put]);

  useEffect(() => {
    shown.current = filter;
    setList(cache.current.get(filter) ?? FRESH);
    void load(filter, true);
  }, [filter, load]);

  const more = useCallback(async () => {
    const l = cache.current.get(filter);
    if (!l?.calls?.length || !l.more || l.loadingMore) return;
    put(filter, { ...l, loadingMore: true });
    try {
      const page = await line.calls(filter, l.calls[l.calls.length - 1].startedAt);
      const seen = new Set(l.calls.map((c) => c.id));
      put(filter, { ...l, calls: [...l.calls, ...page.calls.filter((c) => !seen.has(c.id))], more: page.calls.length >= PAGE, loadingMore: false });
    } catch { put(filter, { ...l, loadingMore: false }); }
  }, [filter, put]);

  return { list, refreshing, reload: (quiet = false) => load(filter, quiet), more };
}

export function CallLog() {
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<LineFilter>('all');
  const { list, refreshing, reload, more } = useCalls(filter);
  const counts = useLineCounts();

  // back from a call (a decision made, a number blocked): look again, quietly; the call on now every 15 s
  useFocusEffect(useCallback(() => {
    void reload(true);
    void refreshLineCounts();
    const id = setInterval(() => { void refreshLineCounts(); }, 15_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]));

  const calls = list.calls;
  const live = useMemo(() => {
    const fromList = (calls ?? []).find((c) => c.phase !== 'ended') ?? null;
    return counts.status?.live ?? fromList;
  }, [calls, counts.status]);
  const sections = useMemo(() => {
    const out: { day: string; data: LineCallSummary[] }[] = [];
    for (const c of calls ?? []) {
      if (c.phase !== 'ended') continue; // on now: the card on top
      const day = dayOf(c.startedAt);
      const last = out[out.length - 1];
      if (last?.day === day) last.data.push(c); else out.push({ day, data: [c] });
    }
    return out;
  }, [calls]);

  const status = counts.status;
  const needs = counts.needsYou ?? 0;
  const sub = status && !status.up ? "Nora's line is down" : needs ? `${needs === 1 ? '1 call needs' : `${needs} calls need`} you` : 'Answered by Nora';
  const subColor = status && !status.up ? C.danger : needs ? NORA_TEXT : undefined;

  const header = (
    <View style={st.head}>
      <LineTop title="Calls" sub={sub} subColor={subColor}
        right={<RoundButton label="Forwarding and line status" onPress={openSetup}>
          <Glyph sf="gearshape.fill" d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 13a7.6 7.6 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-1.7-1L15 3.5h-4L10.7 6a7.6 7.6 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.6a7.6 7.6 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 1.7 1l.3 2.5h4l.3-2.5a7.6 7.6 0 0 0 1.7-1l2.4 1 2-3.4z" size={20} color={C.text} />
        </RoundButton>} />
      <Segmented options={FILTERS} value={filter} onChange={setFilter} />
      {status && !status.up ? (
        <Pressable accessibilityRole="button" accessibilityHint="Opens the line's status and forwarding setup" onPress={openSetup}
          style={({ pressed }) => [st.down, pressed && { backgroundColor: SURF.pressed }]}>
          <StatusDot color={C.danger} />
          <View style={st.flex}>
            <Text style={t.strong}>Nora&apos;s line is down</Text>
            <Text style={t.small}>{downText(status.why)}</Text>
          </View>
          <Chevron />
        </Pressable>
      ) : null}
      {live && filter === 'all' ? <LiveCard c={live} /> : null}
    </View>
  );

  const empty = calls == null ? (
    list.error ? (
      list.missing ? (
        <Empty title="Nora's line isn't on your PC yet" body="Calls she answers show here once her line runs on your PC. You can set up forwarding now."
          action="Set up forwarding" onAction={openSetup} />
      ) : <Failed message={list.error} onRetry={() => void reload()} />
    ) : (
      <View style={st.skel}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} height={84} radius={20} />)}</View>
    )
  ) : !sections.length && !(live && filter === 'all') ? <EmptyFor filter={filter} /> : undefined;

  return (
    <LineScreen>
      <SectionList
        sections={sections}
        keyExtractor={(c) => c.id}
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: Math.max(insets.bottom, 16) + 32 }}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        renderSectionHeader={({ section }) => <Text accessibilityRole="header" style={st.day}>{dayLabel(section.day)}</Text>}
        renderItem={({ item, index, section }) => <CallRow c={item} first={index === 0} last={index === section.data.length - 1} />}
        onEndReachedThreshold={0.4}
        onEndReached={() => void more()}
        ListFooterComponent={list.loadingMore ? <ActivityIndicator style={st.more} color={C.muted} />
          : calls?.length && list.error ? <Text style={[t.caption, st.note]}>{list.error}</Text> : undefined}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void reload(); void refreshLineCounts(); }} tintColor={C.muted} />}
      />
    </LineScreen>
  );
}

function EmptyFor({ filter }: { filter: LineFilter }) {
  if (filter === 'needs-you') return <Empty title="Nothing needs you" body="When a call ends with something for you to decide, it waits here with its buttons." />;
  if (filter === 'spam') return <Empty title="No spam calls" body="Calls Nora marks as spam land here. Block a number from its call." />;
  if (filter === 'missed') return <Empty title="No missed calls" body="Callers who hung up before Nora could answer show here." />;
  return (
    <Empty title="No calls yet" body="Nora answers the calls you decline or miss, and every unknown number, once forwarding is on."
      action="Set up forwarding" onAction={openSetup} />
  );
}

/** The call on now: who, Nora's step, the timer. Opens the live screen. */
function LiveCard({ c }: { c: LineCallSummary }) {
  const secs = useElapsed(Date.parse(c.startedAt));
  const you = c.phase === 'you';
  const tone = you ? ONCALL : NORA;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Live call with ${callerOf(c)}. ${PHASE[c.phase]}. Opens the call`}
      onPress={() => openCall(c.id)} style={({ pressed }) => [st.live, { borderColor: `${tone}55` }, pressed && { opacity: 0.8 }]}>
      <CategoryMark category={c.category} live size={44} />
      <View style={st.flex}>
        <View style={st.liveHead}>
          {you ? <StatusDot color={ONCALL} /> : <Dots color={NORA} />}
          <Text style={[st.liveLabel, { color: you ? ONCALL : NORA_TEXT }]}>{you ? 'You are on the call' : c.phase === 'ringing' ? 'Ringing Nora' : 'Nora is on a call'}</Text>
          <Text style={[st.liveLabel, t.num, st.liveTime]}>{clock(secs)}</Text>
        </View>
        <Text numberOfLines={1} style={st.title}>{callerOf(c)}</Text>
        <Text numberOfLines={1} style={t.small}>{categoryOf(c.category).label}{c.headline ? ` · ${c.headline}` : ''}</Text>
      </View>
      <Chevron />
    </Pressable>
  );
}

function CallRow({ c, first, last }: { c: LineCallSummary; first: boolean; last: boolean }) {
  const caller = callerOf(c);
  const meta = [
    categoryOf(c.category).label,
    c.seconds > 0 ? clock(c.seconds) : null,
    c.handledBy !== 'nora' ? 'You talked' : null,
    c.blocked ? 'Blocked' : null,
  ].filter(Boolean).join(' · ');
  return (
    <Pressable accessibilityRole="button"
      accessibilityLabel={`${caller}, ${timeOf(c.startedAt)}. ${c.headline}. ${meta}${c.needsYou ? '. Needs you' : ''}`}
      onPress={() => openCall(c.id)}
      style={({ pressed }) => [st.row, first && st.rowFirst, last && st.rowLast, !first && st.rule, pressed && { backgroundColor: SURF.pressed }]}>
      <CategoryMark category={c.category} />
      <View style={st.flex}>
        <View style={st.rowTop}>
          <Text numberOfLines={1} style={[st.title, c.category === 'spam' && { color: C.muted }]}>{caller}</Text>
          <Text style={[st.time, t.num]}>{timeOf(c.startedAt)}</Text>
        </View>
        {c.headline ? <Text numberOfLines={2} style={st.headline}>{c.headline}</Text> : null}
        <View style={st.meta}>
          {c.needsYou ? (
            <View style={st.needs}><StatusDot color={NORA} size={7} /><Text style={st.needsText}>Needs you</Text></View>
          ) : null}
          <Text numberOfLines={1} style={[st.metaText, st.flexShrink]}>{meta}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const st = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  flexShrink: { flexShrink: 1 },
  head: { paddingHorizontal: 16, gap: 16, paddingBottom: 4 },
  skel: { paddingHorizontal: 16, gap: 10, paddingTop: 20 },
  day: { fontFamily: F.semibold, fontSize: 14, lineHeight: 20, color: C.muted, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginHorizontal: 16, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: SURF.card },
  rowFirst: { borderTopLeftRadius: 20, borderTopRightRadius: 20, borderCurve: 'continuous' },
  rowLast: { borderBottomLeftRadius: 20, borderBottomRightRadius: 20, borderCurve: 'continuous' },
  rule: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.08)' },
  rowTop: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  title: { flex: 1, minWidth: 0, fontFamily: F.medium, fontSize: 16, lineHeight: 22, color: C.text },
  time: { fontFamily: F.regular, fontSize: 13, lineHeight: 18, color: C.faint },
  headline: { fontFamily: F.regular, fontSize: 14, lineHeight: 20, color: C.textSoft, marginTop: 2 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  metaText: { fontFamily: F.regular, fontSize: 13, lineHeight: 18, color: C.faint },
  needs: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  needsText: { fontFamily: F.medium, fontSize: 13, lineHeight: 18, color: NORA_TEXT },
  down: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 20, borderCurve: 'continuous',
    backgroundColor: 'rgba(248,113,113,0.10)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(248,113,113,0.35)',
  },
  live: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 20, borderCurve: 'continuous',
    backgroundColor: 'rgba(240,69,122,0.08)', borderWidth: StyleSheet.hairlineWidth,
  },
  liveHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  liveLabel: { fontFamily: F.medium, fontSize: 13, lineHeight: 18 },
  liveTime: { marginLeft: 'auto', color: C.muted },
  more: { paddingVertical: 20 },
  note: { textAlign: 'center', paddingVertical: 16, paddingHorizontal: 24 },
});
