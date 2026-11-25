import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { haptic } from '@/aspects/kit/tokens';
import { untilRead } from '@/capture/Capture';
import { focusFrame, type FrameId } from '@/capture/moments';
import { Toast } from '@/capture/parts';
import { takePhoto } from '@/capture/shoot';
import type { BodyToday } from '@/lib/body';
import type { Area, AspectProgress, LifePayload, TodayPayload } from '@/lib/today';
import { ASPECT_COLOR, C, type AspectKey } from '@/theme';
import { openTask } from '@/work/bus';
import { IST, routineFlags, routineReach, useDay } from './day';
import { MealText, mealNow } from './overlays';
import { Plan } from './Plan';
import { NowStrip, type Span, type StripItem } from './Strip';

// Today's body under the hero: the Now strip, then the routine plan. Owns the clock, the strip's smart photo, the meal
// typed in words (the strip's + and a meal's Type it) and the toast every tick and save reports through.

type Action = { label: string; onPress: () => void } | null;
type ToastState = { text: string; action?: Action } | null;
export type Say = (text: string, action?: Action) => void;

/** Today's toast, drawn by the screen over everything (TodayToast) and fed by the plan. */
export function useTodayToast() {
  const [toast, setToast] = useState<ToastState>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const say = useCallback<Say>((text, action) => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ text, action });
    timer.current = setTimeout(() => setToast(null), action ? 6000 : 2600);
  }, []);
  const hide = useCallback(() => setToast(null), []);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return { toast, say, hide };
}
export function TodayToast({ toast, bottom }: { toast: ToastState; bottom: number }) {
  return (
    <View pointerEvents="box-none" style={[st.toast, { bottom }]}>
      <Toast text={toast?.text ?? null} action={toast?.action} />
    </View>
  );
}

const atHm = (day: string, hmv: string) => Date.parse(`${day}T${hmv}:00+05:30`);

/** "Morning Gym (Lifting & Mobility - 1.5h)": the words before the bracket are the title, the bracket the sub line
 *  (unless the event has a place, which wins). */
function splitTitle(title: string, location: string | null) {
  const m = /^(.+?)\s*\((.+)\)\s*$/.exec(title.trim());
  if (!m) return { title: title.trim(), sub: location };
  return { title: m[1], sub: location ?? m[2] };
}

export function TodayPlan({ today, life, areas, body, say, hide, onOpen, onToggleTask, onCancelTask, onRestoreTask, onHome, onRoutine }: {
  today: TodayPayload; life: LifePayload; areas: Area[]; body: BodyToday | null; say: Say; hide: () => void;
  onOpen: (link: string) => void; onToggleTask: (id: string) => void; onHome: (list: AspectKey | 'none' | null) => void;
  /** cancel a task for today (a repeating one skips to its next), and bring it back */
  onCancelTask: (id: string) => void; onRestoreTask: (id: string) => void;
  /** today's routine ticks per aspect, each time one changes: the screen adds them to the hero's crystals */
  onRoutine?: (r: AspectProgress) => void;
}) {
  const d = useDay({ today, life, areas, body });
  const { cap } = d;
  const routine = routineReach(routineFlags(d, d.gymCounted));
  const routineKey = JSON.stringify(routine);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { onRoutine?.(routine); }, [routineKey, onRoutine]);
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const iv = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(iv); }, []);

  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  const fail = useCallback((e: unknown) => say(e instanceof Error ? e.message : 'That didn’t save.'), [say]);

  // ── the strip: calendar events, his scheduled tasks, and the routine anchors (wake, gym) ──
  const wakeHm = cap.wakeAt, day = d.day, gymDone = d.gymDone;
  const day0 = atHm(day, '00:00'), day1 = day0 + 24 * 3600_000;
  const { items, night } = useMemo(() => {
    const out: StripItem[] = [];
    const night: Span[] = [];
    let sleepEnd: number | null = null;
    for (const e of today.events) {
      if (e.allDay) continue;
      const start = Date.parse(e.start), end = Date.parse(e.end);
      if (end <= day0 || start >= day1) continue;
      if (/^sleep\b/i.test(e.title)) {
        // shaded on the rail; the one that ends in the morning is when he gets up (not tonight's, which ends at midnight)
        night.push({ start: Math.max(start, day0), end: Math.min(end, day1) });
        if (end < day0 + 14 * 3600_000 && (sleepEnd == null || end > sleepEnd)) sleepEnd = end;
        continue;
      }
      const aspect = e.area ? life.areaAspects[e.area]?.[0] : undefined;
      out.push({ id: `e:${e.id}`, ...splitTitle(e.title, e.location), start, end, color: aspect ? ASPECT_COLOR[aspect] : C.muted, aspect: aspect ?? null });
    }
    for (const x of today.tasks) {
      if (!x.scheduled || x.status === 'dropped') continue;
      if (x.owner && x.owner !== 'me') continue;
      const start = Date.parse(x.scheduled.start);
      if (start < day0 || start >= day1) continue; // another day's slot
      const aspect = x.area ? life.areaAspects[x.area]?.[0] : undefined;
      out.push({ id: `t:${x.id}`, title: x.title, sub: null, start, end: Date.parse(x.scheduled.end),
        color: aspect ? ASPECT_COLOR[aspect] : C.muted, aspect: aspect ?? null, done: x.status === 'done' });
    }
    const wakeAt = wakeHm ? atHm(day, wakeHm) : sleepEnd ?? atHm(day, '06:00');
    out.push({ id: 'wake', title: wakeHm ? `Woke at ${wakeHm}` : 'Wake up', sub: wakeHm ? null : 'Tap to log', start: wakeAt, end: null, color: ASPECT_COLOR.body, done: !!wakeHm });
    if (body?.next?.at && body.next.date === day) {
      // the calendar's gym block and the plan's session are one thing: the block takes the plan's name, tick and tap
      const at = atHm(day, body.next.at);
      const block = out.find((i) => i.id.startsWith('e:') && i.end != null && /gym|workout|lift|train/i.test(i.title) && Math.abs(i.start - at) <= 90 * 60_000);
      if (block) Object.assign(block, { id: 'gym', title: body.next.name, sub: 'Gym', color: ASPECT_COLOR.body, done: gymDone });
      else out.push({ id: 'gym', title: body.next.name, sub: 'Gym', start: at, end: null, color: ASPECT_COLOR.body, done: gymDone });
    }
    return { items: out, night };
  }, [today, life, wakeHm, day, day0, day1, gymDone, body]);

  const pick = useCallback((it: StripItem) => {
    haptic.tick();
    if (it.id === 'wake' && !cap.wakeAt) {
      const n = new Date(Date.now() + IST);
      const hmNow = `${String(n.getUTCHours()).padStart(2, '0')}:${String(Math.floor(n.getUTCMinutes() / 5) * 5).padStart(2, '0')}`;
      cap.wake(hmNow).then(() => say(`Woke at ${hmNow}`), fail);
    } else if (it.id === 'gym') onOpen('agenticos://body/gym');
    else if (it.id.startsWith('t:')) {
      const x = today.tasks.find((y) => y.id === it.id.slice(2));
      if (x) openTask({ id: x.id, title: x.title, status: x.status, due: x.due, area: x.area, owner: x.owner, repeat: x.repeat ?? null });
    }
    else say(it.sub ? `${it.title}, ${it.sub}` : it.title);
  }, [cap, onOpen, say, fail, today]);

  // ── the smart photo: one shot, the PC reads it and files it where it belongs ──
  const [reading, setReading] = useState(false);
  const smart = useCallback(async () => {
    if (reading) return;
    let picked;
    try { picked = await takePhoto(); } catch (e) { fail(e); return; }
    if (!picked) return;
    const uri = typeof picked.uri === 'string' ? picked.uri : URL.createObjectURL(picked.uri);
    setReading(true);
    say('Reading the photo…');
    try {
      const n = new Date(Date.now() + IST);
      const it = await untilRead(await cap.smart(picked, focusFrame(n.getUTCHours() * 60 + n.getUTCMinutes())), cap.smartGet, () => alive.current);
      if (!alive.current) return;
      if (it.status === 'reading') { say('Still reading it. It files itself; check back in a minute.'); return; }
      if (it.status !== 'filed') { haptic.warn(); say(it.said ?? 'Couldn’t place that photo.'); return; }
      cap.smartFiled(it, uri);
      haptic.success();
      say(it.said ?? 'Filed', it.canUndo ? { label: 'Undo', onPress: () => { hide(); cap.smartUndo(it).then(() => say('Taken back'), fail); } } : null);
    } catch (e) { fail(e); } finally { if (alive.current) setReading(false); }
  }, [reading, cap, say, hide, fail]);

  // ── a meal in words: the same meal record a filed photo makes, its numbers estimated on the PC ──
  const [typing, setTyping] = useState<FrameId | null>(null);
  const typeMeal = useCallback(async (meal: FrameId, text: string) => {
    setTyping(null);
    try {
      const r = await cap.mealText(meal, text);
      haptic.success();
      say(r.said, { label: 'Undo', onPress: () => { hide(); r.undo().then(() => say('Taken back'), fail); } });
    } catch (e) { fail(e); }
  }, [cap, say, hide, fail]);

  return (
    <>
      {/* the strip is about now: on another day the plan stands alone */}
      {d.live ? <NowStrip items={items} night={night} now={now} day0={day0} onCamera={() => { void smart(); }} onType={() => setTyping(mealNow())} onPick={pick} /> : null}
      <Plan d={d} body={body} now={now} onOpen={onOpen} onToggleTask={onToggleTask} onCancelTask={onCancelTask} onRestoreTask={onRestoreTask}
        onTypeMeal={setTyping} say={say} hide={hide} onHome={onHome} />
      <MealText meal={typing} onClose={() => setTyping(null)} onSubmit={(m, text) => { void typeMeal(m, text); }} />
    </>
  );
}

const st = StyleSheet.create({
  toast: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
});
