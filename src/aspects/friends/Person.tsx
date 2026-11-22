import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { C } from '@/theme';
import { Button, Chip, dayLabel, Field, Icon, Row, Screen, Section, Sheet, SP, SURF, t, useAspect } from '@/aspects/kit';
import { fileSource } from '@/lib/mod';
import type { Actions } from './actions';
import { DeepenCard, LogDetail, UsualRow } from './Circle';
import { ACT_CHIP, firstName, inLine, lastLine, LOG_ACTS, roleText, whenAgo, type Bank, type Friends, type Kind, type Moment, type Person } from './data';
import { PlanRow } from './LeadPlan';
import { deepenIdeas, plansWith, visitPhrase, type DeepenIdea, type Model } from './model';
import { Avatar, canPickPhoto, pickPhoto } from './parts';

const STAGES = [{ key: 'met', label: 'Met' }, { key: 'again', label: 'Met again' }, { key: 'friend', label: 'Friend' }] as const;

/** Where a new person is on the path. Plain text, not buttons: the stage moves when they meet, not by a tap here. */
function Stepper({ stage }: { stage: string }) {
  const { color } = useAspect();
  const at = STAGES.findIndex((x) => x.key === stage);
  return (
    <View style={s.stepper} accessible accessibilityLabel={`Stage: ${STAGES[at]?.label ?? 'Met'}`}>
      {STAGES.map((x, i) => (
        <View key={x.key} style={s.step}>
          {i ? <View style={[s.stepLine, i <= at && { backgroundColor: color }]} /> : null}
          <View style={[s.stepDot, i <= at && { backgroundColor: color, borderColor: color }]} />
          <Text style={[t.small, i === at ? { color } : i > at ? { color: C.faint } : null]}>{x.label}</Text>
        </View>
      ))}
    </View>
  );
}

function MomentRow({ mo, onPress }: { mo: Moment; onPress: () => void }) {
  const sub = [dayLabel(mo.date), mo.line, mo.source === 'calendar' ? 'From your calendar' : null].filter(Boolean).join('. ');
  return (
    <Row title={mo.title ?? 'Time together'} sub={sub} onPress={onPress} label={`${mo.title ?? 'Time together'}, ${sub}`}
      right={mo.photo ? <Image source={fileSource(mo.photo)} style={s.thumb} contentFit="cover" accessibilityLabel="Photo" /> : null} />
  );
}

/** One person: log today, what they do together, plans, ideas, the moments. New people also show their path. */
export function PersonScreen({ open, onClose, id, m, f, a, bank, onPlan, notice }: {
  open: boolean; onClose: () => void; id: string | null; m: Model; f: Friends; a: Actions; bank: Bank | null;
  onPlan: (person: string, idea?: DeepenIdea | null) => void; notice: (t: string) => void;
}) {
  const [logged, setLogged] = useState<string | null>(null);
  const [idea, setIdea] = useState('');
  const [moment, setMoment] = useState<Moment | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [editNote, setEditNote] = useState<string | null>(null);
  const [shownFor, setShownFor] = useState(id);
  if (id !== shownFor) { setShownFor(id); setLogged(null); setConfirm(false); setEditNote(null); setIdea(''); }

  const fv = m.friends.find((v) => v.p.id === id) ?? null;
  const nv = [...m.newcomers, ...m.faded].find((v) => v.p.id === id) ?? null;
  const p: Person | null = fv?.p ?? nv?.p ?? m.persons.find((x) => x.id === id) ?? null;
  const st = fv?.st ?? nv?.st ?? null;
  const moments = p ? m.moments.filter((mo) => mo.people?.includes(p.id)).sort((x, y) => (y.date + (y.at ?? '')).localeCompare(x.date + (x.at ?? ''))) : [];
  const loggedMoment = logged ? f.moments.items?.find((mo) => mo.id === logged) ?? null : null;
  const saved = p ? (f.ideas.items ?? []).filter((i) => i.person === p.id && i.kind === 'plan') : [];
  const plans = p ? plansWith(m, p.id) : [];
  const first = p ? firstName(p) : '';
  const log = (kind: Kind) => { if (p) setLogged(a.log(p, kind)); };

  return (
    <Screen open={open} onClose={onClose} title={p?.name ?? ''}>
      {!p || !st ? <Text style={t.small}>This person is no longer in Friends.</Text> : (
        <>
          <View style={s.head}>
            <Avatar person={p} stage={st.stage} size={56} />
            <View style={s.flex}>
              {fv ? (
                <>
                  <Text style={t.strong}>{roleText(p) ?? 'Friend'}</Text>
                  <Text style={t.small}>{lastLine(st)}</Text>
                </>
              ) : (
                <>
                  <Text style={t.strong}>{p.where ? `Met at ${p.where}` : 'Met'} {p.met ? whenAgo(p.met) : ''}</Text>
                  <Text style={t.small}>{st.meetings > 1 ? `Seen ${st.meetings} times, last ${whenAgo(st.last?.date ?? p.met ?? m.ref)}` : 'Seen once so far'}</Text>
                </>
              )}
            </View>
          </View>

          {nv ? (
            <Stepper stage={st.stage} />
          ) : null}

          {fv ? (
            <View style={s.row}>
              <Button label="Met today" kind="accent" onPress={() => log('meet')} wrap={s.flex} />
              <Button label="Talked today" kind="quiet" onPress={() => log('call')} wrap={s.flex} />
            </View>
          ) : (
            <View style={s.gap8}>
              <Button label="Saw them again today" kind="accent" onPress={() => setLogged(a.sawAgain(p))} />
              <View style={s.row}>
                <Button label="Make a plan" kind="quiet" small onPress={() => onPlan(p.id)} wrap={s.flex} />
                {st.stage === 'again' ? <Button label="We're friends now" kind="soft" small onPress={() => a.makeFriend(p)} wrap={s.flex} /> : null}
              </View>
            </View>
          )}
          {loggedMoment ? <LogDetail moment={loggedMoment} a={a} onClose={() => setLogged(null)} indent={false} /> : null}

          {fv?.usual ? <UsualRow v={fv} indent={false} onLog={() => setLogged(a.log(p, 'meet', { act: fv.usual!.act }))} /> : null}
          {fv?.rhythm?.label ? <Text style={t.small}>Your rhythm with {first}: {fv.rhythm.label.charAt(0).toLowerCase()}{fv.rhythm.label.slice(1)}</Text> : null}

          {nv ? (
            <Section title="Next time">
              <Text style={t.body}>{visitPhrase(nv.place, nv.visit) ? `${visitPhrase(nv.place, nv.visit)}.` : 'Pick where you see them, and the page will say when you are next there.'}</Text>
              {editNote != null ? (
                <View style={s.noteRow}>
                  <View style={s.flex}><Field value={editNote} onChangeText={setEditNote} placeholder="One thing to remember" autoFocus maxLength={140}
                    onSubmit={() => { a.patchPerson(p, { note: editNote.trim() || null }); setEditNote(null); }} /></View>
                  <Button label="Save" kind="quiet" small onPress={() => { a.patchPerson(p, { note: editNote.trim() || null }); setEditNote(null); }} />
                </View>
              ) : (
                <Row title={p.note ? `You noted: ${p.note}` : 'Add one thing to remember'} onPress={() => setEditNote(p.note ?? '')} chevron
                  label={p.note ? `You noted: ${p.note}. Edit` : 'Add one thing to remember'} />
              )}
              {m.places.length ? (
                <View style={s.gap8}>
                <Text style={t.label}>Where you see {first}</Text>
                <View style={s.chips}>
                  {m.places.map((pv) => (
                    <Chip key={pv.place.id} label={pv.place.name} selected={p.place === pv.place.id}
                      onPress={() => a.patchPerson(p, p.place === pv.place.id ? { place: null } : { place: pv.place.id, where: pv.place.name })} />
                  ))}
                </View>
                </View>
              ) : null}
            </Section>
          ) : null}

          {fv ? <DeepenCard v={fv} ideas={deepenIdeas(fv, f.ideas.items ?? [], bank?.ideas ?? [])} onPlan={(d) => onPlan(p.id, d)} compact /> : null}

          <Section title="Plans" action="New" onAction={() => onPlan(p.id)} gap={0}>
            {plans.length ? plans.map((pl) => <PlanRow key={pl.id} plan={pl} m={m} self={p.id} />)
              : <Text style={[t.small, s.pad]}>Nothing planned with {first} yet.</Text>}
          </Section>

          {fv ? (
            <Section title={`Ideas for ${first}`} gap={0}>
              {saved.map((i) => <Row key={i.id} title={i.title} done={!!i.done} onToggle={() => a.toggleIdea(i.id, !i.done)} label={`${i.title}${i.done ? ', done' : ''}`} />)}
              <View style={[s.noteRow, s.pad]}>
                <View style={s.flex}><Field value={idea} onChangeText={setIdea} placeholder="Something to do together one day" maxLength={80}
                  onSubmit={() => { if (idea.trim()) { a.saveIdea(p, idea); setIdea(''); } }} /></View>
                <Button label="Save" kind="quiet" small disabled={!idea.trim()} onPress={() => { a.saveIdea(p, idea); setIdea(''); }} />
              </View>
            </Section>
          ) : null}

          <Section title="Time together" gap={0}>
            {moments.length ? moments.slice(0, 20).map((mo) => <MomentRow key={mo.id} mo={mo} onPress={() => setMoment(mo)} />)
              : <Text style={[t.small, s.pad]}>Nothing logged yet. The buttons above keep it to one tap.</Text>}
          </Section>

          {fv ? <Section title="Somewhere else">
            {fv ? (
              <View style={s.row}>
                <Button label="Move to Family" kind="quiet" small onPress={() => { a.moveTo(p, 'family'); onClose(); }} wrap={s.flex} />
                <Button label="Move to Romance" kind="quiet" small onPress={() => { a.moveTo(p, 'romance'); onClose(); }} wrap={s.flex} />
              </View>
            ) : null}
            {fv && p.friend_since ? <Button label="Back to new people" kind="quiet" small onPress={() => a.stillGettingToKnow(p)} /> : null}
          </Section> : null}
          {nv ? (confirm ? (
              <View style={s.gap8}>
                <Text style={t.small}>This removes {first} and the times you logged with only them.</Text>
                <View style={s.row}>
                  <Button label="Remove" kind="danger" small onPress={() => { void a.forget(p); onClose(); }} wrap={s.flex} />
                  <Button label="Keep" kind="quiet" small onPress={() => setConfirm(false)} wrap={s.flex} />
                </View>
              </View>
            ) : <Button label={`Remove ${first}`} kind="quiet" small onPress={() => setConfirm(true)} />) : null}
        </>
      )}
      <MomentSheet moment={moment} onClose={() => setMoment(null)} f={f} a={a} notice={notice} />
    </Screen>
  );
}

/** One moment: what they did, a line, a photo, or remove it. */
function MomentSheet({ moment, onClose, f, a, notice }: { moment: Moment | null; onClose: () => void; f: Friends; a: Actions; notice: (t: string) => void }) {
  const live = moment ? f.moments.items?.find((x) => x.id === moment.id) ?? moment : null;
  const [line, setLine] = useState('');
  const [seen, setSeen] = useState<string | null>(null);
  if ((live?.id ?? null) !== seen) { setSeen(live?.id ?? null); setLine(live?.line ?? ''); }
  return (
    <Sheet open={!!moment} onClose={onClose} title={live ? `${live.title ?? 'Time together'}, ${inLine(dayLabel(live.date))}` : ''}>
      {live ? (
        <>
          <View style={s.chips}>
            {(live.kind ?? 'meet') === 'meet' ? LOG_ACTS.map((act) => (
              <Chip key={act} label={ACT_CHIP[act]} selected={live.act === act} onPress={() => a.detail(live.id, { act: live.act === act ? null : act })} />
            )) : (['call', 'chat'] as const).map((k) => <Chip key={k} label={k === 'call' ? 'A call' : 'A chat'} selected={live.kind === k} onPress={() => a.detail(live.id, { kind: k })} />)}
          </View>
          <Field label="A line" value={line} onChangeText={setLine} placeholder="One line to remember it by" maxLength={200} onSubmit={() => a.detail(live.id, { line: line.trim() || null })} />
          {live.photo ? <Image source={fileSource(live.photo)} style={s.photo} contentFit="cover" accessibilityLabel="Photo from this moment" /> : null}
          {canPickPhoto && !live.photo ? (
            <Button label="Add a photo" kind="quiet" icon={<Icon name="camera" size={18} />}
              onPress={async () => { const ph = await pickPhoto(); if (ph) void a.photo(live.id, ph); }} />
          ) : null}
          <Button label="Save" onPress={() => { a.detail(live.id, { line: line.trim() || null }); notice('Saved'); onClose(); }} />
          <Button label="Remove this moment" kind="danger" onPress={() => { a.undoLog(live.id); onClose(); }} />
        </>
      ) : null}
    </Sheet>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  gap8: { gap: SP[8] },
  row: { flexDirection: 'row', gap: SP[8] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SP[8] },
  stepper: { flexDirection: 'row', alignItems: 'center' },
  step: { flexDirection: 'row', alignItems: 'center', gap: SP[8] },
  stepLine: { width: 20, height: 1, backgroundColor: SURF.line, marginHorizontal: SP[4] },
  stepDot: { width: 8, height: 8, borderRadius: 4, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.32)' },
  head: { flexDirection: 'row', alignItems: 'center', gap: SP[16] },
  pad: { paddingVertical: SP[8] },
  noteRow: { flexDirection: 'row', alignItems: 'flex-end', gap: SP[8] },
  thumb: { width: 40, height: 40, borderRadius: 8 },
  photo: { width: '100%', aspectRatio: 4 / 3, borderRadius: 16, backgroundColor: C.raised },
});
