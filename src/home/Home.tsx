import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { GestureDetector, ScrollView, usePanGesture } from 'react-native-gesture-handler';
import Swipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { FadeIn, FadeOut, LinearTransition, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { haptic, SURF, t, tint } from '@/aspects/kit/tokens';
import { Chip, Toast } from '@/capture/parts';
import { ASPECT_KEYS, ASPECT_NAME, aspectOfArea } from '@/lib/aspects';
import { DEMO } from '@/lib/demo';
import { LineEntry } from '@/line/HomeEntry';
import { markSeen, nora as noraApi, type FeedItem, type NoraHome } from '@/lib/nora';
import type { Task } from '@/lib/today';
import { Ball, useTurn } from '@/nora/Sphere';
import { Composer } from '@/nora/parts';
import { noraUi, useNora } from '@/nora/state';
import { useDictate } from '@/nora/useDictate';
import { ASPECT_COLOR, C, F, type AspectKey } from '@/theme';
import { Chevron, Dots, NORA, NORA_TEXT, Tick } from '@/today2/parts';
import { openTask, type TaskFocus } from '@/work/bus';
import { areaColor, CreateSheet } from './Create';
import { addDays, istDay, useHomeData, type HomeData, type Tag } from './data';

// Home (the dock's Home orb): Nora at the top with what she is on, her three tasks, then his own task list in the
// manner of Google Tasks: add, tick, Life aspect tags, Tag Nora, and what she found under each task. Show all opens her
// page. A tap or a hold (held without moving; held and dragged reorders) opens the task's full view (openTask), and so
// does a card of Nora's for a task she is tagged on.

const dockClear = (bottom: number) => Math.max(bottom, 12) + 12 + 64 + 40;
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
  // a tapped push about one of her items opens her page with that item first (a later tap, by its seq, again)
  const focus = useNora().homeFocus;
  const [page, setPage] = useState<'home' | 'nora'>(focus ? 'nora' : 'home');
  const [focusSeen, setFocusSeen] = useState(focus?.seq ?? 0);
  const [focusItem, setFocusItem] = useState<string | null>(focus?.item ?? null);
  if (focus && focus.seq !== focusSeen) { setFocusSeen(focus.seq); setPage('nora'); setFocusItem(focus.item); }
  // What Home shows counts as seen, so it stops climbing toward an alarm or a call: the questions in her cards on
  // Home (the first three cards), everything on her page.
  const h = d.home;
  useEffect(() => {
    if (!open || !h || DEMO) return;
    markSeen(page === 'nora' ? [...h.asks, ...h.items, ...h.older] : h.asks.slice(0, 3));
  }, [open, page, h]);
  return (
    <View style={{ flex: 1 }}>
      {page === 'home'
        ? <HomePage d={d} say={say} hide={hide} onNora={() => setPage('nora')} />
        : <NoraPage d={d} say={say} focus={focusItem} onBack={() => { setPage('home'); setFocusItem(null); }} />}
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
type NoraItem = { id: string; lead: 'working' | 'time' | 'queued' | 'needs' | 'error'; time?: string; title: string; /** her card for one of his tasks */ task?: Task };
function noraItems(d: HomeData): NoraItem[] {
  const out: NoraItem[] = [];
  const h = d.home, tasks = d.today?.tasks ?? [];
  const title = (id: string) => tasks.find((x) => x.id === id)?.title ?? id;
  const task = (id: string): Task => tasks.find((x) => x.id === id) ?? { id, title: id, status: 'todo', area: null, due: null, scheduled: null, owner: 'me', completedAt: null };
  for (const a of h?.asks ?? []) out.push({ id: `ask:${a.id}`, lead: 'needs', title: a.title });
  if (h?.busy) out.push({ id: 'busy', lead: 'working', title: h.busy.title });
  const tags = Object.values(d.tags);
  for (const g of tags.filter((x) => x.state === 'ask')) out.push({ id: `tag:${g.taskId}`, lead: 'needs', title: title(g.taskId), task: task(g.taskId) });
  for (const g of tags.filter((x) => x.state === 'working')) out.push({ id: `tag:${g.taskId}`, lead: 'working', title: title(g.taskId), task: task(g.taskId) });
  for (const g of tags.filter((x) => x.state === 'error')) out.push({ id: `tag:${g.taskId}`, lead: 'error', title: title(g.taskId), task: task(g.taskId) });
  for (const u of h?.upcoming ?? []) out.push({ id: `up:${u.id}`, lead: 'time', time: u.time, title: u.title.replace(/^\d{1,2}:\d{2}\s*:?\s*/, '') });
  for (const g of tags.filter((x) => x.state === 'queued')) out.push({ id: `tag:${g.taskId}`, lead: 'queued', title: title(g.taskId), task: task(g.taskId) });
  for (const x of tasks.filter((x) => x.owner === 'nora' && x.status !== 'done' && x.status !== 'dropped')) out.push({ id: `own:${x.id}`, lead: 'queued', title: x.title, task: x });
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
        <Pressable key={it.id} accessibilityRole="button" accessibilityHint={it.task ? 'Opens the task and what Nora is doing with it' : 'Opens her page'}
          onPress={() => (it.task ? openTask(it.task) : onOpen())} style={({ pressed }) => [st.card, { width: w }, pressed && { backgroundColor: SURF.pressed }]}>
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
  // Today's "N more on Home" opens Home on that aspect's list (a new ask, by its seq, wins over his last pick)
  const asked = useNora().homeList;
  const [askSeen, setAskSeen] = useState(asked?.seq ?? 0);
  const [list, setList] = useState<AspectKey | 'none' | null>(asked?.list ?? null); // a Life aspect, 'none', or null for all
  const [picking, setPicking] = useState(false);
  if (asked && asked.seq !== askSeen) { setAskSeen(asked.seq); setList(asked.list); setPicking(false); }
  const [adding, setAdding] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [holding, setHolding] = useState<Set<string>>(new Set());
  const today = istDay(), tomorrow = addDays(today, 1);
  useEffect(() => noraUi.onCreate(() => setAdding(true)), []);

  const aspectOf = useCallback((area: string | null) => aspectOfArea(d.life, area), [d.life]);
  const mine = useMemo(() => (d.today?.tasks ?? []).filter((x) => !x.parent && (x.owner == null || x.owner === 'me')
    && (list == null || (list === 'none' ? !aspectOf(x.area) : aspectOf(x.area) === list))), [d.today, list, aspectOf]);
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
  const seed = (x: Task) => ({ id: x.id, title: x.title, status: x.status, due: x.due, area: x.area, owner: x.owner, repeat: x.repeat ?? null });
  const editOf = (x: Task, focus: TaskFocus = 'view') => {
    if (justDragged.current) return; // the finger lifting off a drag is not a tap
    openTask(seed(x), focus);
  };

  // ── drag to reorder: hold a row, drag it within or across buckets; a drop in another bucket takes that bucket's date ──
  const bucketY = useRef(new Map<BucketKey, number>());
  // rows are kept by their row key: a task just added keeps its first (temporary) id as its key once the server names it
  const rowBox = useRef(new Map<string, { b: BucketKey; y: number; h: number }>());
  const keyOf = (id: string) => d.alias[id] ?? id;
  const [drop, setDrop] = useState<number | null>(null);
  const lists: Record<BucketKey, Task[]> = { today: buckets.today, tomorrow: buckets.tomorrow, later: buckets.later, none: buckets.none };
  const top = (id: string) => { const r = rowBox.current.get(keyOf(id)); return r ? { ...r, top: (bucketY.current.get(r.b) ?? 0) + r.y } : null; };
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
    const me = rowBox.current.get(keyOf(x.id));
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

  // a row names the Life aspect its area leads with; an area with none mapped shows its own name
  const areaName = (slug: string | null) => {
    const a = aspectOf(slug);
    return a ? ASPECT_NAME[a] : slug ? d.areas.find((x) => x.slug === slug)?.name ?? slug : null;
  };
  const listLabel = list == null ? 'All' : list === 'none' ? 'No aspect' : ASPECT_NAME[list];
  const freshKey = d.fresh ? keyOf(d.fresh) : null;
  const row = (x: Task, first: boolean, showDue: boolean, b?: BucketKey) => {
    const k = keyOf(x.id);
    const saving = x.id.startsWith('tmp'); // added a moment ago, the server hasn't named it yet
    const idle = () => {};
    return (
      <TaskRow key={k} x={x} first={first} d={d} showDue={showDue} areaName={areaName(x.area)} color={areaColor(d.life, x.area)} fresh={k === freshKey}
        onTick={saving ? idle : () => tick(x)} onOpen={saving ? idle : () => editOf(x)} onDate={saving ? idle : () => editOf(x, 'date')}
        onHold={saving ? undefined : () => openTask(seed(x))}
        onNora={saving ? idle : () => toggleNora(x)} onDelete={saving ? idle : () => remove(x)} say={say}
        onPlace={b && x.status !== 'done' ? (y, h) => rowBox.current.set(k, { b, y, h }) : undefined}
        drag={b && x.status !== 'done' && !saving ? {
          onLift: () => { haptic.medium(); onMove(x.id, 0); },
          onMove: (dy) => onMove(x.id, dy),
          onDrop: (dy) => onDrop(x, dy),
        } : undefined} />
    );
  };
  const nothing = !buckets.today.length && !buckets.tomorrow.length && !buckets.later.length && !buckets.none.length;
  // what he must not forget, said once over the list: late, due today, and what Nora is waiting on him for
  const late = buckets.today.filter((x) => x.status !== 'done' && !!x.due && x.due < today).length;
  const dueToday = buckets.today.filter((x) => x.status !== 'done' && x.due === today).length;
  const waiting = Object.values(d.tags).filter((g) => g.state === 'ask').length + (d.home?.asks.length ?? 0);

  // ── a task just added: scroll it into view and light it up; the light fades once the sheet is closed ──
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  const scrollY = useRef(0), viewH = useRef(0), listY = useRef(0), groupY = useRef(0);
  useEffect(() => {
    if (!freshKey) return;
    let tries = 0;
    const id = setInterval(() => {
      const r = rowBox.current.get(freshKey);
      if (!r && ++tries < 15) return;
      clearInterval(id);
      if (!r) return;
      const y = listY.current + groupY.current + (bucketY.current.get(r.b) ?? 0) + r.y;
      const seenTop = scrollY.current + insets.top + 56, seenBottom = scrollY.current + viewH.current - dockClear(insets.bottom);
      if (y < seenTop || y + r.h > seenBottom) scroller.current?.scrollTo({ y: Math.max(0, y - insets.top - 120), animated: true });
    }, 80);
    return () => clearInterval(id);
  }, [freshKey, insets.top, insets.bottom]);
  const { clearFresh } = d;
  useEffect(() => {
    if (!freshKey || adding) return;
    const id = setTimeout(clearFresh, 1600);
    return () => clearTimeout(id);
  }, [freshKey, adding, clearFresh]);

  return (
    <>
      <ScrollView ref={scroller} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
        onScroll={(e) => { scrollY.current = e.nativeEvent.contentOffset.y; }} scrollEventThrottle={32} onLayout={(e) => { viewH.current = e.nativeEvent.layout.height; }}
        contentContainerStyle={[st.content, { paddingTop: insets.top + 8, paddingBottom: dockClear(insets.bottom) + 24 }]}
        refreshControl={<RefreshControl refreshing={d.refreshing} onRefresh={() => void d.load(false)} tintColor={C.muted} />}>
        <Header h={d.home} tags={d.tags} />
        {/* Nora's phone line: the call on now and the calls waiting on him (src/line) */}
        <LineEntry />

        <View>
          <View style={st.headRow}>
            <Text accessibilityRole="header" style={t.heading}>Nora&apos;s tasks</Text>
            <Pressable accessibilityRole="button" onPress={onNora} hitSlop={8}><Text style={st.headAct}>Show all</Text></Pressable>
          </View>
          <NoraCards items={noraItems(d)} onOpen={onNora} />
        </View>

        <View onLayout={(e) => { listY.current = e.nativeEvent.layout.y; }}>
          <View style={st.headRow}>
            <Text accessibilityRole="header" style={t.heading}>My tasks</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={`List: ${listLabel}`} onPress={() => setPicking((v) => !v)} hitSlop={8} style={st.picker}>
              <Text style={st.headAct}>{listLabel}</Text>
              <View style={{ transform: [{ rotate: picking ? '-90deg' : '90deg' }] }}><Chevron color={C.textSoft} /></View>
            </Pressable>
          </View>
          {picking ? (
            <Animated.View entering={FadeIn.duration(140)} style={st.pickChips}>
              <Chip text="All" on={list == null} color={C.text} onPress={() => { setList(null); setPicking(false); }} />
              {ASPECT_KEYS.map((a) => <Chip key={a} text={ASPECT_NAME[a]} on={list === a} color={ASPECT_COLOR[a]} onPress={() => { setList(a); setPicking(false); }} />)}
              <Chip text="No aspect" on={list === 'none'} color={C.text} onPress={() => { setList('none'); setPicking(false); }} />
            </Animated.View>
          ) : null}
          {d.today && (late || dueToday || waiting) ? (
            <View style={st.owed} accessibilityRole="summary">
              {late ? <Text style={[st.owedText, { color: C.danger }]}>{`${late} late`}</Text> : null}
              {dueToday ? <Text style={st.owedText}>{`${dueToday} due today`}</Text> : null}
              {waiting ? (
                <Pressable accessibilityRole="button" accessibilityHint="Opens Nora's page" onPress={onNora} hitSlop={8} style={st.metaItem}>
                  <View style={[st.dot6, { backgroundColor: NORA }]} />
                  <Text style={[st.owedText, { color: NORA_TEXT }]}>{`${waiting} waiting on you`}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {!d.today && !d.error ? (
            <View style={st.group}>{[0, 1, 2].map((i) => <View key={i} style={st.skel} />)}</View>
          ) : !d.today ? (
            <View style={[st.group, { padding: 16, gap: 8 }]}>
              <Text style={t.strong}>Tasks didn’t load</Text><Text style={t.small}>{d.error}</Text>
              <Pressable accessibilityRole="button" onPress={() => void d.load(false)}><Text style={[t.label, { color: C.text }]}>Try again</Text></Pressable>
            </View>
          ) : (
            <Animated.View layout={LinearTransition.duration(220)} style={st.group} onLayout={(e) => { groupY.current = e.nativeEvent.layout.y; }}>
              <Pressable accessibilityRole="button" onPress={() => setAdding(true)} style={({ pressed }) => [st.add, pressed && { backgroundColor: SURF.pressed }]}>
                <Svg width={20} height={20} viewBox="0 0 24 24"><Path d="M12 5v14M5 12h14" stroke={C.muted} strokeWidth={2} strokeLinecap="round" /></Svg>
                <Text style={st.addText}>Add a task</Text>
              </Pressable>
              {nothing ? (
                <View style={st.empty}><Text style={t.strong}>Nothing open</Text><Text style={t.small}>Tasks you add here show on Today on their due day.</Text></View>
              ) : null}
              {buckets.today.length ? <Bucket label="Today" note={late ? `${late} late` : null} onY={(y) => bucketY.current.set('today', y)}>{buckets.today.map((x, i) => row(x, i === 0, x.due !== today, 'today'))}</Bucket> : null}
              {buckets.tomorrow.length ? <Bucket label="Tomorrow" onY={(y) => bucketY.current.set('tomorrow', y)}>{buckets.tomorrow.map((x, i) => row(x, i === 0, false, 'tomorrow'))}</Bucket> : null}
              {buckets.later.length ? <Bucket label="Later" onY={(y) => bucketY.current.set('later', y)}>{buckets.later.map((x, i) => row(x, i === 0, true, 'later'))}</Bucket> : null}
              {buckets.none.length ? (
                <Bucket label="No date" onY={(y) => bucketY.current.set('none', y)}>
                  {buckets.none.map((x, i) => row(x, i === 0, false, 'none'))}
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
      {/* new tasks; an existing one opens its full view (openTask), where it is edited */}
      <CreateSheet open={adding} life={d.life} onClose={() => setAdding(false)}
        onSave={async (draft) => { await d.add(draft); say(draft.nora ? 'Task added. Nora has it.' : 'Task added'); }} />
    </>
  );
}

type BucketKey = 'today' | 'tomorrow' | 'later' | 'none';
const BUCKETS: BucketKey[] = ['today', 'tomorrow', 'later', 'none'];

function Bucket({ label, note, children, onY }: { label: string; note?: string | null; children: ReactNode; onY?: (y: number) => void }) {
  return (
    <View onLayout={(e) => onY?.(e.nativeEvent.layout.y)}>
      <Text style={st.bucket}>{label}{note ? <Text style={{ color: C.danger }}>{`  ${note}`}</Text> : null}</Text>
      {children}
    </View>
  );
}

// ── a task row: swipe left for Date, Nora, Delete; what Nora is doing on it underneath ─────────────────────────────
type Drag = { onLift: () => void; onMove: (dy: number) => void; onDrop: (dy: number) => void };
function TaskRow({ x, first, d, showDue, areaName, color, fresh, onTick, onOpen, onDate, onNora, onDelete, say, onPlace, drag, onHold }: {
  x: Task; first: boolean; d: HomeData; showDue: boolean; areaName: string | null; color: string; fresh: boolean;
  onTick: () => void; onOpen: () => void; onDate: () => void; onNora: () => void; onDelete: () => void; say: Say;
  onPlace?: (y: number, h: number) => void; drag?: Drag;
  /** held: the task's full view. A row that drags opens it when let go where it was lifted. */ onHold?: () => void;
}) {
  const ref = useRef<SwipeableMethods>(null);
  // a task just added glows, then fades
  const glow = useSharedValue(fresh ? 1 : 0);
  useEffect(() => { glow.set(withTiming(fresh ? 1 : 0, { duration: fresh ? 160 : 900 })); }, [fresh, glow]);
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value }));
  // hold 350 ms: the row lifts and follows the finger; let go and it lands where the line shows
  const ty = useSharedValue(0), lift = useSharedValue(0);
  const [lifted, setLifted] = useState(false);
  const pan = usePanGesture({
    enabled: !!drag,
    activateAfterLongPress: 350,
    runOnJS: true,
    onActivate: () => { ref.current?.close(); setLifted(true); lift.set(withSpring(1)); drag?.onLift(); },
    onUpdate: (e) => { ty.set(e.translationY); drag?.onMove(e.translationY); },
    onDeactivate: (e) => { drag?.onDrop(e.translationY); if (Math.abs(e.translationY) < 8) onHold?.(); },
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
      onLayout={(e) => onPlace?.(e.nativeEvent.layout.y, e.nativeEvent.layout.height)} style={[liftStyle, lifted && st.lifted]}>
      <GestureDetector gesture={pan}>
      <Swipeable ref={ref} friction={1.6} rightThreshold={48} overshootRight={false}
        renderRightActions={() => (
          <View style={st.actions}>
            <Action label="Date" color="rgba(255,255,255,0.12)" icon="M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" onPress={act(onDate)} />
            <Action label={tag ? 'Untag' : 'Nora'} color={tint(NORA, 0.2)} icon="M12 3l1.9 5.6L19.5 10.5l-5.6 1.9L12 18l-1.9-5.6L4.5 10.5l5.6-1.9z" onPress={act(onNora)} />
            <Action label="Delete" color={tint(C.danger, 0.2)} icon="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" onPress={act(onDelete)} />
          </View>
        )}>
        <Pressable accessibilityRole="button" accessibilityHint="Opens the task" onPress={onOpen} onLongPress={drag ? undefined : onHold} delayLongPress={350}
          style={[st.task, !first && st.rule]}>
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, st.glow, glowStyle]} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={2} style={[st.taskTitle, done && st.doneTitle]}>{x.title}</Text>
            {areaName || showDue || tag ? (
              <View style={st.meta}>
                {areaName ? <View style={st.metaItem}><View style={[st.dot6, { backgroundColor: color }]} /><Text style={st.metaText}>{areaName}</Text></View> : null}
                {showDue && x.due ? <Text style={[st.metaText, { color: x.due < istDay() && !done ? C.danger : C.faint }, t.num]}>{dueLabel(x.due)}</Text> : null}
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
function NoraPage({ d, say, focus, onBack }: { d: HomeData; say: Say; focus: string | null; onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const h = d.home;
  const tasks = d.today?.tasks ?? [];
  const title = (id: string) => tasks.find((x) => x.id === id)?.title ?? id;
  // a task she is tagged on opens to that task: its details and what she did or will do with it
  const open = (id: string) => {
    const x = tasks.find((y) => y.id === id);
    openTask(x ? { id, title: x.title, status: x.status, due: x.due, area: x.area, owner: x.owner } : { id, title: title(id) });
  };
  const tags = Object.values(d.tags);
  const [answered, setAnswered] = useState<Record<string, string>>({});
  // an agent's question is answered in his words: its first button opens this field, with her draft in it
  const [answering, setAnswering] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const dict = useDictate();
  const items = h ? [...h.items, ...h.older.filter((x) => !h.items.some((y) => y.id === x.id))] : [];
  const did = items.filter((x) => x.kind === 'did');
  const noticed = items.filter((x) => x.kind !== 'did' && x.kind !== 'ask' && x.status !== 'expired');
  // the item a tapped push was about: a question is marked where it waits; anything else is pinned on top
  const pinned = focus && !h?.asks.some((x) => x.id === focus) ? items.find((x) => x.id === focus) ?? null : null;
  const answer = (x: FeedItem, choice: 'yes' | 'no', text?: string) => {
    setAnswered((a) => ({ ...a, [x.id]: choice === 'no' ? 'Not now' : text ? `Sent to ${x.from ?? 'them'}` : 'Done' }));
    if (!DEMO) noraApi.answerItem(x.id, text ? { choice, text } : { choice }).catch((e) => {
      setAnswered((a) => { const n = { ...a }; delete n[x.id]; return n; });
      say(msg(e));
      if (text && choice === 'yes') { setDraft(text); setAnswering(x.id); } // the words come back to send again
    });
  };
  const openAnswer = (x: FeedItem) => { dict.cancel(); setDraft(x.ask?.draft ?? ''); setAnswering(x.id); };
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[st.content, { paddingTop: insets.top + 8, paddingBottom: dockClear(insets.bottom) + 24, gap: 28 }]}
      refreshControl={<RefreshControl refreshing={d.refreshing} onRefresh={() => void d.load(false)} tintColor={C.muted} />}>
      <Header h={h} tags={d.tags} onBack={onBack} />

      {pinned ? (
        <PageSection title="From your notification">
          <PageRow first title={pinned.title} sub={pinned.text ?? pinned.time} />
        </PageSection>
      ) : null}

      {h?.asks.length ? (
        <PageSection title="Waiting on you">
          {h.asks.map((x, i) => (
            <View key={x.id} style={[st.pageRow, i > 0 && st.rule, { flexDirection: 'column', alignItems: 'stretch', gap: 8 }, x.id === focus && { backgroundColor: tint(NORA, 0.12) }]}>
              <Text style={st.taskTitle}>{x.title}</Text>
              {x.text ? <Text style={t.small} numberOfLines={4}>{x.text}</Text> : null}
              {answered[x.id] ? <Text style={t.caption}>{answered[x.id]}</Text> : answering === x.id ? (
                <View style={{ gap: 8 }}>
                  <Composer draft={draft} setDraft={setDraft} dict={dict} autoFocus inset placeholder="Your answer" label={`Your answer for ${x.from ?? 'them'}`}
                    onSend={(text) => { setAnswering(null); answer(x, 'yes', text); }} />
                  <Pressable accessibilityRole="button" accessibilityLabel="Cancel answering" hitSlop={8} style={st.cancelAnswer}
                    onPress={() => { dict.cancel(); setAnswering(null); }}><Text style={t.label}>Cancel</Text></Pressable>
                </View>
              ) : (
                <View style={st.nbActs}>
                  <Chip text={x.ask?.yes ?? 'Yes'} on={false} color={NORA} onPress={() => (x.ask?.question ? openAnswer(x) : answer(x, 'yes'))} />
                  <Chip text={x.ask?.no ?? 'Not now'} on={false} color={C.text} onPress={() => answer(x, 'no', x.ask?.question ? 'Not now' : undefined)} />
                  <Chip text="Answer in chat" on={false} color={C.text}
                    onPress={() => noraUi.openChat(x.ask?.question ? { replyTo: { id: x.ask.request ?? x.id, from: x.from ?? '' } } : {})} />
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
              <PageRow key={g.taskId} first={!h?.busy && i === 0} onPress={() => open(g.taskId)} lead={g.state === 'ask' ? <View style={[st.dot8, { backgroundColor: NORA }]} /> : <Dots color={NORA} />}
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
            {tags.filter((g) => g.state === 'queued').map((g) => <PageRow key={g.taskId} first={false} onPress={() => open(g.taskId)} lead={<View style={st.ring12} />} title={title(g.taskId)} sub="Her task, not started" />)}
          </>
        ) : <EmptyCard text="Nothing lined up." />}
      </PageSection>

      {tags.some((g) => g.state === 'found' || g.state === 'error') ? (
        <PageSection title="Found for you">
          {tags.filter((g) => g.state === 'found' || g.state === 'error').map((g, i) => (
            <Pressable key={g.taskId} accessibilityRole="button" accessibilityHint="Opens the task" onPress={() => open(g.taskId)}
              style={({ pressed }) => [st.pageRow, i > 0 && st.rule, { flexDirection: 'column', alignItems: 'stretch', gap: 6 }, pressed && { backgroundColor: SURF.pressed }]}>
              <Text style={st.taskTitle}>{title(g.taskId)}</Text>
              <Text style={[st.nbBody, g.state === 'error' && { color: C.danger }]}>{g.text ?? (g.state === 'error' ? 'Could not finish.' : 'Done.')}</Text>
            </Pressable>
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
function PageRow({ lead, title, sub, first, onPress }: { lead?: ReactNode; title: string; sub?: string | null; first: boolean; onPress?: () => void }) {
  return (
    <Pressable disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined} onPress={onPress}
      style={({ pressed }) => [st.pageRow, !first && st.rule, pressed && !!onPress && { backgroundColor: SURF.pressed }]}>
      {lead ? <View style={st.leadCol}>{lead}</View> : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={st.taskTitle} numberOfLines={2}>{title}</Text>
        {sub ? <Text style={[st.metaText, { color: C.faint }, t.num]} numberOfLines={2}>{sub}</Text> : null}
      </View>
      {onPress ? <Chevron color={C.faint} /> : null}
    </Pressable>
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
  owed: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 14, rowGap: 4, marginTop: 6 },
  owedText: { fontFamily: F.medium, fontSize: 14, lineHeight: 20, color: C.textSoft },
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
  cancelAnswer: { alignSelf: 'flex-start', minHeight: 36, justifyContent: 'center', paddingHorizontal: 4 },
  replyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.06)', paddingHorizontal: 12 },
  replyInput: { flex: 1, fontFamily: F.regular, fontSize: 15, lineHeight: 20, color: C.text, paddingVertical: 8 },
  dropLine: { position: 'absolute', left: 16, right: 16, height: 2, borderRadius: 1, backgroundColor: NORA },
  glow: { backgroundColor: tint(NORA, 0.16) },
  lifted: { boxShadow: '0 14px 30px rgba(0,0,0,0.5)', borderRadius: 12, overflow: 'hidden' },
  pageRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16, minHeight: 56 },
  leadCol: { width: 24, alignItems: 'center' },
});
