import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';
import { haptic, t, tint } from '@/aspects/kit/tokens';
import { WaterRow } from '@/capture/parts';
import { takePhoto } from '@/capture/shoot';
import { frameOf, type FrameId } from '@/capture/moments';
import type { BodyToday } from '@/lib/body';
import type { Task } from '@/lib/today';
import { ASPECT_NAME } from '@/lib/aspects';
import { useGet } from '@/lib/mod';
import { DEMO } from '@/lib/demo';
import { noraUi } from '@/nora/state';
import { openTask } from '@/work/bus';
import type { Tag } from '@/home/data';
import { GymCard } from '@/today/GymCard';
import { ASPECT_COLOR, C, F, type AspectKey } from '@/theme';
import { count, MEALS, routineFlags, type CheckId, type Day, type RoutineItem, type SkipId } from './day';
import { EditActions, RoutineEditor } from './RoutineEdit';
import { HoldMenu, LineSheet, MealPopup, WakeDial, type HoldTarget } from './overlays';
import { CardRow, Dots, Group, Link, NORA, NORA_TEXT, PhotoSlot, Row, Section, Segmented, settleOrder, SubLabel, Tick, type Steady } from './parts';
import type { RingPart } from './Ring';
import type { Say } from './TodayPlan';

// Today's sections, top to bottom: Core habits, Body, Diet, Mind, Financial (Mission, Money, Growth), Habits to
// leave, then any other aspect with tasks. A finished section sinks under "Done today", rows kept as quiet lines.
// A routine row can be cancelled for today: tap its tick twice, or hold the row (Cancel for today). A task card's tick
// does the same on a double tap; a tap or hold on the card opens the task's full view (edit, move, cancel, delete).
// Above the sections, a short "Due now" list: late and due-today tasks, and what Nora is waiting on him for.

const A = ASPECT_COLOR;
const SHOWN_CARDS = 10;

type Built = { key: string; finished: boolean; node: ReactNode };

export function Plan({ d, body, now, onOpen, onToggleTask, onCancelTask, onRestoreTask, onTypeMeal, say, hide, onHome }: {
  d: Day; body: BodyToday | null; now: number; onOpen: (link: string) => void; onToggleTask: (id: string) => void;
  /** cancel a task for today (a repeating one skips to its next), and bring it back */
  onCancelTask: (id: string) => void; onRestoreTask: (id: string) => void;
  /** a meal typed instead of photographed: opens the line for it */ onTypeMeal: (id: FrameId) => void;
  say: Say; hide: () => void;
  /** Opens Home on that aspect's tasks (null: all of them). */
  onHome: (list: AspectKey | 'none' | null) => void;
}) {
  const { cap } = d;
  const [dial, setDial] = useState(false);
  const [meal, setMeal] = useState<(typeof MEALS)[number] | null>(null);
  const [line, setLine] = useState<'journal' | 'page' | null>(null);
  const [order, setOrder] = useState<string[]>([]);
  const [editing, setEditing] = useState<{ morning: RoutineItem[]; night: RoutineItem[] } | null>(null);
  const fail = useCallback((e: unknown) => say(e instanceof Error ? e.message : 'That didn’t save.'), [say]);

  const tick = useCallback(async (id: Parameters<Day['cap']['toggle']>[0], on: boolean) => {
    try { const m = await cap.toggle(id, on); if (m) say(m); } catch (e) { fail(e); }
  }, [cap, say, fail]);
  const check = useCallback((id: CheckId) => { d.toggle(id).catch(fail); }, [d, fail]);
  const shoot = useCallback(async (id: FrameId) => {
    let picked;
    try { picked = await takePhoto(); } catch (e) { fail(e); return; }
    if (!picked) return;
    const uri = typeof picked.uri === 'string' ? picked.uri : URL.createObjectURL(picked.uri);
    cap.photo(frameOf(id), picked, uri).then(say, fail);
  }, [cap, say, fail]);

  // Rows, cards and sections settle 0.7 s after the last tick, not under the finger: a double tap's second tap (cancel
  // for today) has to land on the same tick.
  const [taps, setTaps] = useState<{ keys: Steady; n: number }>({ keys: {}, n: 0 });
  useEffect(() => {
    if (!taps.n) return;
    const calm = setTimeout(() => setTaps({ keys: {}, n: 0 }), 700);
    return () => clearTimeout(calm);
  }, [taps]);
  const hold = useCallback((key: string, was: boolean) => {
    setTaps((s) => ({ keys: key in s.keys ? s.keys : { ...s.keys, [key]: was }, n: s.n + 1 }));
  }, []);
  const steady = taps.keys;

  // ── cancel for today: a routine row comes back tomorrow by itself; a repeating task skips to its next, a one-off drops ──
  const [menu, setMenu] = useState<HoldTarget | null>(null);
  const undo = (text: string, back: () => void) => say(text, { label: 'Undo', onPress: () => { hide(); back(); } });
  /** A routine row's tick, its double tap and hold, and the tap that brings it back. */
  const routineActs = (title: string, item: string, done: boolean, onTick: () => void, set: (v: boolean) => Promise<unknown>) => {
    const cancelled = !done && d.skipped(item);
    const onCancel = () => {
      hold(item, done || cancelled);
      undo(`${title} cancelled for today`, () => { set(false).catch(fail); });
      set(true).catch(fail);
    };
    const onRestore = () => { hold(item, true); say(`${title} is back`); set(false).catch(fail); };
    return {
      done, cancelled, onCancel, onRestore,
      onTick: () => { hold(item, done || cancelled); onTick(); },
      onHold: () => { haptic.success(); setMenu({ title, kind: 'routine', cancelled, onCancel, onRestore }); },
    };
  };
  const rowActs = (title: string, id: SkipId, done: boolean, onTick: () => void) => routineActs(title, id, done, onTick, (v) => d.skip(id, v));
  const shut = (x: Task) => x.status === 'done' || x.status === 'dropped';
  const cancelTask = (x: Task) => {
    hold(x.id, shut(x));
    onCancelTask(x.id);
    undo(x.repeat || x.next ? `${x.title} skipped today` : `${x.title} cancelled`, () => onRestoreTask(x.id));
  };
  const restoreTask = (x: Task) => { hold(x.id, true); onRestoreTask(x.id); say(`${x.title} is back`); };
  const openOf = (x: Task) => openTask({ id: x.id, title: x.title, status: x.status, due: x.due, area: x.area, owner: x.owner, repeat: x.repeat ?? null });
  const holdOf = (x: Task) => { haptic.success(); openOf(x); };

  const wakeHm = cap.wakeAt;
  const logWake = async () => {
    if (wakeHm) { setDial(true); return; }
    const n = new Date(now + 5.5 * 3600_000);
    const m = Math.floor(n.getUTCMinutes() / 5) * 5;
    const hmNow = `${String(n.getUTCHours()).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    try { await cap.wake(hmNow); say(`Woke at ${hmNow}`); } catch (e) { fail(e); }
  };

  const T = d.tasks.by;
  const rf = routineFlags(d, !!body); // the same ticks fill the hero's crystals
  const cards = (k: AspectKey | 'none', color: string) => {
    const list = T.get(k) ?? [];
    if (!list.length) return null;
    return (
      <CardRow tasks={list.slice(0, SHOWN_CARDS)} color={color} today={cap.day} steady={steady}
        onTick={(id) => { const x = list.find((y) => y.id === id); hold(id, !!x && shut(x)); onToggleTask(id); }}
        onCancel={cancelTask} onRestore={restoreTask} onOpen={openOf} onHold={holdOf} more={Math.max(0, list.length - SHOWN_CARDS)} onMore={() => onHome(k)} />
    );
  };
  const dueOf = (k: AspectKey | 'none') => (T.get(k) ?? []).filter((x) => x.due === cap.day);

  // ── due now: late and due-today open tasks, any aspect, plus what Nora waits on him for ──
  const tagsRead = useGet<{ tags: Record<string, Tag> }>(DEMO ? null : '/mod/tasknora/tags');
  const waiting = Object.values(tagsRead.data?.tags ?? {}).filter((g) => g.state === 'ask').length;
  const owed = [...T.entries()].flatMap(([k, l]) => l.map((x) => ({ x, k })))
    .filter(({ x }) => !!x.due && x.due <= cap.day && (x.status === 'todo' || x.status === 'doing' || (x.id in steady && x.status === 'done')))
    .sort((a, b) => String(a.x.due).localeCompare(String(b.x.due)));
  const late = owed.filter(({ x }) => x.due! < cap.day).length;
  const dueNow = owed.length || waiting ? (
    <View style={st.due}>
      <View style={st.dueHead}>
        <Text style={t.section}>Due now</Text>
        <View style={{ flex: 1 }} />
        {late ? <Text style={[st.dueCount, { color: C.danger }]}>{`${late} late`}</Text> : null}
        {owed.length - late ? <Text style={st.dueCount}>{`${owed.length - late} today`}</Text> : null}
      </View>
      <Group>
        {owed.slice(0, 4).map(({ x, k }, i) => (
          <Row key={x.id} first={i === 0} title={x.title} done={x.status === 'done'} color={k === 'none' ? C.muted : A[k]}
            sub={`${x.due! < cap.day ? 'Late' : 'Today'}${k === 'none' ? '' : ` · ${ASPECT_NAME[k]}`}`} subColor={x.due! < cap.day ? C.danger : undefined}
            onPress={() => openOf(x)} onHold={() => holdOf(x)} tickLabel={`${x.title}, done`}
            onTick={() => { hold(x.id, x.status === 'done'); onToggleTask(x.id); }} />
        ))}
        {owed.length > 4 ? <Row title={`${owed.length - 4} more on Home`} done={false} color={C.muted} onPress={() => onHome(null)} first={false} /> : null}
        {waiting ? (
          <Row first={!owed.length} title={`Nora is waiting on you for ${waiting === 1 ? 'one answer' : `${waiting} answers`}`} done={false} color={NORA}
            onPress={() => noraUi.openHome()} right={<View style={[st.dot, { backgroundColor: NORA }]} />} />
        ) : null}
      </Group>
    </View>
  ) : null;

  const sections: Built[] = [];

  // ── Core habits ──
  {
    const j = cap.doneTicks.has('journal'), cl = cap.doneTicks.has('clean'), me = cap.doneTicks.has('meditate');
    const p = count(rf.core);
    const parts: RingPart[] = [{ color: A.soul, ...p }];
    sections.push({ key: 'core', finished: p.done === p.total, node: (
      <Section key="core" label="Core habits" parts={parts} finished={p.done === p.total} onOpen={() => onOpen('soul')}>
        <View style={st.tiles}>
          <Habit name="Journaling" big="1" unit="line" done={j} color={A.soul} onTick={() => (j ? tick('journal', false) : setLine('journal'))} onOpen={() => onOpen('soul/journal')} />
          <Habit name="Day count" big={cap.cleanDay != null ? String(cap.cleanDay) : '–'} unit={cap.cleanDay === 1 ? 'day' : 'days'} done={cl} color={A.soul}
            onTick={() => (cap.cleanReady ? tick('clean', !cl) : say('Start Clean in Soul first.'))}
            foot={<Link text="Reset" onPress={() => onOpen('soul/clean')} />} onOpen={() => onOpen('soul/clean')} />
          <Habit name="Meditation" big="10" unit="min" done={me} color={A.soul} onTick={() => tick('meditate', !me)} onOpen={() => onOpen('soul/meditate')} />
        </View>
      </Section>
    ) });
  }

  // ── Body ──
  {
    const woke = !!wakeHm, drink = cap.doneTicks.has('drink');
    const showDrink = woke || drink;
    const shower = d.mode('cold-shower') ?? 'cold';
    const PHOTO: Partial<Record<string, FrameId>> = { 'cold-shower': 'body', 'skincare-am': 'face' };
    const morning: (RoutineItem & { photo?: FrameId })[] = d.routines.morning.map((m) => ({
      ...m, photo: PHOTO[m.id],
      title: m.id === 'cold-shower' && m.title === 'Cold shower' && shower === 'hot' ? 'Hot shower' : m.title,
    }));
    const night = d.routines.night;
    const startEdit = () => { haptic.success(); setEditing({ morning: d.routines.morning, night: d.routines.night }); };
    const saveEdit = () => {
      if (!editing) return;
      const clean = (l: RoutineItem[]) => l.map((x) => ({ ...x, title: x.title.trim(), sub: x.sub?.trim() || undefined })).filter((x) => x.title);
      setEditing(null);
      d.saveRoutines({ morning: clean(editing.morning), night: clean(editing.night) }).then(() => say('Routine saved'), fail);
    };
    const p = count(rf.body, dueOf('body'));
    const evening = new Date(now + 5.5 * 3600_000).getUTCHours() >= 19;
    const nightGroup = (
      <View key="night">
        <SubLabel>Night routine</SubLabel>
        <Group>
          {settleOrder(night.map((n) => ({ ...n, done: d.on(n.id), cancelled: d.skipped(n.id) })), steady).map((n, i) => (
            <Row key={n.id} first={i === 0} title={n.title} color={A.body} {...rowActs(n.title, n.id, n.done, () => check(n.id))} />
          ))}
        </Group>
      </View>
    );
    sections.push({ key: 'body', finished: p.total > 0 && p.done === p.total, node: (
      <Section key="body" label="Body" parts={[{ color: A.body, ...p }]} finished={p.total > 0 && p.done === p.total} onOpen={() => onOpen('body')}
        onLongPress={editing ? undefined : startEdit} right={editing ? <EditActions onCancel={() => setEditing(null)} onDone={saveEdit} /> : undefined}>
        {editing ? (
          <>
            <RoutineEditor label="Morning routine" prefix="am" items={editing.morning} onChange={(l) => setEditing({ ...editing, morning: l })} />
            <RoutineEditor label="Night routine" prefix="night" items={editing.night} onChange={(l) => setEditing({ ...editing, night: l })} />
          </>
        ) : <>
        {evening ? nightGroup : null}
        <Group>
          <Row first title={woke ? `Woke ${wakeHm}` : 'Wake up'} sub={woke ? 'Tap to change' : 'Log the time you got up'} done={woke && !showDrink ? true : false}
            color={A.body} onPress={() => (woke ? setDial(true) : void logWake())}
            right={<Clock now={now} onPress={() => setDial(true)} />} />
          {showDrink ? (
            <Row title="Wake-up drink" sub="Hot water, lemon, ginger, chia seeds, honey, raw garlic" color={A.body} lines={1}
              right={<PhotoSlot st={cap.frames.drink} label="Wake-up drink" onPress={() => void shoot('drink')} />}
              {...routineActs('Wake-up drink', 'wake-drink', drink, () => tick('drink', !drink), (v) => cap.skip('drink', v))} />
          ) : null}
        </Group>
        {body ? <GymCard body={body} onOpen={() => onOpen('body/gym')} /> : null}
        <SubLabel>Morning routine</SubLabel>
        <Group>
          {settleOrder(morning.map((m) => ({ ...m, done: d.on(m.id), cancelled: d.skipped(m.id) })), steady).map((m, i) => (
            <Row key={m.id} first={i === 0} title={m.title} sub={m.sub} color={A.body} {...rowActs(m.title, m.id, m.done, () => check(m.id))}
              right={(
                <View style={st.rightRow}>
                  {m.id === 'cold-shower' && !m.done ? <Segmented value={shower} options={[{ key: 'cold', label: 'Cold' }, { key: 'hot', label: 'Hot' }]} onChange={(k) => { d.setShower(k as 'cold' | 'hot').catch(fail); }} /> : null}
                  {m.photo ? <PhotoSlot st={cap.frames[m.photo]} label={m.title} blur small={m.done} onPress={() => void shoot(m.photo!)} /> : null}
                </View>
              )} />
          ))}
        </Group>
        <Group>
          <Row first title="Voice training" sub="Practice on a call" color={A.body} {...rowActs('Voice training', 'voice', d.on('voice'), () => check('voice'))}
            right={d.on('voice') ? null : <NoraButton text="Call Nora for this" onPress={() => noraUi.call({ reason: 'voice training' })} />} />
        </Group>
        {evening ? null : nightGroup}
        {cards('body', A.body)}
        </>}
      </Section>
    ) });
  }

  // ── Diet ──
  {
    const ns = cap.doneTicks.has('nosugar');
    const p = count(rf.diet);
    sections.push({ key: 'diet', finished: p.done === p.total, node: (
      <Section key="diet" label="Diet" parts={[{ color: A.body, ...p }]} finished={p.done === p.total} onOpen={() => onOpen('body/diet')}>
        <Group>
          <View style={st.water}>
            <WaterRow glasses={cap.water} target={cap.waterTarget}
              onAdd={() => { cap.addWater(1).catch(fail); }} onTakeBack={() => { cap.addWater(-1).then(() => say('One glass taken back'), fail); }} />
          </View>
          <Row title="No sugar" sub="Habit" color={A.body} {...routineActs('No sugar', 'no-sugar', ns, () => tick('nosugar', !ns), (v) => cap.skip('nosugar', v))} />
        </Group>
        <SubLabel>Meals</SubLabel>
        <Group>
          {settleOrder(MEALS.map((m) => ({ ...m, done: d.mealDone(m.id) }))).map((m, i) => {
            const fs = cap.frames[m.id];
            const note = fs?.status === 'ready' ? 'Confirm in Diet' : fs?.status === 'logged' ? fs.note : fs?.status === 'failed' ? 'Didn’t send. Tap the photo to try again.' : fs?.note && fs.status !== 'empty' ? fs.note : m.plan;
            return (
              <Row key={m.id} first={i === 0} title={m.title} sub={note} subColor={fs?.status === 'ready' ? A.body : fs?.status === 'failed' ? C.danger : undefined}
                done={m.done} color={A.body} onPress={() => setMeal(m)}
                right={<PhotoSlot st={fs} label={m.title} small={m.done} onPress={() => void shoot(m.id)} />} />
            );
          })}
        </Group>
      </Section>
    ) });
  }

  // ── Mind ──
  {
    const games = [
      { id: 'chess' as const, name: 'Chess', cap: 'Duolingo', url: 'duolingo://', web: 'https://www.duolingo.com' },
      { id: 'sudoku' as const, name: 'Sudoku', cap: 'New game', url: 'https://sudoku.com', web: 'https://sudoku.com' },
      { id: 'matiks' as const, name: 'Matiks', cap: 'Open app', url: 'matiks://', web: 'https://www.matiks.in' },
    ];
    const speak = d.practice('speak'), course = d.practice('course'), book = cap.doneTicks.has('book');
    const speakActs = routineActs('Impromptu speaking', 'practice-speak', speak, () => { d.togglePractice('speak').catch(fail); }, (v) => d.skipPractice('speak', v));
    const courseActs = routineActs('Communication course', 'practice-course', course, () => { d.togglePractice('course').catch(fail); }, (v) => d.skipPractice('course', v));
    // the book's first tap opens the page line, so it has no double tap: hold it to cancel
    const bookActs = rowActs('Book', 'book', book, () => (book ? tick('book', false) : cap.book ? setLine('page') : say('No book open. Pick one in Mind > Read.')));
    const p = count(rf.mind, dueOf('mind'));
    sections.push({ key: 'mind', finished: p.done === p.total, node: (
      <Section key="mind" label="Mind" parts={[{ color: A.mind, ...p }]} finished={p.done === p.total} onOpen={() => onOpen('mind')}>
        <View style={st.tiles}>
          {games.map((g) => {
            const done = cap.doneTicks.has(g.id);
            return (
              <View key={g.id} style={[st.app, done && { backgroundColor: tint(A.mind, 0.1) }]}>
                <View style={st.appTop}>
                  <Text numberOfLines={1} style={st.appName}>{g.name}</Text>
                  <Tick done={done} color={A.mind} size={22} label={`${g.name} done`} onPress={() => tick(g.id, !done)} />
                </View>
                <Link text={g.cap} out onPress={() => { Linking.openURL(g.url).catch(() => Linking.openURL(g.web).catch(() => {})); }} />
              </View>
            );
          })}
        </View>
        <Group>
          {settleOrder([
            { id: 'practice-speak', done: speak, cancelled: speakActs.cancelled, node: (first: boolean) => (
              <Row key="speak" first={first} title="Impromptu speaking" sub="Roll a topic and talk" color={A.mind} {...speakActs} />
            ) },
            { id: 'practice-course', done: course, cancelled: courseActs.cancelled, node: (first: boolean) => (
              <Row key="course" first={first} title="Communication course" color={A.mind} {...courseActs}
                sub={null}>
                {course || courseActs.cancelled ? null : <View style={st.links}><Link text="Gleam" out onPress={() => { Linking.openURL('https://apps.apple.com/search?term=gleam%20communication').catch(() => {}); }} /><Link text="Stage Academy on PC" /></View>}
              </Row>
            ) },
            { id: 'book', done: book, cancelled: bookActs.cancelled, node: (first: boolean) => (
              <Row key="book" first={first} title="Book" sub={cap.book ? `${cap.book.title}, p. ${cap.book.page ?? 0}` : 'No book open'} color={A.mind}
                {...bookActs} onCancel={undefined} onHold={book ? undefined : bookActs.onHold}>
                {cap.book || book || bookActs.cancelled ? null : <View style={st.links}><Link text="Pick a book" onPress={() => onOpen('mind/read')} /><Link text="Listen on Spotify" out onPress={() => { Linking.openURL('spotify://').catch(() => {}); }} /></View>}
              </Row>
            ) },
          ], steady).map((r, i) => r.node(i === 0))}
        </Group>
        {cards('mind', A.mind)}
      </Section>
    ) });
  }

  // ── Financial: Mission, Money, Growth ──
  {
    const part = (k: 'mission' | 'money' | 'growth') => ({ color: A[k], ...count(rf[k], dueOf(k)) });
    const parts: RingPart[] = [part('mission'), part('money'), part('growth')];
    // a part with nothing left in it today (its row cancelled, no tasks) doesn't hold the section open
    const finished = parts.some((x) => x.total > 0) && parts.every((x) => x.done >= x.total);
    const parent = (id: CheckId, title: string, color: string, sub: string | null, first: boolean, extra?: ReactNode) => (
      <Row key={id} first={first} title={title} sub={sub} color={color} {...rowActs(title, id, d.on(id), () => check(id))}>{d.skipped(id) ? null : extra}</Row>
    );
    const openN = (k: AspectKey) => (T.get(k) ?? []).filter((x) => !shut(x)).length;
    sections.push({ key: 'financial', finished, node: (
      <Section key="financial" label="Financial" parts={parts} finished={finished}>
        <SubLabel color={A.mission}>Mission</SubLabel>
        <Group>{parent('mission-norrita', 'Norrita: manage the company', A.mission, openN('mission') ? `${openN('mission')} open tasks` : null, true)}</Group>
        <Thread color={A.mission}>{cards('mission', A.mission)}</Thread>
        <SubLabel color={A.money}>Money</SubLabel>
        <Group>
          {parent('money-channels', 'Work on all 8 channels', A.money, openN('money') ? `${openN('money')} open tasks` : 'Content creation', true)}
          {parent('money-social', 'Manage LinkedIn and X', A.money, null, false, d.on('money-social') ? null : <View style={st.links}><Link text="Grokboard on PC" /></View>)}
          {parent('money-brand', 'Personal branding channel', A.money, null, false)}
        </Group>
        <Thread color={A.money}>{cards('money', A.money)}</Thread>
        <SubLabel color={A.growth}>Growth</SubLabel>
        <Group>{parent('growth-cc', 'CC to keyboard practice', A.growth, 'Chorded keyboard', true)}</Group>
        <Thread color={A.growth}>{cards('growth', A.growth)}</Thread>
      </Section>
    ) });
  }

  // ── Habits to leave ──
  {
    const items: { id: CheckId; name: string; reason: string }[] = [
      { id: 'leave-washroom', name: 'No phone in the washroom', reason: 'Bad hygiene' },
      { id: 'leave-late', name: 'No late night', reason: 'In bed on time' },
    ];
    const p = count(rf.leave);
    sections.push({ key: 'leave', finished: p.done === p.total, node: (
      <Section key="leave" label="Habits to leave" parts={[{ color: A.soul, ...p }]} finished={p.done === p.total}>
        <View style={st.tiles}>
          {items.map((i) => (
            <Pressable key={i.id} accessibilityRole="checkbox" accessibilityState={{ checked: d.on(i.id) }} accessibilityLabel={`${i.name}, kept today`}
              onPress={() => { haptic.medium(); check(i.id); }} style={({ pressed }) => [st.leave, d.on(i.id) && { backgroundColor: tint(A.soul, 0.1) }, pressed && { transform: [{ scale: 0.97 }] }]}>
              <View style={st.appTop}>
                <Text style={[t.caption]}>{i.reason}</Text>
                <Tick done={d.on(i.id)} color={A.soul} size={22} label={`${i.name}, kept today`} onPress={() => check(i.id)} passive />
              </View>
              <Text numberOfLines={2} style={st.leaveName}>{i.name}</Text>
            </Pressable>
          ))}
        </View>
      </Section>
    ) });
  }

  // ── other aspects with tasks ──
  for (const k of ['soul', 'family', 'friends', 'romance', 'none'] as const) {
    const list = T.get(k) ?? [];
    if (!list.length) continue;
    const color = k === 'none' ? C.muted : A[k];
    const p = count([], dueOf(k));
    const label = k === 'none' ? 'Other' : k[0].toUpperCase() + k.slice(1);
    sections.push({ key: k, finished: p.total > 0 && p.done === p.total, node: (
      <Section key={k} label={label} parts={[{ color, ...p }]} finished={p.total > 0 && p.done === p.total} onOpen={k === 'none' ? undefined : () => onOpen(k)}>
        {cards(k, color)}
      </Section>
    ) });
  }

  // finished sections sink in the order they finished, once the ticks stop landing (see `steady`)
  const fin = sections.filter((x) => x.finished).map((x) => x.key);
  const still = taps.n > 0;
  const nextOrder = still ? order : [...order.filter((k) => fin.includes(k)), ...fin.filter((k) => !order.includes(k))];
  if (nextOrder.join() !== order.join()) setOrder(nextOrder);
  const open = sections.filter((x) => !nextOrder.includes(x.key));
  const done = nextOrder.map((k) => sections.find((x) => x.key === k)!).filter(Boolean);

  return (
    <View style={st.wrap}>
      {dueNow}
      {open.map((x) => x.node)}
      {done.length ? (
        <View style={st.doneHead}><Text style={[t.section, { color: C.faint }]}>Done today</Text><View style={st.doneRule} /></View>
      ) : null}
      {done.map((x) => x.node)}
      <WakeDial open={dial} now={now} wakeHm={wakeHm} onClose={() => setDial(false)}
        onSave={async (hmv) => { setDial(false); try { await cap.wake(hmv); say(`Woke at ${hmv}`); } catch (e) { fail(e); } }} />
      <MealPopup meal={meal} st={meal ? cap.frames[meal.id] : undefined} onClose={() => setMeal(null)} onPhoto={() => { const m = meal; setMeal(null); if (m) void shoot(m.id); }}
        onType={() => { const m = meal; setMeal(null); if (m) onTypeMeal(m.id); }} />
      <HoldMenu target={menu} onClose={() => setMenu(null)} />
      <LineSheet kind={line} book={cap.book?.title ?? null} onClose={() => setLine(null)}
        onSubmit={async (text) => {
          const k = line; setLine(null);
          try {
            if (k === 'journal') { await cap.journalLine(text); say('Journal line saved'); }
            else if (k === 'page') { const n = parseInt(text, 10); if (!n) throw new Error('A page number, please.'); say(await cap.page(n)); }
          } catch (e) { fail(e); }
        }} />
    </View>
  );
}

function Habit({ name, big, unit, done, color, onTick, onOpen, foot }: {
  name: string; big: string; unit?: string; done: boolean; color: string; onTick: () => void; onOpen: () => void; foot?: ReactNode;
}) {
  // the whole tile ticks; holding it opens the habit's page
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: done }} accessibilityLabel={name} accessibilityHint="Hold to open"
      onPress={() => { haptic.medium(); onTick(); }} onLongPress={() => { haptic.success(); onOpen(); }} delayLongPress={400}
      style={({ pressed }) => [st.habit, done && { backgroundColor: tint(color, 0.1) }, pressed && { transform: [{ scale: 0.97 }] }]}>
      <View style={st.appTop}>
        <Text style={st.habitBig} numberOfLines={1}>{big}{unit ? <Text style={t.caption}>{` ${unit}`}</Text> : null}</Text>
        <Tick done={done} color={color} size={22} label={`${name}${done ? ', done' : ''}`} onPress={onTick} passive />
      </View>
      <Text numberOfLines={1} style={st.habitName}>{name}</Text>
      {foot ?? <View style={{ height: 16 }} />}
    </Pressable>
  );
}

function Clock({ now, onPress }: { now: number; onPress: () => void }) {
  const n = new Date(now + 5.5 * 3600_000);
  const h = (n.getUTCHours() % 12) + n.getUTCMinutes() / 60, m = n.getUTCMinutes();
  const hand = (deg: number, len: number) => ({ x: 18 + len * Math.sin((deg * Math.PI) / 180), y: 18 - len * Math.cos((deg * Math.PI) / 180) });
  const hh = hand(h * 30, 8), mm = hand(m * 6, 12);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Set the wake time on a dial" onPress={onPress} hitSlop={6} style={st.clockWrap}>
      <ClockSvg hh={hh} mm={mm} />
    </Pressable>
  );
}
function ClockSvg({ hh, mm }: { hh: { x: number; y: number }; mm: { x: number; y: number } }) {
  return (
    <Svg width={36} height={36}>
      <Circle cx={18} cy={18} r={17} fill="rgba(255,255,255,0.07)" />
      {Array.from({ length: 12 }, (_, i) => { const a = (i * 30 * Math.PI) / 180; return <Line key={i} x1={18 + 13 * Math.sin(a)} y1={18 - 13 * Math.cos(a)} x2={18 + 15 * Math.sin(a)} y2={18 - 15 * Math.cos(a)} stroke="rgba(255,255,255,0.35)" strokeWidth={1} />; })}
      <Line x1={18} y1={18} x2={hh.x} y2={hh.y} stroke={C.text} strokeWidth={2} strokeLinecap="round" />
      <Line x1={18} y1={18} x2={mm.x} y2={mm.y} stroke={C.text} strokeWidth={1.4} strokeLinecap="round" />
      <Circle cx={18} cy={18} r={2} fill={A.body} />
    </Svg>
  );
}

function NoraButton({ text, onPress }: { text: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" onPress={onPress} hitSlop={6} style={st.noraBtn}><Text style={st.noraBtnText}>{text}</Text></Pressable>;
}

/** Cards that belong to a parent row hang off a thin line in its colour, so it reads as "under this". */
function Thread({ color, children }: { color: string; children: ReactNode }) {
  if (!children) return null;
  return (
    <View style={st.thread}>
      <View style={[st.threadLine, { backgroundColor: tint(color, 0.35) }]} />
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}

export { Dots, NORA, NORA_TEXT };

const st = StyleSheet.create({
  wrap: { gap: 28 },
  tiles: { flexDirection: 'row', gap: 8 },
  habit: { flex: 1, height: 96, borderRadius: 20, backgroundColor: C.glass, padding: 12, justifyContent: 'space-between' },
  habitBig: { fontFamily: F.semibold, fontSize: 24, lineHeight: 28, letterSpacing: -0.5, color: C.text, fontVariant: ['tabular-nums'], flexShrink: 1 },
  habitName: { fontFamily: F.medium, fontSize: 14, lineHeight: 20, color: C.text },
  appTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 },
  app: { flex: 1, height: 64, borderRadius: 20, backgroundColor: C.glass, padding: 12, justifyContent: 'space-between' },
  appName: { fontFamily: F.medium, fontSize: 16, lineHeight: 21, color: C.text, flexShrink: 1 },
  leave: { flex: 1, height: 112, borderRadius: 20, backgroundColor: C.glass, padding: 12, justifyContent: 'space-between' },
  leaveName: { fontFamily: F.medium, fontSize: 15, lineHeight: 20, color: C.text },
  rightRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  water: { paddingHorizontal: 16, paddingVertical: 12 },
  links: { flexDirection: 'row', gap: 14, paddingBottom: 10, marginTop: -6 },
  clockWrap: { width: 36, height: 36 },
  noraBtn: { height: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: tint(NORA, 0.16), justifyContent: 'center' },
  noraBtnText: { fontFamily: F.medium, fontSize: 14, lineHeight: 20, color: NORA_TEXT },
  thread: { flexDirection: 'row', gap: 12, marginTop: -4 },
  threadLine: { width: 2, marginLeft: 21, borderRadius: 1, marginBottom: 12 },
  doneHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  due: { gap: 10 },
  dueHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginLeft: 4, marginRight: 4 },
  dueCount: { fontFamily: F.medium, fontSize: 14, lineHeight: 20, color: C.textSoft },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 16 },
  doneRule: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.12)' },
});

export type { Task };
