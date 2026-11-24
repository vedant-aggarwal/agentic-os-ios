import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, ReduceMotion } from 'react-native-reanimated';
import {
  Button, Card, CheckRing, dayLabel, Divider, Empty, Failed, Glyph, haptic, Icon, Page, Press, Row, Section, Skeleton, t, timer, today, undoable, useAspect, useEntry,
} from '@/aspects/kit';
import { openLink } from '@/lib/links';
import { C } from '@/theme';
import { DebriefScreen, DebriefsScreen, statusWords } from './Debrief';
import { undebriefed, useDebriefs, useOutings, usePeople, usePrefs, usePrimer, weekOf } from './data';
import { localState, queuePut, setLive, useLocal, useOutbox } from './local';
import { EndedScreen, OutScreen, PrimerScreen } from './Out';
import { AddSheet, LookingSheet, metLine, NextSheet, nextLine, PeopleScreen, PersonScreen, TalkedSheet, TargetSheet } from './People';
import { DotWeek, placeAt, placeName, useNow, whenIn } from './parts';
import type { Follow, Outing, Place } from './types';
import { Linked } from '@/aspects/_linked/Linked';

// Romance: am I meeting people? One loop on one page: a thirty second primer, going out with a counter of
// conversations started (attempts, never results), a minute of debrief, and the debrief's one thing to try coming
// back as the next primer. Talking to holds the people he met and wants to see again. Everything personal arrives
// from the PC at run time; nothing on screen gives away what the page is about at a glance.
type Rec = { id: string } & Record<string, unknown>;

export default function Romance() {
  const a = useAspect();
  const outings = useOutings();
  const debriefs = useDebriefs();
  const people = usePeople();
  const prefs = usePrefs();
  const primer = usePrimer();
  const { live } = useLocal();
  useOutbox(a.open);

  const [primerOpen, setPrimerOpen] = useState(false);
  const [outOpen, setOutOpen] = useState(false);
  const [ended, setEnded] = useState<Outing | null>(null);
  const [debrief, setDebrief] = useState<{ outing: Outing | null; view: string | null } | null>(null);
  const [debriefsOpen, setDebriefsOpen] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [person, setPerson] = useState<string | null>(null);
  const [add, setAdd] = useState<{ place: Place | null; session: string | null } | null>(null);
  const [nextFor, setNextFor] = useState<string | null>(null);
  const [talkedFor, setTalkedFor] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);
  const [target, setTarget] = useState(false);
  const [added, setAdded] = useState<number | null>(null); // when "Add one" was last tapped, for its Undo

  // romance/<part>: people, person/<id>, debriefs, primer (getting ready to go out), out (the outing on now; with
  // none on, the primer that starts one).
  useEntry((e) => {
    const [p, id] = e.parts;
    setPeopleOpen(p === 'people');
    setPerson(p === 'person' && id ? id : null);
    setDebriefsOpen(p === 'debriefs');
    setPrimerOpen(p === 'primer' || (p === 'out' && !live));
    setOutOpen(p === 'out' && !!live);
  });
  const closePrimer = useCallback(() => setPrimerOpen(false), []);
  const closeOut = useCallback(() => setOutOpen(false), []);
  const closeEnded = useCallback(() => setEnded(null), []);
  const closeDebrief = useCallback(() => setDebrief(null), []);
  const closeDebriefs = useCallback(() => setDebriefsOpen(false), []);
  const closePeople = useCallback(() => setPeopleOpen(false), []);
  const closePerson = useCallback(() => setPerson(null), []);

  const items = outings.items;
  const week = items ? weekOf(items) : null;
  const pending = items && debriefs.items ? undebriefed(items, debriefs.items) : null;
  const latest = debriefs.items?.[0] ?? null;
  // a step he is waiting on (a reply) is not a thing to do, so it stays off this list until it has a date
  const due = people.list?.filter((e) => !e.follow?.archived && e.follow?.next?.what && (e.follow.next.due ? e.follow.next.due <= today() : e.follow.next.what !== 'Wait for a reply')) ?? [];
  const activePeople = people.list?.filter((e) => !e.follow?.archived) ?? null;
  const down = !!outings.error && !primer.data && !!primer.error && debriefs.items == null && !!debriefs.error && activePeople == null && !!people.error;
  const retryAll = () => { void outings.refresh(); void primer.refresh(); void debriefs.refresh(); void people.refresh(); };

  // "Add one": a conversation outside an outing, in today's record
  const addOne = () => {
    const id = `day:${today()}`;
    const cur = items?.find((o) => o.id === id);
    const o: Outing = { id, day: today(), start: null, end: null, place: 'logged', primer: null, reps: [...(cur?.reps ?? []), { at: new Date().toISOString(), depth: null }] };
    queuePut('sessions', o as unknown as Rec);
    haptic.medium();
    setAdded(Date.now());
  };
  const undoOne = () => {
    const id = `day:${today()}`;
    const cur = items?.find((o) => o.id === id);
    if (!cur?.reps.length) return;
    queuePut('sessions', { ...cur, reps: cur.reps.slice(0, -1) } as unknown as Rec);
    setAdded(null);
  };
  useEffect(() => {
    if (added == null) return;
    const id = setTimeout(() => setAdded(null), 6000);
    return () => clearTimeout(id);
  }, [added]);

  const markDone = (f: Follow) => {
    if (!f.next) return;
    haptic.medium();
    people.follow.put({ ...f, next: null, done: [...(f.done ?? []), { what: f.next.what, at: new Date().toISOString() }] })
      .catch((err: Error) => a.notice(err.message));
    a.notice('Done. Set the next step on their page.');
  };
  // End is one tap with an Undo that brings the outing back, still running, with its count
  const resume = (o: Outing) => {
    if (localState().live) return; // another outing has started since
    const back: Outing = { ...o, end: null };
    setLive(back, null);
    queuePut('sessions', back as unknown as Rec);
    setEnded(null);
    setDebrief(null);
    setOutOpen(true);
  };
  const afterEnd = (o: Outing) => { setEnded(o); undoable('Outing ended', () => resume(o)); };
  const endLive = () => {
    if (!live) return;
    const done = { ...live, end: new Date().toISOString() };
    queuePut('sessions', done as unknown as Rec);
    setLive(null, done.id);
    afterEnd(done);
  };

  return (
    <Page
      onRefresh={() => { void outings.refresh(); void debriefs.refresh(); void people.refresh(); void prefs.refresh(); void primer.refresh(); }}
      footer={(
        <>
          <DebriefsScreen open={debriefsOpen} onClose={closeDebriefs} />
          <PeopleScreen open={peopleOpen} onClose={closePeople} onOpen={setPerson} onAdd={() => setAdd({ place: null, session: null })} onLooking={() => setLooking(true)} />
          <PersonScreen id={person} onClose={closePerson} onNext={setNextFor} onTalked={setTalkedFor} />
          <PrimerScreen open={primerOpen} onClose={closePrimer} onStart={() => { setPrimerOpen(false); setOutOpen(true); }} />
          <OutScreen open={outOpen} onClose={closeOut} onEnded={(o) => { setOutOpen(false); afterEnd(o); }} />
          <EndedScreen outing={ended} onClose={closeEnded}
            onDebrief={() => { const o = ended; setEnded(null); setDebrief({ outing: o, view: null }); }}
            onAdd={() => setAdd({ place: ended && ended.place !== 'logged' ? ended.place : null, session: ended?.id ?? null })} />
          <DebriefScreen target={debrief} lastTry={primer.data?.try.text ?? null} onClose={closeDebrief} />
          <AddSheet open={!!add} met={add} onClose={() => setAdd(null)} onAdded={(id) => { setEnded(null); setPerson(id); }} />
          <NextSheet id={nextFor} onClose={() => setNextFor(null)} />
          <TalkedSheet id={talkedFor} onClose={() => setTalkedFor(null)} />
          <LookingSheet open={looking} onClose={() => setLooking(false)} />
          <TargetSheet open={target} onClose={() => setTarget(false)} />
        </>
      )}>

      {live ? (
        <LiveHero outing={live} onOpen={() => setOutOpen(true)} onEnd={endLive} />
      ) : week ? (
        <WeekHero week={week} target={prefs.target} targetLoaded={prefs.items != null} onTarget={() => setTarget(true)}
          onGo={() => setPrimerOpen(true)} onAdd={addOne} onUndo={added != null ? undoOne : null} />
      ) : outings.error ? (
        <View style={s.gap16}>
          <Failed message={outings.error} onRetry={down ? retryAll : outings.refresh} />
          <Button label="Go out" kind="accent" onPress={() => setPrimerOpen(true)} />
          <Text style={[t.caption, s.centre]}>Going out works without your PC. The count reaches it later.</Text>
        </View>
      ) : (
        <View style={s.gap16}><Skeleton height={28} width="40%" /><Skeleton height={56} width="55%" /><Skeleton height={88} radius={16} /><Skeleton height={48} radius={24} /></View>
      )}

      {/* when the PC can't be reached at all, one message says so; the sections would only repeat it */}
      {down && (live || week) ? <Failed message={outings.error ?? ''} onRetry={retryAll} /> : null}
      {!down ? (<>
      <Section title="Next time">
        {primer.data ? (
          <Card style={s.gap8}>
            <Text style={t.lead}>{primer.data.try.text}</Text>
            <Text style={t.caption}>{primer.data.try.from === 'ladder' ? 'A first step. After your first debrief, this comes from what you said.' : `From your debrief${primer.data.try.day ? ` ${whenIn(primer.data.try.day)}` : ''}${primer.data.try.by === 'ai' ? ', read by Nora' : ''}`}</Text>
          </Card>
        ) : primer.error ? <Failed message={primer.error} onRetry={primer.refresh} /> : <Skeleton height={96} radius={24} />}
      </Section>

      <Section title="Debrief" action={debriefs.items?.length ? 'All' : undefined} onAction={() => setDebriefsOpen(true)}>
        {pending ? (
          <Card tone={a.color} style={s.gap12}>
            <View style={s.gap4}>
              <Text style={t.strong}>How did it go?</Text>
              <Text style={t.small}>{placeName(pending.place)} {whenIn(pending.day)}, {pending.reps.length} started</Text>
            </View>
            <Button label="Talk for a minute" kind="accent" icon={<Icon name="mic" size={18} color="#14161C" />} onPress={() => setDebrief({ outing: pending, view: null })} />
          </Card>
        ) : latest ? (
          <Card onPress={() => setDebrief({ outing: items?.find((o) => o.id === latest.session) ?? null, view: latest.id })} label="Your last debrief" style={s.gap4}>
            <View style={s.between}>
              <Text style={t.strong}>{dayLabel(latest.day)}</Text>
              <Icon name="right" size={16} color={C.faint} />
            </View>
            <Text style={t.small} numberOfLines={2}>{latest.review ? latest.review.well[0] : statusWords(latest) || 'Saved'}</Text>
          </Card>
        ) : debriefs.items == null && debriefs.error ? (
          <Failed message={debriefs.error} onRetry={debriefs.refresh} />
        ) : debriefs.items == null ? (
          <Skeleton height={72} radius={24} />
        ) : (
          <Card style={s.gap12}>
            <Text style={t.small}>After an outing, talk for a minute about how it went. What went well and one thing to try come back here, and the thing to try becomes your next primer.</Text>
            <Button label="Debrief something now" kind="quiet" small onPress={() => setDebrief({ outing: null, view: null })} wrap={s.selfStart} />
          </Card>
        )}
      </Section>

      {due.length ? (
        <Section title="Follow up" gap={0}>
          {due.map((e, i) => (
            <View key={e.person.id}>
              {i ? <Divider /> : null}
              <Row title={e.person.name} sub={nextLine(e.follow)} chevron onPress={() => setPerson(e.person.id)}
                left={(
                  <Press label={`Mark done: ${e.follow?.next?.what ?? ''}`} role="checkbox" state={{ checked: false }} onPress={() => e.follow && markDone(e.follow)} feel="none" hitSlop={10}>
                    <CheckRing done={false} />
                  </Press>
                )} />
            </View>
          ))}
        </Section>
      ) : null}

      <Section title="Talking to" action={activePeople?.length ? 'See all' : undefined} onAction={() => setPeopleOpen(true)} gap={activePeople?.length ? 0 : 12}>
        {activePeople == null ? (
          people.error ? <Failed message={people.error} onRetry={people.refresh} /> : <Skeleton height={56} radius={16} />
        ) : activePeople.length === 0 ? (
          <Empty title="Nobody yet" body="When you meet someone you'd like to see again, add them here. A first name or a nickname is enough." action="Add someone" onAction={() => setAdd({ place: null, session: null })} />
        ) : (
          <>
            {activePeople.slice(0, 3).map((e, i) => (
              <View key={e.person.id}>
                {i ? <Divider /> : null}
                <Row title={e.person.name} sub={metLine(e)} chevron onPress={() => setPerson(e.person.id)} />
              </View>
            ))}
          </>
        )}
        {activePeople != null ? (
          <>
            {activePeople.length ? <Divider /> : null}
            <Row title={prefs.looking ? 'What I\'m looking for' : 'Write what you\'re looking for'} sub={prefs.looking ? null : 'Private, in your own words'}
              left={<Glyph sf="note.text" d="M6 4h12a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM8 9h8M8 13h8M8 17h5" size={20} color={C.muted} />}
              chevron onPress={() => setLooking(true)} />
          </>
        ) : null}
      </Section>
      </>) : null}

      <Section title="Getting ready" gap={0}>
        <Row title="Face" sub="In Body" chevron onPress={() => openLink('body/face')}
          left={<Glyph sf="face.smiling" d="M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18zM9 10h.01M15 10h.01M8.5 14.5a5 5 0 0 0 7 0" size={20} color={C.muted} />} />
        <Divider />
        <Row title="Speak" sub="In Mind" chevron onPress={() => openLink('mind/speak')}
          left={<Glyph sf="waveform" d="M4 12h2M8 8v8M12 5v14M16 8v8M20 12h-2" size={20} color={C.muted} />} />
      </Section>

      <Linked />
    </Page>
  );
}

// ── the week ─────────────────────────────────────────────────────────────────────────────────────────────────────
function WeekHero({ week, target, targetLoaded, onTarget, onGo, onAdd, onUndo }: {
  week: ReturnType<typeof weekOf>; target: number | null; targetLoaded: boolean; onTarget: () => void; onGo: () => void; onAdd: () => void; onUndo: (() => void) | null;
}) {
  const a = useAspect();
  const reached = target != null && week.count >= target;
  return (
    <View style={s.hero}>
      <View style={s.between}>
        <Text style={t.section}>This week</Text>
        {targetLoaded ? (
          <Press label={target ? `Weekly target ${target}, change` : 'Set a weekly target'} onPress={onTarget} hitSlop={8} style={s.targetBtn}>
            <Text style={[t.label, { color: target ? C.muted : a.color }]}>{target ? `Target ${target}` : 'Set a target'}</Text>
            <Icon name="pencil" size={14} color={target ? C.muted : a.color} />
          </Press>
        ) : null}
      </View>
      <View style={s.countLine} accessibilityRole="text" accessibilityLabel={`${week.count} conversations started this week${target ? ` of ${target}` : ''}`}>
        <Text style={[t.display, t.num, { color: week.count ? a.color : C.text }]}>{week.count}</Text>
        {target ? <Text style={[t.title2, t.num, s.of]}>of {target}</Text> : null}
      </View>
      <Text style={t.body}>
        {week.count === 0 ? (week.total ? 'No conversations yet this week. One is enough to start.' : 'Conversations you start show here, one dot each, however they go.')
          : reached ? `${week.count === 1 ? 'Conversation' : 'Conversations'} started. That's your week, and every extra one still counts.`
            : `${week.count === 1 ? 'Conversation' : 'Conversations'} started. Every one counts, however it went.`}
      </Text>
      <DotWeek days={week.days} color={a.color} />
      {week.total ? <Text style={[t.small, t.num]}>Last week {week.lastWeek}. Since you started, {week.total}.</Text> : null}
      <View style={s.gap8}>
        <Button label="Go out" kind="accent" onPress={onGo} />
        <View style={s.addRow}>
          <Press label="Add a conversation you didn't count" onPress={onAdd} feel="none" hitSlop={8} style={s.addBtn}>
            <Icon name="plus" size={14} color={C.muted} />
            <Text style={t.label}>Add one you didn&apos;t count</Text>
          </Press>
          {onUndo ? (
            <Animated.View entering={FadeIn.duration(160).reduceMotion(ReduceMotion.System)}>
              <Press label="Undo the one just added" onPress={onUndo} hitSlop={8} style={s.addBtn}>
                <Text style={[t.label, { color: a.color }]}>Added. Undo</Text>
              </Press>
            </Animated.View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

/** While he's out, the top of the page is the outing. */
function LiveHero({ outing, onOpen, onEnd }: { outing: Outing; onOpen: () => void; onEnd: () => void }) {
  const a = useAspect();
  const now = useNow(1000, a.open);
  const secs = Math.max(0, Math.floor((now - Date.parse(outing.start ?? new Date().toISOString())) / 1000));
  const old = outing.day < today();
  return (
    <Card tone={a.color} style={s.gap16}>
      <View style={s.between}>
        <View style={s.liveTag}>
          <View style={[s.liveDot, { backgroundColor: a.color }]} />
          <Text style={[t.label, { color: a.color }]}>{old ? `Started ${whenIn(outing.day)}. Still out?` : `Out now ${placeAt(outing.place) ?? ''}`.trim()}</Text>
        </View>
        {!old ? <Text style={[t.label, t.num]}>{timer(secs)}</Text> : null}
      </View>
      <View style={s.countLine}>
        <Text style={[t.display, t.num, { color: a.color }]}>{outing.reps.length}</Text>
        <Text style={[t.lead, s.of]}>started</Text>
      </View>
      <View style={s.row}>
        <Button label="End" kind="quiet" onPress={onEnd} wrap={s.flex} />
        <Button label="Back to it" kind="accent" onPress={onOpen} wrap={s.flex2} />
      </View>
    </Card>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  flex2: { flex: 2 },
  gap4: { gap: 4 },
  gap8: { gap: 8 },
  gap12: { gap: 12 },
  gap16: { gap: 16 },
  centre: { textAlign: 'center' },
  selfStart: { alignSelf: 'flex-start' },
  row: { flexDirection: 'row', gap: 12 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  hero: { gap: 16, paddingTop: 8 },
  countLine: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  of: { color: C.muted },
  targetBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32 },
  addRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, paddingHorizontal: 4 },
  liveTag: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
});
