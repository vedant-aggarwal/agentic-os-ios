import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { C, F } from '@/theme';
import { Block, Button, Chip, dayLabel, Field, Group, Icon, Item, R, Screen, Sheet, SURF, t, undoable, useAspect } from '@/aspects/kit';
import { fileSource } from '@/lib/mod';
import type { Actions } from './actions';
import { DeepenCard, LogDetail, UsualRow } from './Circle';
import { ACT_CHIP, firstName, inLine, lastLine, LOG_ACTS, roleText, whenAgo, type Bank, type Friends, type Kind, type Moment, type Person } from './data';
import { PlanRow } from './LeadPlan';
import { deepenIdeas, plansWith, visitPhrase, type DeepenIdea, type Model } from './model';
import { Avatar, canPickPhoto, CheckRow, pickPhoto } from './parts';

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
          <Text style={[t.footnote, i === at ? { color } : i > at ? { color: C.faint } : null]}>{x.label}</Text>
        </View>
      ))}
    </View>
  );
}

function MomentRow({ mo, onPress }: { mo: Moment; onPress: () => void }) {
  const when = `${dayLabel(mo.date)}${mo.source === 'calendar' ? ', from your calendar' : ''}`;
  const sub = mo.line ? `${when}\n${mo.line}` : when;
  return (
    <Item title={mo.title ?? 'Time together'} sub={sub} onPress={onPress} label={`${mo.title ?? 'Time together'}, ${when}${mo.line ? `. ${mo.line}` : ''}`}
      right={mo.photo ? <Image source={fileSource(mo.photo)} style={s.thumb} contentFit="cover" accessibilityLabel="Photo" /> : undefined} />
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
  const [moving, setMoving] = useState(false);
  const { color } = useAspect();
  const [editNote, setEditNote] = useState<string | null>(null);
  const [shownFor, setShownFor] = useState(id);
  if (id !== shownFor) { setShownFor(id); setLogged(null); setConfirm(false); setMoving(false); setEditNote(null); setIdea(''); }

  const fv = m.friends.find((v) => v.p.id === id) ?? null;
  const nv = [...m.newcomers, ...m.faded].find((v) => v.p.id === id) ?? null;
  const p: Person | null = fv?.p ?? nv?.p ?? m.persons.find((x) => x.id === id) ?? null;
  const st = fv?.st ?? nv?.st ?? null;
  const moments = p ? m.moments.filter((mo) => mo.people?.includes(p.id)).sort((x, y) => (y.date + (y.at ?? '')).localeCompare(x.date + (x.at ?? ''))) : [];
  const loggedMoment = logged ? f.moments.items?.find((mo) => mo.id === logged) ?? null : null;
  const saved = p ? (f.ideas.items ?? []).filter((i) => i.person === p.id && i.kind === 'plan') : [];
  const plans = p ? plansWith(m, p.id) : [];
  const first = p ? firstName(p) : '';
  const talkFirst = fv?.rhythm?.mode === 'talk';
  const log = (kind: Kind) => { if (p) setLogged(a.log(p, kind)); };
  const saveIdea = () => { if (p && idea.trim()) { a.saveIdea(p, idea); setIdea(''); } };
  const saveNote = () => { if (p && editNote != null) { a.patchPerson(p, { note: editNote.trim() || null }); setEditNote(null); } };
  const toggleIdea = (ideaId: string, title: string, done: boolean) => {
    a.toggleIdea(ideaId, done);
    if (done) undoable(`${title}, done`, () => a.toggleIdea(ideaId, false));
  };

  return (
    <Screen open={open} onClose={onClose} title={p?.name ?? ''}>
      {!p || !st ? <Text style={t.subhead}>This person is no longer in Friends.</Text> : (
        <>
          <View style={s.head}>
            <Avatar person={p} stage={st.stage} size={64} />
            <View style={s.flex}>
              {fv ? (
                <>
                  <Text style={t.headline}>{roleText(p) ?? 'Friend'}</Text>
                  <Text style={t.subhead}>{lastLine(st)}</Text>
                </>
              ) : (
                <>
                  <Text style={t.headline}>{`${p.where ? `Met at ${p.where}` : 'Met'}${p.met ? ` ${whenAgo(p.met)}` : ''}`}</Text>
                  <Text style={t.subhead}>{st.meetings > 1 ? `Seen ${st.meetings} times, last ${whenAgo(st.last?.date ?? p.met ?? m.ref)}` : 'Seen once so far'}</Text>
                </>
              )}
            </View>
          </View>

          {nv ? <Stepper stage={st.stage} /> : null}

          {fv ? (
            // the way he keeps up with this friend (the rhythm he set) comes first and is the lit button
            <View style={s.row}>
              {(talkFirst ? ['talk', 'meet'] as const : ['meet', 'talk'] as const).map((k, i) => {
                const done = k === 'meet' ? fv.todayMeet : fv.todayTalk;
                const label = k === 'meet' ? 'Met today' : done?.kind === 'chat' ? 'Messaged today' : 'Talked today';
                return (
                  <Button key={k} label={label} kind={done ? 'soft' : i === 0 ? 'accent' : 'quiet'} onPress={() => log(k === 'meet' ? 'meet' : 'call')} wrap={s.flex}
                    icon={done ? <Icon name="check" size={16} color={color} /> : undefined} />
                );
              })}
            </View>
          ) : (
            <View style={s.gap12}>
              <Button label="Saw them again today" kind="accent" onPress={() => setLogged(a.sawAgain(p))} />
              <View style={s.row}>
                <Button label="Make a plan" kind="quiet" small onPress={() => onPlan(p.id)} wrap={s.flex} />
                {st.stage === 'again' ? <Button label="We're friends now" kind="soft" small onPress={() => a.makeFriend(p)} wrap={s.flex} /> : null}
              </View>
            </View>
          )}
          {loggedMoment ? <LogDetail moment={loggedMoment} a={a} onClose={() => setLogged(null)} framed /> : null}

          {fv?.usual ? <UsualRow v={fv} framed onLog={() => setLogged(a.log(p, 'meet', { act: fv.usual!.act }))} /> : null}
          {fv?.rhythm?.label ? <Text style={t.footnote}>{`Your rhythm with ${first}: ${fv.rhythm.label.charAt(0).toLowerCase()}${fv.rhythm.label.slice(1)}`}</Text> : null}

          {nv ? (
            <Block title="Next time">
              <Group>
                <Item title={visitPhrase(nv.place, nv.visit) ? `${visitPhrase(nv.place, nv.visit)}.` : 'Pick where you see them below, and this page will say when you are next there.'} lines={3} />
                {editNote == null ? (
                  <Item title={p.note ? `You noted: ${p.note}` : 'Add one thing to remember'} onPress={() => setEditNote(p.note ?? '')} chevron lines={3}
                    label={p.note ? `You noted: ${p.note}. Edit` : 'Add one thing to remember'} />
                ) : null}
              </Group>
              {editNote != null ? (
                <View style={s.noteRow}>
                  <View style={s.flex}><Field value={editNote} onChangeText={setEditNote} placeholder="One thing to remember" autoFocus maxLength={140} onSubmit={saveNote} /></View>
                  <Button label="Save" kind="quiet" small onPress={saveNote} />
                </View>
              ) : null}
              {m.places.length ? (
                <View style={s.gap8}>
                  <Text style={[t.footnote, s.medium]}>{`Where you see ${first}`}</Text>
                  <View style={s.chips}>
                    {m.places.map((pv) => (
                      <Chip key={pv.place.id} label={pv.place.name} selected={p.place === pv.place.id}
                        onPress={() => a.patchPerson(p, p.place === pv.place.id ? { place: null } : { place: pv.place.id, where: pv.place.name })} />
                    ))}
                  </View>
                </View>
              ) : null}
            </Block>
          ) : null}

          {fv ? <DeepenCard v={fv} ideas={deepenIdeas(fv, f.ideas.items ?? [], bank?.ideas ?? []).filter((d) => !d.saved)} onPlan={(d) => onPlan(p.id, d)} compact /> : null}

          <Block title="Plans" action="New" onAction={() => onPlan(p.id)}>
            {plans.length ? <Group>{plans.map((pl) => <PlanRow key={pl.id} plan={pl} m={m} self={p.id} />)}</Group>
              : <Group pad><Text style={t.footnote}>{`Nothing planned with ${first} yet.`}</Text></Group>}
          </Block>

          {fv ? (
            <Block title={`Ideas for ${first}`}>
              {saved.length ? (
                <Group inset={52}>
                  {saved.map((i) => <CheckRow key={i.id} title={i.title} done={!!i.done} onPress={() => toggleIdea(i.id, i.title, !i.done)} label={`${i.title}${i.done ? ', done. Tap to undo' : '. Mark done'}`} />)}
                </Group>
              ) : null}
              <View style={s.noteRow}>
                <View style={s.flex}><Field value={idea} onChangeText={setIdea} placeholder="Something to do together one day" maxLength={80} onSubmit={saveIdea} /></View>
                <Button label="Save" kind="quiet" small disabled={!idea.trim()} onPress={saveIdea} />
              </View>
            </Block>
          ) : null}

          <Block title="Time together">
            {moments.length ? <Group>{moments.slice(0, 20).map((mo) => <MomentRow key={mo.id} mo={mo} onPress={() => setMoment(mo)} />)}</Group>
              : <Group pad><Text style={t.footnote}>Nothing logged yet. The buttons above keep it to one tap.</Text></Group>}
          </Block>

          {fv ? (
            <Group>
              {p.friend_since ? <Item title="Back to new people" sub="Still getting to know them" onPress={() => a.stillGettingToKnow(p)} label="Move back to new people" /> : null}
              <Item title="Belongs in another section" onPress={() => setMoving(true)} chevron label="Belongs in another section: Family or Romance" />
            </Group>
          ) : null}
          {nv ? (confirm ? (
            <Group pad>
              <Text style={t.footnote}>{`This removes ${first} and the times you logged with only them.`}</Text>
              <View style={s.row}>
                <Button label="Remove" kind="danger" small onPress={() => { void a.forget(p); onClose(); }} wrap={s.flex} />
                <Button label="Keep" kind="quiet" small onPress={() => setConfirm(false)} wrap={s.flex} />
              </View>
            </Group>
          ) : <Button label={`Remove ${first}`} kind="quiet" small wrap={s.start} onPress={() => setConfirm(true)} />) : null}
        </>
      )}
      <Sheet open={moving} onClose={() => setMoving(false)} title={p ? `Move ${first}` : ''}>
        <Text style={t.subhead}>{`Only the section changes. Everything you logged stays with ${first}.`}</Text>
        {p ? (
          <Group>
            {(['family', 'romance'] as const).map((to) => (
              <Item key={to} title={to === 'family' ? 'Family' : 'Romance'} chevron label={`Move ${first} to ${to === 'family' ? 'Family' : 'Romance'}`}
                onPress={() => { a.moveTo(p, to); setMoving(false); onClose(); }} />
            ))}
          </Group>
        ) : null}
      </Sheet>
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
            )) : (['call', 'chat'] as const).map((k) => <Chip key={k} label={k === 'call' ? 'A call' : 'A message'} selected={live.kind === k} onPress={() => a.detail(live.id, { kind: k })} />)}
          </View>
          <Field label="A line" value={line} onChangeText={setLine} placeholder="One line to remember it by" maxLength={200} onSubmit={() => a.detail(live.id, { line: line.trim() || null })} />
          {live.photo ? <Image source={fileSource(live.photo)} style={s.photo} contentFit="cover" accessibilityLabel="Photo from this moment" /> : null}
          {canPickPhoto && !live.photo ? (
            <Button label="Add a photo" kind="quiet" icon={<Icon name="camera" size={18} />}
              onPress={async () => { const ph = await pickPhoto(); if (ph) void a.photo(live.id, ph); }} />
          ) : null}
          <Button label="Save" kind="accent" onPress={() => { a.detail(live.id, { line: line.trim() || null }); notice('Saved'); onClose(); }} />
          <Button label="Remove this moment" kind="danger" onPress={() => { a.undoLog(live.id); onClose(); }} />
        </>
      ) : null}
    </Sheet>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  gap8: { gap: 8 },
  gap12: { gap: 12 },
  row: { flexDirection: 'row', gap: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  start: { alignSelf: 'flex-start' },
  medium: { fontFamily: F.medium },
  stepper: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', rowGap: 8 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepLine: { width: 20, height: 1, backgroundColor: SURF.line, marginHorizontal: 4 },
  stepDot: { width: 8, height: 8, borderRadius: 4, borderWidth: 1.5, borderColor: SURF.line },
  head: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  noteRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  thumb: { width: 40, height: 40, borderRadius: R.inner },
  photo: { width: '100%', aspectRatio: 4 / 3, borderRadius: R.row, backgroundColor: SURF.card },
});
