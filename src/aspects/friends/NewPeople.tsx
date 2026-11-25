import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { C, F } from '@/theme';
import { Block, Button, Chip, Field, Group, Icon, Item, Lead, Press, Sheet, t, useAspect } from '@/aspects/kit';
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
  const names = ORDER.filter((d) => set.has(d)).map((d) => WD[d]);
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

/** What a nudge's one button says and does. */
function nudgeAction(n: Nudge, a: Actions, onPlan: (p: Person) => void) {
  const p = n.v.p;
  if (n.kind === 'hello') return { label: 'Saw again', run: () => a.sawAgain(p) };
  if (n.kind === 'invite') return { label: 'Plan it', run: () => onPlan(p) };
  return { label: 'Yes, friends now', run: () => a.makeFriend(p) };
}

/** One second-meeting nudge as a row: the person, where and when he will see them next, and the one action. */
export function NudgeRow({ n, a, onOpen, onPlan }: { n: Nudge; a: Actions; onOpen: (p: Person) => void; onPlan: (p: Person) => void }) {
  const act = nudgeAction(n, a, onPlan);
  return (
    <Item title={n.title} sub={n.sub} onPress={() => onOpen(n.v.p)} label={`${n.title}. ${n.sub}. Open`} left={<Avatar person={n.v.p} stage={n.v.st.stage} />}
      action={<Button label={n.kind === 'friend' ? 'Yes' : act.label} kind="quiet" small onPress={act.run} />} />
  );
}

/** The first nudge as the New tab's lead. */
function NudgeLead({ n, a, onOpen, onPlan }: { n: Nudge; a: Actions; onOpen: (p: Person) => void; onPlan: (p: Person) => void }) {
  const { color } = useAspect();
  const act = nudgeAction(n, a, onPlan);
  const p = n.v.p;
  return (
    <Lead>
      <Press label={`${p.name}. Open`} onPress={() => onOpen(p)} style={s.who} scale={0.98}>
        <Avatar person={p} stage={n.v.st.stage} size={44} />
        <View style={s.flex}>
          <Text style={[t.footnote, { color }]}>{n.kind === 'friend' ? 'A friend now?' : n.kind === 'hello' ? 'The second hello' : 'A small plan'}</Text>
          <Text numberOfLines={1} style={t.footnote}>{newSub(n.v)}</Text>
        </View>
        <Icon name="right" size={14} color={C.faint} />
      </Press>
      <View style={s.gap4}>
        <Text style={t.title3}>{n.title}</Text>
        <Text style={t.subhead}>{n.sub}</Text>
      </View>
      <Button label={act.label} kind="accent" onPress={act.run} />
    </Lead>
  );
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
    ...suggested.map((sp) => ({ id: `cal:${sp.key}`, name: sp.name, place: sp as Place | SeenPlace })),
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
        <Text style={[t.footnote, s.medium]}>Where</Text>
        <View style={s.chips}>
          {choices.map((c) => <Chip key={c.id} label={c.name} selected={chosen === c.id} onPress={() => setPick(chosen === c.id ? null : c.id)} />)}
          {!choices.length ? <Text style={t.footnote}>Your weekly places will show here.</Text> : null}
        </View>
      </View>
      <Field label="One thing to remember" value={note} onChangeText={setNote} placeholder="What you talked about, what they do" maxLength={140} onSubmit={save} />
      <Button label="Add" kind="accent" onPress={save} disabled={!name.trim()} busy={busy} />
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
        <Text style={[t.footnote, s.medium]}>Days you are usually there</Text>
        <View style={s.chips}>
          {ORDER.map((d) => (
            <Chip key={d} label={WD[d]} selected={days.includes(d)} onPress={() => setDays((x) => (x.includes(d) ? x.filter((y) => y !== d) : [...x, d]))} />
          ))}
        </View>
        {place?.key ? <Text style={t.micro}>Your calendar also tells when you are next there.</Text> : null}
      </View>
      <Button label="Save" kind="accent" onPress={save} disabled={!name.trim()} />
      {place ? <Button label="Remove this place" kind="danger" onPress={() => { a.removePlace(place.id); onClose(); }} /> : null}
    </Sheet>
  );
}

export function newSub(v: NewView) {
  const where = v.p.where ? `${v.p.where}, ` : '';
  if (v.st.stage === 'met') return `${where}met ${whenAgo(v.p.met ?? v.st.last?.date ?? '')}`.replace(/^./, (c) => c.toUpperCase());
  const times = v.st.meetings === 2 ? 'met twice' : `met ${count(v.st.meetings, true)} times`;
  return `${where}${times}, last ${whenAgo(v.st.last?.date ?? '')}`.replace(/^./, (c) => c.toUpperCase());
}

/** The people he is getting to know: the second hello first, the path, everyone by stage, and his weekly places. */
export function NewTab({ m, week, a, onPerson, onAdd, onPlan }: {
  m: Model; week: Week | null; a: Actions; onPerson: (p: Person) => void; onAdd: () => void; onPlan: (p: Person) => void;
}) {
  const { color } = useAspect();
  const [showFaded, setShowFaded] = useState(false);
  const [place, setPlace] = useState<Place | null>(null);
  const [placeOpen, setPlaceOpen] = useState(false);
  const top = m.nudges[0] ?? null;
  const rest = m.newcomers.filter((v) => v.p.id !== top?.v.p.id);
  const again = rest.filter((v) => v.st.stage === 'again');
  const met = rest.filter((v) => v.st.stage === 'met');
  const nudgeOf = (id: string) => m.nudges.find((n) => n.v.p.id === id);
  const row = (v: NewView) => {
    const n = nudgeOf(v.p.id);
    return n ? <NudgeRow key={v.p.id} n={n} a={a} onOpen={onPerson} onPlan={onPlan} />
      : <Item key={v.p.id} title={v.p.name} sub={newSub(v)} onPress={() => onPerson(v.p)} left={<Avatar person={v.p} stage={v.st.stage} />} chevron />;
  };
  const suggested = week?.suggested ?? [];
  return (
    <>
      {top ? <NudgeLead n={top} a={a} onOpen={onPerson} onPlan={onPlan} /> : null}
      <Block title="Your circle" sub={m.headline}>
        <Group pad>
          <PathTrack groups={m.groups} onPerson={onPerson} onAdd={onAdd} />
        </Group>
        <Button label="I just met someone" kind={top ? 'soft' : 'accent'} onPress={onAdd} icon={<Icon name="plus" size={18} color={top ? color : '#14161C'} />} />
      </Block>
      {!m.newcomers.length ? (
        <Group pad>
          <Text style={t.callout}>Nobody new yet</Text>
          <Text style={t.footnote}>Add someone right after you meet them. The second hello is the step that counts, and this page will say where.</Text>
        </Group>
      ) : null}
      {again.length ? <Block title="Met again"><Group inset={68}>{again.map(row)}</Group></Block> : null}
      {met.length ? <Block title="Met once"><Group inset={68}>{met.map(row)}</Group></Block> : null}

      <Block title="Your weekly places" action="Add" onAction={() => { setPlace(null); setPlaceOpen(true); }}>
        {m.places.length || suggested.length ? (
          <Group>
            {m.places.map((pv) => {
              const next = pv.visits[0] ?? null;
              const who = pv.people.map((x) => firstName(x.p));
              const when = next ? `${whenAhead(next.date).replace(/^./, (c) => c.toUpperCase())}${next.at ? ` at ${next.at}` : ''}.` : daysText(pv.place.days) ? `${daysText(pv.place.days)}.` : '';
              const sub = `${when}${when ? ' ' : ''}${who.length ? `You know ${who.length < 3 ? who.join(' and ') : `${who.slice(0, 2).join(', ')} and ${count(who.length - 2, true)} more`} here.` : 'Nobody here yet.'}`;
              return <Item key={pv.place.id} title={pv.place.name} sub={sub} chevron label={`${pv.place.name}. ${sub}`} onPress={() => { setPlace(pv.place); setPlaceOpen(true); }} />;
            })}
            {suggested.map((sp) => (
              <Item key={sp.key} title={sp.name} sub={daysText(sp.days) ? `In your calendar on ${daysText(sp.days)}` : 'In your calendar most weeks'}
                label={`${sp.name}, suggested from your calendar`} action={<Button label="Keep" kind="quiet" small onPress={() => void a.keepPlace(sp)} />} />
            ))}
          </Group>
        ) : (
          <Group pad>
            <Text style={t.footnote}>Add the gym, college or wherever you go every week. Friendships form in places you keep going back to.</Text>
          </Group>
        )}
      </Block>

      {m.faded.length ? (
        <View style={s.gap8}>
          <Press label={showFaded ? 'Hide people you have not seen in a while' : 'Show people you have not seen in a while'} onPress={() => setShowFaded((x) => !x)} feel="tick" style={s.fadedHead}>
            <Text style={t.subhead}>{`${count(m.faded.length)} ${m.faded.length === 1 ? 'person' : 'people'} you have not seen in a while`}</Text>
            <Icon name={showFaded ? 'up' : 'down'} size={14} color={C.faint} />
          </Press>
          {showFaded ? (
            <Group inset={68}>
              {m.faded.map((v) => (
                <Item key={v.p.id} title={v.p.name} sub={newSub(v)} onPress={() => onPerson(v.p)} left={<Avatar person={v.p} stage={v.st.stage} />}
                  action={<Button label="Saw again" kind="quiet" small onPress={() => a.sawAgain(v.p)} />} />
              ))}
            </Group>
          ) : null}
        </View>
      ) : null}
      <PlaceSheet open={placeOpen} onClose={() => setPlaceOpen(false)} place={place} a={a} />
    </>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  gap4: { gap: 4 },
  gap8: { gap: 8 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  medium: { fontFamily: F.medium },
  fadedHead: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
});
