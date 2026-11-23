import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { haptic } from '@/aspects/kit/tokens';
import { untilRead } from '@/capture/Capture';
import { focusFrame } from '@/capture/moments';
import { Toast } from '@/capture/parts';
import { takePhoto } from '@/capture/shoot';
import type { BodyToday } from '@/lib/body';
import type { Area, LifePayload, TodayPayload } from '@/lib/today';
import { ASPECT_COLOR, C } from '@/theme';
import { IST, useDay } from './day';
import { Plan } from './Plan';
import { NowStrip, type StripItem } from './Strip';

// Today's body under the hero: the Now strip, then the routine plan. Owns the clock, the strip's smart photo and the
// toast every tick and save reports through.

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

export function TodayPlan({ today, life, areas, body, say, hide, onOpen, onToggleTask, onHome }: {
  today: TodayPayload; life: LifePayload; areas: Area[]; body: BodyToday | null; say: Say; hide: () => void;
  onOpen: (link: string) => void; onToggleTask: (id: string) => void; onHome: () => void;
}) {
  const d = useDay({ today, life, areas, body });
  const { cap } = d;
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const iv = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(iv); }, []);

  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  const fail = useCallback((e: unknown) => say(e instanceof Error ? e.message : 'That didn’t save.'), [say]);

  // ── the strip: calendar events, his scheduled tasks, and the routine anchors (wake, gym) ──
  const wakeHm = cap.wakeAt, day = d.day, gymDone = d.gymDone;
  const items = useMemo<StripItem[]>(() => {
    const out: StripItem[] = [];
    let sleepEnd: number | null = null;
    for (const e of today.events) {
      if (e.allDay) continue;
      const start = Date.parse(e.start), end = Date.parse(e.end);
      if (/^sleep\b/i.test(e.title)) { if (end > now - 18 * 3600_000) sleepEnd = end; continue; }
      const aspect = e.area ? life.areaAspects[e.area]?.[0] : undefined;
      out.push({ id: `e:${e.id}`, title: e.title, sub: e.location, start, end, color: aspect ? ASPECT_COLOR[aspect] : C.muted });
    }
    for (const x of today.tasks) {
      if (!x.scheduled || x.status === 'dropped') continue;
      if (x.owner && x.owner !== 'me') continue;
      const aspect = x.area ? life.areaAspects[x.area]?.[0] : undefined;
      out.push({ id: `t:${x.id}`, title: x.title, sub: null, start: Date.parse(x.scheduled.start), end: Date.parse(x.scheduled.end),
        color: aspect ? ASPECT_COLOR[aspect] : C.muted, done: x.status === 'done' });
    }
    const wakeAt = wakeHm ? atHm(day, wakeHm) : sleepEnd ?? atHm(day, '06:00');
    out.push({ id: 'wake', title: wakeHm ? `Woke at ${wakeHm}` : 'Wake up', sub: wakeHm ? null : 'Tap to log', start: wakeAt, end: null, color: ASPECT_COLOR.body, done: !!wakeHm });
    if (body?.next?.at && body.next.date === day) {
      out.push({ id: 'gym', title: body.next.name, sub: 'Gym', start: atHm(day, body.next.at), end: null, color: ASPECT_COLOR.body, done: gymDone });
    }
    return out.filter((i) => i.start >= atHm(day, '00:00') - 3600_000);
  }, [today, life, wakeHm, day, gymDone, body, now]);

  const pick = useCallback((it: StripItem) => {
    haptic.tick();
    if (it.id === 'wake' && !cap.wakeAt) {
      const n = new Date(Date.now() + IST);
      const hmNow = `${String(n.getUTCHours()).padStart(2, '0')}:${String(Math.floor(n.getUTCMinutes() / 5) * 5).padStart(2, '0')}`;
      cap.wake(hmNow).then(() => say(`Woke at ${hmNow}`), fail);
    } else if (it.id === 'gym') onOpen('agenticos://body/gym');
    else if (it.id.startsWith('t:')) say(it.done ? 'Done' : `${it.title}, until ${new Date((it.end ?? it.start) + IST).toISOString().slice(11, 16)}`);
    else say(it.sub ? `${it.title}, ${it.sub}` : it.title);
  }, [cap, onOpen, say, fail]);

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

  return (
    <>
      <NowStrip items={items} now={now} onCamera={() => { void smart(); }} onPick={pick} />
      <Plan d={d} body={body} now={now} onOpen={onOpen} onToggleTask={onToggleTask} say={say} onHome={onHome} />
    </>
  );
}

const st = StyleSheet.create({
  toast: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
});
