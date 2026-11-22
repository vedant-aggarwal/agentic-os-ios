import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { C } from '@/theme';
import { Button, Chip, Empty, Field, Icon, Press, Row, Screen, Section, Sheet, SP, t, useAspect } from '@/aspects/kit';
import type { Actions } from './actions';
import { count, firstName, whenAgo, whenAhead, type Person, type Place, type SeenPlace, type Week } from './data';
import type { Model, NewView, Nudge } from './model';
import { Avatar, PathTrack } from './parts';

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ORDER = [1, 2, 3, 4, 5, 6, 0];
export function daysText(days?: number[] | null) {
  if (!days?.length) return null;
  const set = new Set(days);
  if (set.size === 7) return 'Every day';
  if (set.size === 6 && !set.has(0)) return 'Monday to Saturday';
  if (set.size === 5 && [1, 2, 3, 4, 5].every((d) => set.has(d))) return 'Weekdays';
  return ORDER.filter((d) => set.has(d)).map((d) => WD[d]).join(', ');
}

/** One second-meeting nudge: the person, where and when he will see them next, and the one action. */
export function NudgeRow({ n, a, onOpen, onPlan }: { n: Nudge; a: Actions; onOpen: (p: Person) => void; onPlan: (p: Person) => void }) {
  const p = n.v.p;
  const right = n.kind === 'hello' ? <Button label="Saw again" kind="soft" small onPress={() => a.sawAgain(p)} />
    : n.kind === 'invite' ? <Button label="Plan it" kind="soft" small onPress={() => onPlan(p)} />
      : <Button label="Yes" kind="soft" small onPress={() => a.makeFriend(p)} />;
  return <Row title={n.title} sub={n.sub} onPress={() => onOpen(p)} label={`${n.title}. ${n.sub}`} left={<Avatar person={p} stage={n.v.st.stage} />} right={right} />;
}

/** Someone he just met: a first name, where, one detail. One tap saves. */
export function AddSomeone({ open, onClose, m, week, a, notice }: {
  open: boolean; onClose: () => void; m: Model; week: Week | null; a: Actions; notice: (t: string) => void;
}) {
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [pick, setPick] = useState<string | null | undefined>(undefined); // undefined: not chosen yet, use where he is now
  const [busy, setBusy] = useState(false);
  const stored = m.places.map((v) => v.place);
  const suggested = week?.suggested ?? [];
  const choices: { id: string; name: string; place: Place | SeenPlace }[] = [
    ...stored.map((p) => ({ id: p.id, name: p.name, place: p as Place | SeenPlace })),
    ...suggested.map((s) => ({ id: `cal:${s.key}`, name: s.name, place: s as Place | SeenPlace })),
  ];
  const chosen = pick === undefined ? (week?.here ?? null) : pick;
  const reset = () => { setName(''); setNote(''); setPick(undefined); setBusy(false); };
  const save = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    const c = choices.find((x) => x.id === chosen) ?? null;
    const id = await a.addSomeone({ name, place: c?.place ?? null, note });
    setBusy(false);
    if (!id) return;
    const first = name.trim().split(/\s+/)[0];
    notice(c ? `Added. Next time you are at ${c.name}, say hello to ${first}.` : `Added ${first}.`);
    reset();
    onClose();
  };
  return (
    <Sheet open={open} onClose={() => { reset(); onClose(); }} title="Someone you just met">
      <Field label="First name" value={name} onChangeText={setName} placeholder="Their name" autoFocus={open} maxLength={40} onSubmit={save} />
      <View style={s.gap8}>
        <Text style={t.label}>Where</Text>
        <View style={s.chips}>
          {choices.map((c) => <Chip key={c.id} label={c.name} selected={chosen === c.id} onPress={() => setPick(chosen === c.id ? null : c.id)} />)}
          {!choices.length ? <Text style={t.small}>Your weekly places will show here.</Text> : null}
        </View>
      </View>
      <Field label="One thing to remember" value={note} onChangeText={setNote} placeholder="What you talked about, what they do" maxLength={140} onSubmit={save} />
      <Button label="Add" onPress={save} disabled={!name.trim()} busy={busy} />
    </Sheet>
  );
}

/** Add or change a weekly place: a name and the days he is usually there. */
export function PlaceSheet({ open, onClose, place, a }: { open: boolean; onClose: () => void; place: Place | null; a: Actions }) {
  const [name, setName] = useState(place?.name ?? '');
  const [days, setDays] = useState<number[]>(place?.days ?? []);
  const [seen, setSeen] = useState(place?.id ?? null);
  if ((place?.id ?? null) !== seen) { setSeen(place?.id ?? null); setName(place?.name ?? ''); setDays(place?.days ?? []); }
  const save = async () => {
    if (!name.trim()) return;
    if (place) a.editPlace(place.id, { name: name.trim(), days: days.length ? days : null });
    else await a.addPlace(name, days);
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title={place ? place.name : 'A place you go every week'}>
      <Field label="Name" value={name} onChangeText={setName} placeholder="Gym, college, a cafe" autoFocus={open && !place} maxLength={40} />
      <View style={s.gap8}>
        <Text style={t.label}>Days you are usually there</Text>
        <View style={s.chips}>
          {ORDER.map((d) => (
            <Chip key={d} label={WD[d]} selected={days.includes(d)} onPress={() => setDays((x) => (x.includes(d) ? x.filter((y) => y !== d) : [...x, d]))} />
          ))}
        </View>
        {place?.key ? <Text style={t.caption}>Your calendar also tells when you are next there.</Text> : null}
      </View>
      <Button label="Save" onPress={save} disabled={!name.trim()} />
      {place ? <Button label="Remove this place" kind="danger" onPress={() => { a.removePlace(place.id); onClose(); }} /> : null}
    </Sheet>
  );
}

function newSub(v: NewView) {
  const where = v.p.where ? `${v.p.where}, ` : '';
  if (v.st.stage === 'met') return `${where}met ${whenAgo(v.p.met ?? v.st.last?.date ?? '')}`.replace(/^./, (c) => c.toUpperCase());
  return `${where}${count(v.st.meetings, true)} times, last ${whenAgo(v.st.last?.date ?? '')}`.replace(/^./, (c) => c.toUpperCase());
}

/** Everyone he is getting to know, the places where they are, and the places his calendar suggests. */
export function NewPeopleScreen({ open, onClose, m, week, a, onPerson, onAdd, onPlan }: {
  open: boolean; onClose: () => void; m: Model; week: Week | null; a: Actions;
  onPerson: (p: Person) => void; onAdd: () => void; onPlan: (p: Person) => void;
}) {
  const { color } = useAspect();
  const [showFaded, setShowFaded] = useState(false);
  const [place, setPlace] = useState<Place | null>(null);
  const [placeOpen, setPlaceOpen] = useState(false);
  const again = m.newcomers.filter((v) => v.st.stage === 'again');
  const met = m.newcomers.filter((v) => v.st.stage === 'met');
  const nudgeOf = (id: string) => m.nudges.find((n) => n.v.p.id === id);
  const row = (v: NewView) => {
    const n = nudgeOf(v.p.id);
    return n ? <NudgeRow key={v.p.id} n={n} a={a} onOpen={onPerson} onPlan={onPlan} />
      : <Row key={v.p.id} title={v.p.name} sub={newSub(v)} onPress={() => onPerson(v.p)} left={<Avatar person={v.p} stage={v.st.stage} />} chevron />;
  };
  return (
    <Screen open={open} onClose={onClose} title="New people">
      <PathTrack groups={m.groups} onPerson={onPerson} onAdd={onAdd} onStop={() => {}} />
      <Button label="I just met someone" kind="soft" onPress={onAdd} icon={<Icon name="plus" size={18} color={color} />} />
      {!m.newcomers.length ? (
        <Empty title="Nobody new yet" body="Add someone right after you meet them. The second hello is the step that counts, and this page will remind you where." />
      ) : null}
      {again.length ? <Section title="Met again" gap={0}>{again.map(row)}</Section> : null}
      {met.length ? <Section title="Met once" gap={0}>{met.map(row)}</Section> : null}

      <Section title="Your weekly places" action="Add" onAction={() => { setPlace(null); setPlaceOpen(true); }} gap={0}>
        {m.places.map((pv) => {
          const next = pv.visits[0] ?? null;
          const who = pv.people.map((x) => firstName(x.p));
          const when = next ? `${whenAhead(next.date).replace(/^./, (c) => c.toUpperCase())}${next.at ? ` at ${next.at}` : ''}.` : daysText(pv.place.days) ? `${daysText(pv.place.days)}.` : '';
          const sub = `${when}${when ? ' ' : ''}${who.length ? `You know ${who.length < 3 ? who.join(' and ') : `${who.slice(0, 2).join(', ')} and ${count(who.length - 2, true)} more`} here.` : 'Nobody here yet.'}`;
          return <Row key={pv.place.id} title={pv.place.name} sub={sub} chevron label={`${pv.place.name}. ${sub}`} onPress={() => { setPlace(pv.place); setPlaceOpen(true); }} />;
        })}
        {(week?.suggested ?? []).map((sp) => (
          <Row key={sp.key} title={sp.name} sub={`In your calendar ${daysText(sp.days)?.toLowerCase() ?? 'most weeks'}`}
            label={`${sp.name}, suggested from your calendar`} right={<Button label="Keep" kind="soft" small onPress={() => void a.keepPlace(sp)} />} />
        ))}
        {!m.places.length && !(week?.suggested ?? []).length ? (
          <Text style={[t.small, s.pad]}>Add the gym, college or wherever you go every week. Friendships form in places you keep going back to.</Text>
        ) : null}
      </Section>

      {m.faded.length ? (
        <View style={s.gap8}>
          <Press label={showFaded ? 'Hide people you have not seen in a while' : 'Show people you have not seen in a while'} onPress={() => setShowFaded((x) => !x)} feel="tick" style={s.fadedHead}>
            <Text style={t.small}>{count(m.faded.length)} {m.faded.length === 1 ? 'person' : 'people'} you have not seen in a while</Text>
            <Icon name={showFaded ? 'up' : 'down'} size={14} color={C.faint} />
          </Press>
          {showFaded ? m.faded.map((v) => (
            <Row key={v.p.id} title={v.p.name} sub={newSub(v)} onPress={() => onPerson(v.p)} left={<Avatar person={v.p} stage={v.st.stage} />}
              right={<Button label="Saw again" kind="quiet" small onPress={() => a.sawAgain(v.p)} />} />
          )) : null}
        </View>
      ) : null}
      <PlaceSheet open={placeOpen} onClose={() => setPlaceOpen(false)} place={place} a={a} />
    </Screen>
  );
}


const s = StyleSheet.create({
  gap8: { gap: SP[8] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SP[8] },
  pad: { paddingVertical: SP[8] },
  fadedHead: { flexDirection: 'row', alignItems: 'center', gap: SP[8], minHeight: 44 },
});
