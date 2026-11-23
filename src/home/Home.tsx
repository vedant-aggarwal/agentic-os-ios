import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { GestureDetector, ScrollView, usePanGesture } from 'react-native-gesture-handler';
import Swipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { FadeIn, FadeOut, LinearTransition, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { haptic, SURF, t, tint } from '@/aspects/kit/tokens';
import { Chip, Toast } from '@/capture/parts';
import { DEMO } from '@/lib/demo';
import { nora as noraApi, type FeedItem, type NoraHome } from '@/lib/nora';
import type { Task } from '@/lib/today';
import { Ball, useTurn } from '@/nora/Sphere';
import { noraUi } from '@/nora/state';
import { C, F } from '@/theme';
import { Chevron, Dots, NORA, NORA_TEXT, Tick } from '@/today2/parts';
import { areaColor, CreateSheet } from './Create';
import { addDays, istDay, useHomeData, type Draft, type HomeData, type Tag } from './data';

// Home (the dock's Home orb): Nora at the top with what she is on, her three tasks, then his own task list in the
// manner of Google Tasks: add, tick, area tags, Tag Nora, and what she found under each task. Show all opens her page.

const dockClear = (bottom: number) => Math.max(bottom, 12) + 12 + 64 + 40;
const SHOWN_NO_DATE = 3;
const msg = (e: unknown) => (e instanceof Error ? e.message : 'That didn’t save.');

type Say = (text: string, action?: { label: string; onPress: () => void } | null) => void;
function useSay() {
  const [toast, setToast] = useState<{ text: string; action?: { label: string; onPress: () => void } | null } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const say = useCallback<Say>((text, action) => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ text, action });
    timer.current = setTimeout(() => setToast(null), action ? 4000 : 2600);
  }, []);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return { toast, say, hide: () => setToast(null) };
}

export function HomeBody({ open }: { open: boolean }) {
  const insets = useSafeAreaInsets();
  const d = useHomeData(open);
  const { toast, say, hide } = useSay();
  const [page, setPage] = useState<'home' | 'nora'>('home');
  return (
    <View style={{ flex: 1 }}>
      {page === 'home'
        ? <HomePage d={d} say={say} hide={hide} onNora={() => setPage('nora')} />
        : <NoraPage d={d} say={say} onBack={() => setPage('home')} />}
      <View pointerEvents="box-none" style={[st.toast, { bottom: dockClear(insets.bottom) + 8 }]}>
        <Toast text={toast?.text ?? null} action={toast?.action} />
      </View>
    </View>
  );
}

// ── presence ─────────────────────────────────────────────────────────────────────────────────────────────────────
function presence(h: NoraHome | null, tags: Record<string, Tag>) {
  if (!h) return { line: 'Can’t reach Nora', dim: true };
  if (h.inCall) return { line: 'On a call with you', dim: false, live: true };
  const on = (h.busy ? 1 : 0) + Object.values(tags).filter((x) => x.state === 'working').length;
  const lined = Object.values(tags).filter((x) => x.state === 'queued').length + (h.upcoming?.length ?? 0);
  if (!h.awake) return { line: h.heartbeat.next ? `Resting, next check ${h.heartbeat.next}` : 'Resting', dim: true };
  const mood = h.mood?.label ? ` and ${h.mood.label.toLowerCase()}` : '';
  const work = on ? `, on ${on} task${on > 1 ? 's' : ''}` : lined ? `, ${lined} lined up` : '';
  return { line: `Awake${mood}${work}`, dim: false };
}

function Header({ h, tags, title = 'Nora', onBack }: { h: NoraHome | null; tags: Record<string, Tag>; title?: string; onBack?: () => void }) {
  const turn = useTurn(true);
  const p = presence(h, tags);
  return (
    <View style={st.header}>
      {onBack ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} hitSlop={6} style={st.round}>
          <Svg width={18} height={18} viewBox="0 0 24 24"><Path d="M15 5l-7 7 7 7" stroke={C.text} strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round" /></Svg>
        </Pressable>
      ) : null}
      <View style={[st.ball, p.dim && { opacity: 0.6 }]}><Ball t={turn} r={18} /></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text accessibilityRole="header" style={t.title2}>{title}</Text>
        <View style={st.presence}>
          {p.live ? <Dots color={NORA} /> : null}
          <Text numberOfLines={1} style={[t.small, p.live && { color: NORA_TEXT }]}>{p.line}</Text>
        </View>
      </View>
      {!onBack ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={noraUi.closeHome} hitSlop={6} style={st.round}>
          <Svg width={16} height={16} viewBox="0 0 24 24"><Path d="M6 6l12 12M18 6L6 18" stroke={C.text} strokeWidth={2.2} strokeLinecap="round" /></Svg>
        </Pressable>
      ) : null}
    </View>
  );
}

// ── Nora's tasks ─────────────────────────────────────────────────────────────────────────────────────────────────
type NoraItem = { id: string; lead: 'working' | 'time' | 'queued' | 'needs' | 'error'; time?: string; title: string };
function noraItems(d: HomeData): NoraItem[] {
  const out: NoraItem[] = [];
  const h = d.home, tasks = d.today?.tasks ?? [];
  const title = (id: string) => tasks.find((x) => x.id === id)?.title ?? id;
  for (const a of h?.asks ?? []) out.push({ id: `ask:${a.id}`, lead: 'needs', title: a.title });
  if (h?.busy) out.push({ id: 'busy', lead: 'working', title: h.busy.title });
  const tags = Object.values(d.tags);
  for (const g of tags.filter((x) => x.state === 'ask')) out.push({ id: `tag:${g.taskId}`, lead: 'needs', title: title(g.taskId) });
  for (const g of tags.filter((x) => x.state === 'working')) out.push({ id: `tag:${g.taskId}`, lead: 'working', title: title(g.taskId) });
  for (const g of tags.filter((x) => x.state === 'error')) out.push({ id: `tag:${g.taskId}`, lead: 'error', title: title(g.taskId) });
  for (const u of h?.upcoming ?? []) out.push({ id: `up:${u.id}`, lead: 'time', time: u.time, title: u.title.replace(/^\d{1,2}:\d{2}\s*:?\s*/, '') });
  for (const g of tags.filter((x) => x.state === 'queued')) out.push({ id: `tag:${g.taskId}`, lead: 'queued', title: title(g.taskId) });
  for (const x of tasks.filter((x) => x.owner === 'nora' && x.status !== 'done' && x.status !== 'dropped')) out.push({ id: `own:${x.id}`, lead: 'queued', title: x.title });
  return out;
}

function Lead({ it }: { it: NoraItem }) {
  if (it.lead === 'working') return <View style={st.lead}><Dots color={NORA} /><Text style={[st.leadText, { color: NORA_TEXT }]}>Working</Text></View>;
  if (it.lead === 'needs') return <View style={st.lead}><View style={[st.dot8, { backgroundColor: NORA }]} /><Text style={[st.leadText, { color: NORA_TEXT }]}>Needs you</Text></View>;
  if (it.lead === 'error') return <View style={st.lead}><View style={[st.dot8, { backgroundColor: C.danger }]} /><Text style={[st.leadText, { color: C.danger }]}>Could not finish</Text></View>;
  if (it.lead === 'time') {
    return (
      <View style={st.lead}>
        <Svg width={14} height={14} viewBox="0 0 24 24"><Circle cx={12} cy={12} r={9} stroke={C.muted} strokeWidth={2} fill="none" /><Path d="M12 7v5l3 2" stroke={C.muted} strokeWidth={2} fill="none" strokeLinecap="round" /></Svg>
        <Text style={[st.leadText, t.num]}>{it.time}</Text>
      </View>
    );
  }
  return <View style={st.lead}><View style={st.ring12} /><Text style={st.leadText}>Not started</Text></View>;
}

function NoraCards({ items, onOpen }: { items: NoraItem[]; onOpen: () => void }) {
  const { width } = useWindowDimensions();
  const w = Math.round((width - 32) / 2.45);
  if (!items.length) {
    return <View style={st.emptyCard}><Text style={t.small}>Nothing on her list right now.</Text><Text style={t.caption}>Tag her on a task below and it shows here.</Text></View>;
  }
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.cards} style={st.cardsWrap}>
      {items.slice(0, 3).map((it) => (
        <Pressable key={it.id} accessibilityRole="button" onPress={onOpen} style={({ pressed }) => [st.card, { width: w }, pressed && { backgroundColor: SURF.pressed }]}>
          <Lead it={it} />
          <Text numberOfLines={3} style={st.cardTitle}>{it.title}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

// ── the home page ────────────────────────────────────────────────────────────────────────────────────────────────
function HomePage({ d, say, hide, onNora }: { d: HomeData; say: Say; hide: () => void; onNora: () => void }) {
  const insets = useSafeAreaInsets();
  const [list, setList] = useState<string | null>(null); // area slug, 'none', or null for all lists
  const [picking, setPicking] = useState(false);
  const [sheet, setSheet] = useState<{ edit: (Draft & { id: string }) | null } | null>(null);
  const [allNoDate, setAllNoDate] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [holding, setHolding] = useState<Set<string>>(new Set());
  const today = istDay(), tomorrow = addDays(today, 1);
  useEffect(() => noraUi.onCreate(() => setSheet({ edit: null })), []);

  const mine = useMemo(() => (d.today?.tasks ?? []).filter((x) => !x.parent && (x.owner == null || x.owner === 'me')
    && (list == null || (list === 'none' ? !x.area : x.area === list))), [d.today, list]);
  const buckets = useMemo(() => {
    const open = mine.filter((x) => ['inbox', 'todo', 'doing'].includes(x.status) || (x.status === 'done' && holding.has(x.id)));
    // his own order first (a drag sets position), newest on ties; Later keeps date order
    const pos = (x: Task) => x.position ?? 0;
    const byPos = (a: Task, b: Task) => pos(a) - pos(b) || Number(b.id.slice(1)) - Number(a.id.slice(1));
    const byDue = (a: Task, b: Task) => String(a.due).localeCompare(String(b.due)) || byPos(a, b);
    return {
      today: open.filter((x) => x.due && x.due <= today).sort(byPos),
      tomorrow: open.filter((x) => x.due === tomorrow).sort(byPos),
      later: open.filter((x) => x.due && x.due > tomorrow).sort(byDue),
      none: open.filter((x) => !x.due).sort(byPos),
      done: mine.filter((x) => x.status === 'done' && !holding.has(x.id) && !!x.completedAt && istDay(Date.parse(x.completedAt)) === today),
    };
  }, [mine, holding, today, tomorrow]);

  const tick = (x: Task) => {
    const done = x.status !== 'done';
    if (done) {
      setHolding((h) => new Set(h).add(x.id));
      setTimeout(() => setHolding((h) => { const n = new Set(h); n.delete(x.id); return n; }), 900);
    }
    d.toggle(x.id).catch((e) => say(msg(e)));
  };
  const remove = (x: Task) => {
    haptic.warn();
    d.remove(x.id).then(() => say('Task deleted', { label: 'Undo', onPress: () => { hide(); d.restore(x.id).catch((e) => say(msg(e))); } }), (e) => say(msg(e)));
  };
  const toggleNora = (x: Task) => {
    if (d.tags[x.id]) d.untag(x.id).then(() => say('Taken back from Nora'), (e) => say(msg(e)));
    else d.tag(x.id, x.title).then(() => say('Nora has it'), (e) => say(msg(e)));
  };
  const justDragged = useRef(false);
  const editOf = (x: Task) => {
    if (justDragged.current) return; // the finger lifting off a drag is not a tap
    setSheet({ edit: { id: x.id, title: x.title, notes: '', area: x.area, due: x.due, nora: !!d.tags[x.id] } });
  };

  // ── drag to reorder: hold a row, drag it within or across buckets; a drop in another bucket takes that bucket's date ──
  const bucketY = useRef(new Map<BucketKey, number>());
  const rowBox = useRef(new Map<string, { b: BucketKey; y: number; h: number }>());
  const [drop, setDrop] = useState<number | null>(null);
  const shownNoDate = allNoDate ? buckets.none : buckets.none.slice(0, SHOWN_NO_DATE);
  const lists: Record<BucketKey, Task[]> = { today: buckets.today, tomorrow: buckets.tomorrow, later: buckets.later, none: shownNoDate };
  const top = (id: string) => { const r = rowBox.current.get(id); return r ? { ...r, top: (bucketY.current.get(r.b) ?? 0) + r.y } : null; };
  function placeFor(id: string, dy: number) {
    const me = top(id);
    if (!me) return null;
    const finger = me.top + me.h / 2 + dy;
    let b: BucketKey = me.b;
    let firstY = Infinity;
    for (const k of BUCKETS) {
      const y = bucketY.current.get(k);
      if (y == null || !lists[k].length) continue;
      if (y < firstY) { firstY = y; if (finger < y) b = k; }
      if (y <= finger) b = k;
    }
    const rows = lists[b].filter((x) => x.id !== id).flatMap((x) => { const r = top(x.id); return r ? [{ x, r }] : []; });
    const next = rows.find((o) => o.r.top + o.r.h / 2 > finger) ?? null;
    const prev = [...rows].reverse().find((o) => o.r.top + o.r.h / 2 <= finger) ?? null;
    const line = next ? next.r.top : prev ? prev.r.top + prev.r.h : (bucketY.current.get(b) ?? 0) + 32;
    return { b, prev: prev?.x ?? null, next: next?.x ?? null, line };
  }
  const onMove = (id: string, dy: number) => setDrop(placeFor(id, dy)?.line ?? null);
  const onDrop = (x: Task, dy: number) => {
    justDragged.current = true;
    setTimeout(() => { justDragged.current = false; }, 400);
    setDrop(null);
    const p = placeFor(x.id, dy);
    const me = rowBox.current.get(x.id);
    if (!p || !me) return;
    const L = lists[p.b], i = L.indexOf(x);
    if (p.b === me.b && (L[i - 1] ?? null) === p.prev && (L[i + 1] ?? null) === p.next) return; // dropped where it was
    const due = p.b === me.b ? undefined : p.b === 'today' ? today : p.b === 'tomorrow' ? tomorrow : p.b === 'later' ? addDays(today, 2) : null;
    const pos = (t: Task) => t.position ?? 0;
    haptic.success();
    const fail = (e: unknown) => say(msg(e));
    if (p.prev && p.next && pos(p.next) - pos(p.prev) > 1e-6) d.reorder(x.id, (pos(p.prev) + pos(p.next)) / 2, due).catch(fail);
    else if (!p.prev && p.next) d.reorder(x.id, pos(p.next) - 1024, due).catch(fail);
    else if (p.prev && !p.next) d.reorder(x.id, pos(p.prev) + 1024, due).catch(fail);
    else if (!p.prev && !p.next) d.reorder(x.id, 0, due).catch(fail);
    else {
      // neighbours share a position (old tasks all sit at 0): number the bucket afresh in the new order
      const rest = L.filter((t) => t !== x);
      const at = rest.indexOf(p.next!);
      const order = [...rest.slice(0, at), x, ...rest.slice(at)];
      order.forEach((t, k) => { if (t === x || pos(t) !== k * 1024) d.reorder(t.id, k * 1024, t === x ? due : undefined).catch(fail); });
    }
  };

  const areaName = (slug: string | null) => (slug ? d.areas.find((a) => a.slug === slug)?.name ?? slug : null);
  const listLabel = list == null ? 'All lists' : list === 'none' ? 'No area' : areaName(list) ?? list;
  const row = (x: Task, first: boolean, showDue: boolean, b?: BucketKey) => (
    <TaskRow key={x.id} x={x} first={first} d={d} showDue={showDue} areaName={areaName(x.area)} color={areaColor(d.life, x.area)}
      onTick={() => tick(x)} onOpen={() => editOf(x)} onDate={() => editOf(x)} onNora={() => toggleNora(x)} onDelete={() => remove(x)} say={say}
      drag={b && x.status !== 'done' ? {
        onLayout: (y, h) => rowBox.current.set(x.id, { b, y, h }),
        onLift: () => { haptic.medium(); onMove(x.id, 0); },
        onMove: (dy) => onMove(x.id, dy),
        onDrop: (dy) => onDrop(x, dy),
      } : undefined} />
  );
  const noDate = shownNoDate;
  const nothing = !buckets.today.length && !buckets.tomorrow.length && !buckets.later.length && !buckets.none.length;

  return (
    <>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
        contentContainerStyle={[st.content, { paddingTop: insets.top + 8, paddingBottom: dockClear(insets.bottom) + 24 }]}
        refreshControl={<RefreshControl refreshing={d.refreshing} onRefresh={() => void d.load(false)} tintColor={C.muted} />}>
        <Header h={d.home} tags={d.tags} />

        <View>
          <View style={st.headRow}>
            <Text accessibilityRole="header" style={t.heading}>Nora&apos;s tasks</Text>
            <Pressable accessibilityRole="button" onPress={onNora} hitSlop={8}><Text style={st.headAct}>Show all</Text></Pressable>
          </View>
          <NoraCards items={noraItems(d)} onOpen={onNora} />
        </View>

        <View>
          <View style={st.headRow}>
            <Text accessibilityRole="header" style={t.heading}>My tasks</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={`List: ${listLabel}`} onPress={() => setPicking((v) => !v)} hitSlop={8} style={st.picker}>
              <Text style={st.headAct}>{listLabel}</Text>
              <View style={{ transform: [{ rotate: picking ? '-90deg' : '90deg' }] }}><Chevron color={C.textSoft} /></View>
            </Pressable>
          </View>
          {picking ? (
            <Animated.View entering={FadeIn.duration(140)} style={st.pickChips}>
              <Chip text="All lists" on={list == null} color={C.text} onPress={() => { setList(null); setPicking(false); }} />
              {d.areas.map((a) => <Chip key={a.slug} text={a.name} on={list === a.slug} color={areaColor(d.life, a.slug)} onPress={() => { setList(a.slug); setPicking(false); }} />)}
              <Chip text="No area" on={list === 'none'} color={C.text} onPress={() => { setList('none'); setPicking(false); }} />
            </Animated.View>
          ) : null}

          {!d.today && !d.error ? (
            <View style={st.group}>{[0, 1, 2].map((i) => <View key={i} style={st.skel} />)}</View>
          ) : !d.today ? (
            <View style={[st.group, { padding: 16, gap: 8 }]}>
              <Text style={t.strong}>Tasks didn’t load</Text><Text style={t.small}>{d.error}</Text>
              <Pressable accessibilityRole="button" onPress={() => void d.load(false)}><Text style={[t.label, { color: C.text }]}>Try again</Text></Pressable>
            </View>
          ) : (
            <Animated.View layout={LinearTransition.duration(220)} style={st.group}>
              <Pressable accessibilityRole="button" onPress={() => setSheet({ edit: null })} style={({ pressed }) => [st.add, pressed && { backgroundColor: SURF.pressed }]}>
                <Svg width={20} height={20} viewBox="0 0 24 24"><Path d="M12 5v14M5 12h14" stroke={C.muted} strokeWidth={2} strokeLinecap="round" /></Svg>
                <Text style={st.addText}>Add a task</Text>
              </Pressable>
              {nothing ? (
                <View style={st.empty}><Text style={t.strong}>Nothing open</Text><Text style={t.small}>Tasks you add here show on Today on their due day.</Text></View>
              ) : null}
              {buckets.today.length ? <Bucket label="Today" onY={(y) => bucketY.current.set('today', y)}>{buckets.today.map((x, i) => row(x, i === 0, x.due !== today, 'today'))}</Bucket> : null}
              {buckets.tomorrow.length ? <Bucket label="Tomorrow" onY={(y) => bucketY.current.set('tomorrow', y)}>{buckets.tomorrow.map((x, i) => row(x, i === 0, false, 'tomorrow'))}</Bucket> : null}
              {buckets.later.length ? <Bucket label="Later" onY={(y) => bucketY.current.set('later', y)}>{buckets.later.map((x, i) => row(x, i === 0, true, 'later'))}</Bucket> : null}
              {buckets.none.length ? (
                <Bucket label="No date" onY={(y) => bucketY.current.set('none', y)}>
                  {noDate.map((x, i) => row(x, i === 0, false, 'none'))}
                  {buckets.none.length > SHOWN_NO_DATE ? (
                    <Pressable accessibilityRole="button" onPress={() => setAllNoDate((v) => !v)} style={st.more}>
                      <Text style={st.moreText}>{allNoDate ? 'Show fewer' : `${buckets.none.length - SHOWN_NO_DATE} more with no date`}</Text>
                      <View style={{ transform: [{ rotate: allNoDate ? '-90deg' : '90deg' }] }}><Chevron /></View>
                    </Pressable>
                  ) : null}
                </Bucket>
              ) : null}
              {buckets.done.length ? (
                <>
                  <Pressable accessibilityRole="button" onPress={() => setShowDone((v) => !v)} style={[st.more, st.rule]}>
                    <Text style={st.moreText}>{`Completed today (${buckets.done.length})`}</Text>
                    <View style={{ transform: [{ rotate: showDone ? '-90deg' : '90deg' }] }}><Chevron /></View>
                  </Pressable>
                  {showDone ? buckets.done.map((x, i) => row(x, i === 0, false)) : null}
                </>
              ) : null}
              {drop != null ? <View pointerEvents="none" style={[st.dropLine, { top: drop - 1 }]} /> : null}
            </Animated.View>
          )}
        </View>
      </ScrollView>
      <CreateSheet open={!!sheet} initial={sheet?.edit ?? null} areas={d.areas} life={d.life} onClose={() => setSheet(null)}
        onSave={async (draft) => {
          if (sheet?.edit) await d.edit(sheet.edit.id, draft);
          else { await d.add(draft); say(draft.nora ? 'Task added. Nora has it.' : 'Task added'); }
        }}
        onDelete={sheet?.edit ? () => { const id = sheet.edit!.id; setSheet(null); const x = d.today?.tasks.find((y) => y.id === id); if (x) remove(x); } : undefined} />
    </>
  );
}

type BucketKey = 'today' | 'tomorrow' | 'later' | 'none';
const BUCKETS: BucketKey[] = ['today', 'tomorrow', 'later', 'none'];

function Bucket({ label, children, onY }: { label: string; children: ReactNode; onY?: (y: number) => void }) {
  return (
    <View onLayout={(e) => onY?.(e.nativeEvent.layout.y)}>
      <Text style={st.bucket}>{label}</Text>
      {children}
    </View>
  );
}

// ── a task row: swipe left for Date, Nora, Delete; what Nora is doing on it underneath ─────────────────────────────
type Drag = { onLayout: (y: number, h: number) => void; onLift: () => void; onMove: (dy: number) => void; onDrop: (dy: number) => void };
function TaskRow({ x, first, d, showDue, areaName, color, onTick, onOpen, onDate, onNora, onDelete, say, drag }: {
  x: Task; first: boolean; d: HomeData; showDue: boolean; areaName: string | null; color: string;
  onTick: () => void; onOpen: () => void; onDate: () => void; onNora: () => void; onDelete: () => void; say: Say; drag?: Drag;
}) {
  const ref = useRef<SwipeableMethods>(null);
  // hold 350 ms: the row lifts and follows the finger; let go and it lands where the line shows
  const ty = useSharedValue(0), lift = useSharedValue(0);
  const [lifted, setLifted] = useState(false);
  const pan = usePanGesture({
    enabled: !!drag,
    activateAfterLongPress: 350,
    runOnJS: true,
    onActivate: () => { ref.current?.close(); setLifted(true); lift.set(withSpring(1)); drag?.onLift(); },
    onUpdate: (e) => { ty.set(e.translationY); drag?.onMove(e.translationY); },
    onDeactivate: (e) => { drag?.onDrop(e.translationY); },
    onFinalize: () => { ty.set(withSpring(0, { damping: 18, stiffness: 220 })); lift.set(withSpring(0)); setLifted(false); },
  });
  const liftStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: ty.value }, { scale: 1 + 0.03 * lift.value }],
    zIndex: lift.value > 0.01 ? 10 : 0,
  }));
  const tag = d.tags[x.id];
  const done = x.status === 'done';
  const act = (f: () => void) => () => { ref.current?.close(); f(); };
  return (
    <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(160)} layout={LinearTransition.duration(220)}
      onLayout={(e) => drag?.onLayout(e.nativeEvent.layout.y, e.nativeEvent.layout.height)} style={[liftStyle, lifted && st.lifted]}>
      <GestureDetector gesture={pan}>
      <Swipeable ref={ref} friction={1.6} rightThreshold={48} overshootRight={false}
        renderRightActions={() => (
          <View style={st.actions}>
            <Action label="Date" color="rgba(255,255,255,0.12)" icon="M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" onPress={act(onDate)} />
            <Action label={tag ? 'Untag' : 'Nora'} color={tint(NORA, 0.2)} icon="M12 3l1.9 5.6L19.5 10.5l-5.6 1.9L12 18l-1.9-5.6L4.5 10.5l5.6-1.9z" onPress={act(onNora)} />
            <Action label="Delete" color={tint(C.danger, 0.2)} icon="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" onPress={act(onDelete)} />
          </View>
        )}>
        <Pressable accessibilityRole="button" accessibilityHint="Edit the task" onPress={onOpen} style={[st.task, !first && st.rule]}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={2} style={[st.taskTitle, done && st.doneTitle]}>{x.title}</Text>
            {areaName || showDue || tag ? (
              <View style={st.meta}>
                {areaName ? <View style={st.metaItem}><View style={[st.dot6, { backgroundColor: color }]} /><Text style={st.metaText}>{areaName}</Text></View> : null}
                {showDue && x.due ? <Text style={[st.metaText, { color: C.faint }, t.num]}>{dueLabel(x.due)}</Text> : null}
                {tag ? <View style={st.metaItem}><View style={[st.dot6, { backgroundColor: NORA }]} /><Text style={[st.metaText, { color: NORA_TEXT }]}>Nora</Text></View> : null}
              </View>
            ) : null}
            {tag && !done ? <NoraBlock tag={tag} d={d} title={x.title} say={say} onTakeBack={onNora} /> : null}
          </View>
          <Tick done={done} color={color} size={26} label={`${x.title}${done ? ', done' : ''}`} onPress={onTick} />
        </Pressable>
      </Swipeable>
      </GestureDetector>
    </Animated.View>
  );
}

function Action({ label, color, icon, onPress }: { label: string; color: string; icon: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={[st.action, { backgroundColor: color }]}>
      <Svg width={20} height={20} viewBox="0 0 24 24"><Path d={icon} stroke={C.text} strokeWidth={1.8} fill="none" strokeLinecap="round" strokeLinejoin="round" /></Svg>
      <Text style={st.actionText}>{label}</Text>
    </Pressable>
  );
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function dueLabel(due: string) {
  const today = istDay();
  if (due < today) { const n = Math.round((Date.parse(today) - Date.parse(due)) / 86_400_000); return n === 1 ? 'Yesterday' : `${n} days late`; }
  const dt = new Date(`${due}T12:00:00Z`);
  return `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dt.getUTCDay()]} ${dt.getUTCDate()} ${MONTHS[dt.getUTCMonth()]}`;
}

function NoraBlock({ tag, d, title, say, onTakeBack }: { tag: Tag; d: HomeData; title: string; say: Say; onTakeBack: () => void }) {
  const [reply, setReply] = useState<string | null>(null);
  const send = (text: string) => { if (!text.trim()) return; setReply(null); d.answer(tag.taskId, text.trim()).then(() => say('Sent to Nora'), (e) => say(msg(e))); };
  const head = tag.state === 'queued' ? 'starts after her current task' : tag.state === 'working' ? 'is on it' : tag.state === 'ask' ? 'needs one answer'
    : tag.state === 'error' ? 'could not finish' : dueAgo(tag.at);
  return (
    <View style={st.nb}>
      <View style={st.presence}>
        <Text style={st.nbName}>Nora</Text>
        <Text style={[st.nbHead, tag.state === 'error' && { color: C.danger }]}>{head}</Text>
        {tag.state === 'working' ? <Dots color={NORA} /> : null}
      </View>
      {tag.state === 'ask' && tag.question ? <Text style={st.nbBody}>{tag.question}</Text> : null}
      {(tag.state === 'found' || tag.state === 'error') && tag.text ? <Text style={st.nbBody}>{tag.text}</Text> : null}
      {tag.state === 'ask' ? (
        reply == null ? (
          <View style={st.nbActs}>
            {tag.options.map((o) => <Chip key={o} text={o} on={false} color={NORA} onPress={() => send(o)} />)}
            <Chip text="Reply" on={false} color={NORA} onPress={() => setReply('')} />
          </View>
        ) : (
          <View style={st.replyRow}>
            <TextInput autoFocus value={reply} onChangeText={setReply} placeholder="Your answer" placeholderTextColor={C.faint} style={st.replyInput}
              returnKeyType="send" onSubmitEditing={() => send(reply)} />
            <Pressable accessibilityRole="button" onPress={() => send(reply)} disabled={!reply.trim()} hitSlop={6}><Text style={[st.headAct, !reply.trim() && { opacity: 0.35 }]}>Send</Text></Pressable>
          </View>
        )
      ) : null}
      {tag.state === 'error' ? (
        <View style={st.nbActs}>
          <Chip text="Try again" on={false} color={NORA} onPress={() => { d.untag(tag.taskId).then(() => d.tag(tag.taskId, title)).then(() => say('Nora has it again'), (e) => say(msg(e))); }} />
          <Chip text="Take it back" on={false} color={C.text} onPress={onTakeBack} />
        </View>
      ) : null}
    </View>
  );
}
function dueAgo(at: string) {
  const day = istDay(Date.parse(at)), today = istDay();
  return day === today ? 'Today' : day === addDays(today, -1) ? 'Yesterday' : day;
}

// ── Nora's page ──────────────────────────────────────────────────────────────────────────────────────────────────
function NoraPage({ d, say, onBack }: { d: HomeData; say: Say; onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const h = d.home;
  const tasks = d.today?.tasks ?? [];
  const title = (id: string) => tasks.find((x) => x.id === id)?.title ?? id;
  const tags = Object.values(d.tags);
  const [answered, setAnswered] = useState<Record<string, string>>({});
  const items = h ? [...h.items, ...h.older.filter((x) => !h.items.some((y) => y.id === x.id))] : [];
  const did = items.filter((x) => x.kind === 'did');
  const noticed = items.filter((x) => x.kind !== 'did' && x.kind !== 'ask' && x.status !== 'expired');
  const answer = (x: FeedItem, choice: 'yes' | 'no') => {
    setAnswered((a) => ({ ...a, [x.id]: choice === 'yes' ? 'Done' : 'Not now' }));
    if (!DEMO) noraApi.answerItem(x.id, { choice }).catch((e) => { setAnswered((a) => { const n = { ...a }; delete n[x.id]; return n; }); say(msg(e)); });
  };
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[st.content, { paddingTop: insets.top + 8, paddingBottom: dockClear(insets.bottom) + 24, gap: 28 }]}
      refreshControl={<RefreshControl refreshing={d.refreshing} onRefresh={() => void d.load(false)} tintColor={C.muted} />}>
      <Header h={h} tags={d.tags} onBack={onBack} />

      {h?.asks.length ? (
        <PageSection title="Waiting on you">
          {h.asks.map((x, i) => (
            <View key={x.id} style={[st.pageRow, i > 0 && st.rule, { flexDirection: 'column', alignItems: 'stretch', gap: 8 }]}>
              <Text style={st.taskTitle}>{x.title}</Text>
              {x.text ? <Text style={t.small} numberOfLines={4}>{x.text}</Text> : null}
              {answered[x.id] ? <Text style={t.caption}>{answered[x.id]}</Text> : (
                <View style={st.nbActs}>
                  <Chip text={x.ask?.yes ?? 'Yes'} on={false} color={NORA} onPress={() => answer(x, 'yes')} />
                  <Chip text={x.ask?.no ?? 'Not now'} on={false} color={C.text} onPress={() => answer(x, 'no')} />
                  <Chip text="Answer in chat" on={false} color={C.text} onPress={() => noraUi.openChat()} />
                </View>
              )}
            </View>
          ))}
        </PageSection>
      ) : null}

      <PageSection title="Working on">
        {h?.busy || tags.some((g) => g.state === 'working' || g.state === 'ask') ? (
          <>
            {h?.busy ? <PageRow first lead={<Dots color={NORA} />} title={h.busy.title} sub={`Until ${new Date(Date.parse(h.busy.until) + 5.5 * 3600_000).toISOString().slice(11, 16)}`} /> : null}
            {tags.filter((g) => g.state === 'working' || g.state === 'ask').map((g, i) => (
              <PageRow key={g.taskId} first={!h?.busy && i === 0} lead={g.state === 'ask' ? <View style={[st.dot8, { backgroundColor: NORA }]} /> : <Dots color={NORA} />}
                title={title(g.taskId)} sub={g.state === 'ask' ? g.question ?? 'Needs one answer' : 'On it'} />
            ))}
          </>
        ) : <EmptyCard text="Not working on anything right now." />}
      </PageSection>

      <PageSection title="Up next">
        {(h?.upcoming?.length || h?.calls.morning || h?.calls.night || tags.some((g) => g.state === 'queued')) ? (
          <>
            {(h?.upcoming ?? []).map((u, i) => <PageRow key={u.id} first={i === 0} lead={<ClockIcon />} title={u.title.replace(/^\d{1,2}:\d{2}\s*:?\s*/, '')} sub={u.time} />)}
            {h?.calls.morning ? <PageRow first={!h.upcoming?.length} lead={<PhoneIcon />} title="Morning call with you" sub={h.calls.morning} /> : null}
            {h?.calls.night ? <PageRow first={!h.upcoming?.length && !h.calls.morning} lead={<PhoneIcon />} title="Night call with you" sub={h.calls.night} /> : null}
            {tags.filter((g) => g.state === 'queued').map((g) => <PageRow key={g.taskId} first={false} lead={<View style={st.ring12} />} title={title(g.taskId)} sub="Her task, not started" />)}
          </>
        ) : <EmptyCard text="Nothing lined up." />}
      </PageSection>

      {tags.some((g) => g.state === 'found' || g.state === 'error') ? (
        <PageSection title="Found for you">
          {tags.filter((g) => g.state === 'found' || g.state === 'error').map((g, i) => (
            <View key={g.taskId} style={[st.pageRow, i > 0 && st.rule, { flexDirection: 'column', alignItems: 'stretch', gap: 6 }]}>
              <Text style={st.taskTitle}>{title(g.taskId)}</Text>
              <Text style={[st.nbBody, g.state === 'error' && { color: C.danger }]}>{g.text ?? (g.state === 'error' ? 'Could not finish.' : 'Done.')}</Text>
            </View>
          ))}
        </PageSection>
      ) : null}

      {did.length ? (
        <PageSection title="Done for you">
          {did.map((x, i) => <PageRow key={x.id} first={i === 0} lead={<CheckIcon />} title={x.title} sub={x.time} />)}
        </PageSection>
      ) : null}

      <PageSection title="Noticed">
        {noticed.length ? noticed.map((x, i) => <PageRow key={x.id} first={i === 0} title={x.title} sub={x.text ?? x.time} />)
          : <EmptyCard text="Nothing noticed yet today." caption="When she spots something in your day it shows here with what she suggests." />}
      </PageSection>
    </ScrollView>
  );
}

function PageSection({ title, children }: { title: string; children: ReactNode }) {
  return <View style={{ gap: 10 }}><Text accessibilityRole="header" style={t.heading}>{title}</Text><View style={st.group}>{children}</View></View>;
}
function PageRow({ lead, title, sub, first }: { lead?: ReactNode; title: string; sub?: string | null; first: boolean }) {
  return (
    <View style={[st.pageRow, !first && st.rule]}>
      {lead ? <View style={st.leadCol}>{lead}</View> : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={st.taskTitle} numberOfLines={2}>{title}</Text>
        {sub ? <Text style={[st.metaText, { color: C.faint }, t.num]} numberOfLines={2}>{sub}</Text> : null}
      </View>
    </View>
  );
}
function EmptyCard({ text, caption }: { text: string; caption?: string }) {
  return <View style={{ padding: 16, gap: 4 }}><Text style={t.small}>{text}</Text>{caption ? <Text style={t.caption}>{caption}</Text> : null}</View>;
}
const ClockIcon = () => <Svg width={18} height={18} viewBox="0 0 24 24"><Circle cx={12} cy={12} r={9} stroke={C.muted} strokeWidth={1.8} fill="none" /><Path d="M12 7v5l3 2" stroke={C.muted} strokeWidth={1.8} fill="none" strokeLinecap="round" /></Svg>;
const PhoneIcon = () => <Svg width={18} height={18} viewBox="0 0 24 24"><Path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" stroke={C.muted} strokeWidth={1.8} fill="none" strokeLinejoin="round" /></Svg>;
const CheckIcon = () => <Svg width={18} height={18} viewBox="0 0 24 24"><Circle cx={12} cy={12} r={9} fill="rgba(255,255,255,0.14)" /><Path d="M8 12.5l2.5 2.5L16 9.5" stroke={C.muted} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" /></Svg>;

const st = StyleSheet.create({
  content: { paddingHorizontal: 16, gap: 24 },
  toast: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  ball: { width: 36, height: 36, borderRadius: 18, overflow: 'hidden' },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: SURF.card, alignItems: 'center', justifyContent: 'center' },
  presence: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 28 },
  headAct: { fontFamily: F.medium, fontSize: 15, lineHeight: 20, color: C.textSoft },
  picker: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pickChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  cardsWrap: { marginHorizontal: -16, marginTop: 10 },
  cards: { paddingHorizontal: 16, gap: 10 },
  card: { height: 104, borderRadius: 16, padding: 12, backgroundColor: SURF.card, gap: 8 },
  cardTitle: { fontFamily: F.medium, fontSize: 14, lineHeight: 19, color: C.text },
  emptyCard: { marginTop: 10, borderRadius: 16, padding: 14, backgroundColor: 'rgba(255,255,255,0.04)', gap: 2 },
  lead: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 16 },
  leadText: { fontFamily: F.medium, fontSize: 12, lineHeight: 16, color: C.muted },
  dot8: { width: 8, height: 8, borderRadius: 4 },
  dot6: { width: 6, height: 6, borderRadius: 3 },
  ring12: { width: 12, height: 12, borderRadius: 6, borderWidth: 1.5, borderColor: C.muted },
  group: { marginTop: 10, borderRadius: 20, backgroundColor: SURF.card, overflow: 'hidden' },
  skel: { height: 56, margin: 8, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.05)' },
  add: { height: 52, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  addText: { fontFamily: F.regular, fontSize: 16, lineHeight: 21, color: C.faint },
  empty: { paddingHorizontal: 16, paddingBottom: 16, gap: 4 },
  bucket: { fontFamily: F.medium, fontSize: 13, lineHeight: 18, color: C.faint, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 2 },
  task: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12, paddingHorizontal: 16, backgroundColor: '#1A1C22' },
  rule: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.08)' },
  taskTitle: { fontFamily: F.medium, fontSize: 16, lineHeight: 21, color: C.text },
  doneTitle: { color: C.faint, textDecorationLine: 'line-through' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4, flexWrap: 'wrap' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { fontFamily: F.regular, fontSize: 13, lineHeight: 18, color: C.muted },
  more: { height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  moreText: { fontFamily: F.medium, fontSize: 15, lineHeight: 20, color: C.muted },
  actions: { flexDirection: 'row' },
  action: { width: 72, alignItems: 'center', justifyContent: 'center', gap: 4 },
  actionText: { fontFamily: F.medium, fontSize: 12, lineHeight: 16, color: C.text },
  nb: { marginTop: 10, borderLeftWidth: 2, borderColor: tint(NORA, 0.55), paddingLeft: 12, gap: 3 },
  nbName: { fontFamily: F.semibold, fontSize: 12, lineHeight: 16, color: NORA_TEXT },
  nbHead: { fontFamily: F.regular, fontSize: 12, lineHeight: 16, color: C.muted },
  nbBody: { fontFamily: F.regular, fontSize: 14, lineHeight: 20, color: C.textSoft },
  nbActs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  replyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.06)', paddingHorizontal: 12 },
  replyInput: { flex: 1, fontFamily: F.regular, fontSize: 15, lineHeight: 20, color: C.text, paddingVertical: 8 },
  dropLine: { position: 'absolute', left: 16, right: 16, height: 2, borderRadius: 1, backgroundColor: NORA },
  lifted: { boxShadow: '0 14px 30px rgba(0,0,0,0.5)', borderRadius: 12, overflow: 'hidden' },
  pageRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16, minHeight: 56 },
  leadCol: { width: 24, alignItems: 'center' },
});
