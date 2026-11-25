import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  Avatar, Block, Button, CheckRing, Chip, dayOf, DayPicker, Empty, Failed, Field, Group, haptic, Icon, Item, Lead, myDay, Press, Screen, Segmented, Sheet, Skeleton,
  Stepper, t, Tag, today, useAspect,
} from '@/aspects/kit';
import { call, newId, type Draft } from '@/lib/mod';
import { C } from '@/theme';
import { BUDGET, NEXT_STEPS, PLACE, PLACES } from './copy';
import { usePeople, usePrefs, useRomance } from './data';
import { lastContact, nextUp, STAGE, stageOf, withPlan, type Entry, type PlanItem } from './model';
import { useNav } from './nav';
import { capital, CheckButton, copyText, dueWords, Gl, placeAt, planDay, sinceDay, whenIn } from './parts';
import type { Budget, Follow, Moment, Place, Step } from './types';

/** "Met at a cafe, 3 days ago". */
export function metLine(e: Entry) {
  const m = e.follow?.met;
  const where = m?.place ? (m.place === 'other' ? 'somewhere else' : placeAt(m.place)) : e.person.where ? `at ${e.person.where}` : null;
  const day = m?.day ?? e.person.added ?? (e.person.created_at ? dayOf(e.person.created_at) : null);
  const when = day ? sinceDay(day) : null;
  return ['Met', where, when && /^\d+ [A-Z]/.test(when) ? `on ${when}` : when].filter(Boolean).join(' ');
}
export function nextLine(f: Follow | null) {
  if (!f?.next?.what) return null;
  const due = dueWords(f.next.due);
  return due ? `${f.next.what}, ${due}` : f.next.what;
}
/** "Last contact 2 days ago", from every place contact shows up. */
const contactLine = (e: Entry, moments: Moment[] | null) => {
  const day = lastContact(e, moments);
  return day ? `Last contact ${sinceDay(day)}` : null;
};
const blank = (id: string): Draft<Follow> => ({ id, person: id, done: [], archived: false });

// ── the People tab ───────────────────────────────────────────────────────────────────────────────────────────────
export function PeopleTab() {
  const r = useRomance();
  const nav = useNav();
  const [showArchived, setShowArchived] = useState(false);
  if (r.list == null) {
    if (r.people.error) return <Group><Failed message={r.people.error} onRetry={r.people.refresh} /></Group>;
    return <View style={s.gap16}><Skeleton height={176} radius={28} /><Skeleton height={64} radius={22} /><Skeleton height={64} radius={22} /></View>;
  }
  const active = r.active ?? [];
  const up = nextUp(r.list);
  return (
    <>
      <PeopleLead up={up} any={active.length > 0} waiting={active.some((e) => e.follow?.next?.what === 'Wait for a reply')} />

      {active.length ? (
        <Block title="Talking to" action="Add" onAction={() => nav.add()}>
          <Group inset={72}>
            {active.map((e) => <PersonRow key={e.person.id} e={e} moments={r.moments.items} />)}
          </Group>
        </Block>
      ) : null}

      {r.archived.length ? (
        <View style={s.gap8}>
          <Press label={showArchived ? 'Hide archived' : `Show archived, ${r.archived.length}`} onPress={() => setShowArchived(!showArchived)} style={s.fold}>
            <Text style={[t.subhead, t.num]}>{`Archived, ${r.archived.length}`}</Text>
            <Icon name={showArchived ? 'up' : 'down'} size={16} color={C.muted} />
          </Press>
          {showArchived ? (
            <Group inset={72}>
              {r.archived.map((e) => <PersonRow key={e.person.id} e={e} moments={r.moments.items} />)}
            </Group>
          ) : null}
        </View>
      ) : null}

      <Block title="Only you see this">
        <Group inset={56}>
          <Item title="What I'm looking for" sub={r.prefs.looking ? 'Written in your words. Open it to read.' : 'Not written yet. A few words, read back when you decide whether to follow up.'}
            left={<Gl k="note" color={C.muted} />} chevron onPress={nav.looking} />
        </Group>
      </Block>
    </>
  );
}

/** Who to follow up with next, done in one tap; or the way to add the first person. */
function PeopleLead({ up, any, waiting }: { up: Entry | null; any: boolean; waiting: boolean }) {
  const a = useAspect();
  const nav = useNav();
  if (up?.follow?.next) {
    const next = up.follow.next;
    const due = dueWords(next.due);
    return (
      <Lead>
        <View style={s.between}>
          <Text style={[t.footnote, { color: a.color }]}>Next step</Text>
          {due ? <Text style={[t.footnote, t.num]}>{capital(due)}</Text> : null}
        </View>
        <View style={s.who}>
          <Avatar name={up.person.name} size={48} />
          <View style={s.flexGap}>
            <Text style={t.title3}>{up.person.name}</Text>
            <Text style={t.subhead}>{next.what}</Text>
          </View>
        </View>
        <View style={s.row}>
          <Button label="Done" kind="accent" onPress={() => nav.markDone(up)} wrap={s.flex} />
          <Button label="Open" kind="quiet" onPress={() => nav.person(up.person.id)} />
        </View>
      </Lead>
    );
  }
  return (
    <Lead>
      <Text style={[t.footnote, { color: a.color }]}>{any ? 'Next step' : 'Talking to'}</Text>
      <View style={s.gap4}>
        <Text style={t.title3}>{any ? 'Nothing due' : 'Nobody here yet'}</Text>
        <Text style={t.subhead}>
          {!any ? "When you meet someone you'd like to see again, add them here. A first name or a nickname is enough."
            : waiting ? 'Some are waiting on a reply, and that can rest. Open someone else to set a small next step.'
              : 'Open someone to set one small next step: a message, a coffee, a hello next time.'}
        </Text>
      </View>
      <Button label="Add someone" kind={any ? 'soft' : 'accent'} onPress={() => nav.add()} />
    </Lead>
  );
}

function PersonRow({ e, moments }: { e: Entry; moments: Moment[] | null }) {
  const nav = useNav();
  const next = nextLine(e.follow);
  const contact = contactLine(e, moments);
  const sub = [contact, next ? `Next: ${next}` : null].filter(Boolean).join('\n');
  return (
    <Item title={e.person.name} sub={sub || null} lines={3} chevron onPress={() => nav.person(e.person.id)}
      label={`${e.person.name}. ${STAGE[stageOf(e.follow)]}. ${sub.replace(/\n/g, '. ')}. Open`}
      left={<Avatar name={e.person.name} size={44} />} right={<Tag label={STAGE[stageOf(e.follow)]} />} />
  );
}

// ── one person ──────────────────────────────────────────────────────────────────────────────────────────────────
export function PersonScreen({ id, onClose, onNext, onTalked }: { id: string | null; onClose: () => void; onNext: (id: string) => void; onTalked: (id: string) => void }) {
  const a = useAspect();
  const nav = useNav();
  const r = useRomance();
  const p = r.people;
  const [lineAt, setLineAt] = useState(0);
  const [busy, setBusy] = useState<'line' | 'ideas' | null>(null);
  const [budget, setBudget] = useState<Budget>('low');
  const [confirm, setConfirm] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const e = id ? r.list?.find((x) => x.person.id === id) ?? null : null;
  const f = e?.follow ?? null;
  // a follow up record is made the first time he sets something on it
  const save = (change: Partial<Follow>) => {
    if (!e) return Promise.resolve();
    const base: Draft<Follow> = f ? { ...f } : blank(e.person.id);
    return p.follow.put({ ...base, ...change, id: e.person.id, person: e.person.id }).then(() => {}, (err: Error) => a.notice(err.message));
  };
  const markDone = () => {
    if (!e || !f?.next) return;
    nav.markDone(e);
    onNext(e.person.id);
  };
  const ask = async (kind: 'line' | 'ideas') => {
    if (!e) return;
    setBusy(kind);
    try {
      await call(`/mod/romance/follow/${encodeURIComponent(e.person.id)}/${kind}`, kind === 'ideas' ? { budget } : {});
      await p.follow.refresh();
      if (kind === 'line') setLineAt(0);
    } catch (err) { a.notice((err as Error).message); }
    setBusy(null);
  };
  const pick = (i: number) => {
    const idea = f?.ideas?.items[i];
    if (!idea) return;
    haptic.medium();
    void save(withPlan(f, { title: idea.title, steps: idea.steps.map((text) => ({ text, done: false })), date: null }));
  };
  const tick = (i: number) => {
    if (!f?.plan) return;
    haptic.tick();
    const steps = f.plan.steps.map((st, k) => (k === i ? { ...st, done: !st.done } : st));
    void save({ plan: { ...f.plan, steps } });
  };
  const remove = async () => {
    if (!e) return;
    setConfirm(false);
    onClose();
    try {
      await p.persons.remove(e.person.id);
      if (f) await p.follow.remove(e.person.id);
      a.notice('Deleted');
    } catch (err) { a.notice((err as Error).message); }
  };
  const sentOne = !!f?.done?.some((x) => /message/i.test(x.what)) || f?.next?.what === 'Wait for a reply';
  const lines = f?.line?.options ?? [];
  const plan = f?.plan ?? null;
  const item: PlanItem | null = e && plan ? {
    key: `f:${e.person.id}`, kind: 'follow', id: e.person.id, person: e.person, names: e.person.name,
    title: plan.title, date: plan.date ?? null, steps: plan.steps ?? [], debrief: plan.debrief ?? null,
  } : null;
  const passed = !!plan?.date && plan.date < today() && !plan.debrief;
  const contact = e ? contactLine(e, r.moments.items) : null;

  return (
    <Screen open={!!id} onClose={onClose} title={e?.person.name ?? ''}>
      {!e ? (
        r.list == null ? <Skeleton height={160} radius={24} /> : <Empty title="Not here any more" body="This person was deleted." />
      ) : (
        <>
          <View style={s.who}>
            <Avatar name={e.person.name} size={56} />
            <View style={s.flexGap}>
              <Text style={t.subhead}>{metLine(e)}</Text>
              {contact ? <Text style={t.footnote}>{contact}</Text> : null}
            </View>
            <Tag label={STAGE[stageOf(f)]} tone="aspect" />
          </View>

          <Block title="What you talked about">
            <Group>
              <Item title={f?.talked || 'What did you talk about?'} sub={f?.talked ? null : 'A few words help the next message.'} lines={8}
                titleStyle={!f?.talked ? { color: C.muted } : t.subhead} right={<Icon name="pencil" size={16} color={C.muted} />}
                label="What you talked about, edit" onPress={() => onTalked(e.person.id)} />
            </Group>
          </Block>

          <Block title="Next step" action={f?.next ? 'Change' : undefined} onAction={() => onNext(e.person.id)}>
            {f?.next ? (
              <Group inset={56}>
                <Item title={f.next.what} sub={f.next.due ? capital(dueWords(f.next.due) ?? '') : 'No day set'}
                  left={<CheckButton label={`Mark done: ${f.next.what}`} onPress={markDone} />} />
              </Group>
            ) : (
              <Group inset={56}>
                <Item title="Set a next step" sub="Something small and specific" left={<Icon name="plus" size={18} color={C.muted} />} chevron onPress={() => onNext(e.person.id)} />
              </Group>
            )}
            {f?.done?.length ? (
              <Text style={t.footnote}>{`Done: ${f.done.slice(-3).map((x) => `${x.what.charAt(0).toLowerCase()}${x.what.slice(1)} ${whenIn(dayOf(x.at))}`).join(', ')}.`}</Text>
            ) : null}
          </Block>

          <Block title="A message you could send" sub={sentOne ? "You've sent one. If there's no reply, let it rest; that is an answer too." : null}>
            {lines.length ? (
              <Group pad>
                <Text selectable style={t.headline}>{lines[lineAt % lines.length]}</Text>
                <View style={s.wrapRow}>
                  <Button label="Copy" kind="soft" small icon={<Gl k="copy" size={14} color={a.color} />}
                    onPress={() => { void copyText(lines[lineAt % lines.length]).then((ok) => a.notice(ok ? 'Copied. Edit it and send it yourself.' : "Couldn't copy here")); }} />
                  {lines.length > 1 ? <Button label="Another" kind="quiet" small onPress={() => setLineAt(lineAt + 1)} /> : null}
                  <Button label="New ones" kind="quiet" small busy={busy === 'line'} onPress={() => void ask('line')} />
                </View>
                <Text style={t.footnote}>{f?.line?.by === 'ai' ? 'Written by Nora from what you noted. Nothing is ever sent for you.' : 'A plain starting point. Nothing is ever sent for you.'}</Text>
              </Group>
            ) : (
              <Group inset={56}>
                <Item title="Suggest a message" sub="Three short ones to edit and send yourself" left={<Gl k="bubble" color={C.muted} />}
                  action={<Button label="Suggest" kind="soft" small busy={busy === 'line'} onPress={() => void ask('line')} />} />
              </Group>
            )}
          </Block>

          {plan && item ? (
            <Block title="Plan">
              <Group inset={56}>
                <Item title={plan.title} titleStyle={t.headline} sub={`With ${e.person.name}`} left={<Icon name="calendar" size={18} color={a.color} />} />
                <Item title="Day" value={capital(planDay(plan.date ?? null))} chevron onPress={() => nav.planDay(item)} label={`Day: ${planDay(plan.date ?? null)}. Change`} />
                {plan.steps.map((st, i) => (
                  <Item key={`${i}:${st.text}`} title={st.text} done={st.done} onPress={() => tick(i)} label={`${st.text}, ${st.done ? 'done, tap to undo' : 'tap when done'}`}
                    left={<CheckRing done={st.done} />} />
                ))}
                {plan.debrief ? (
                  <Item title="Debriefed" sub="Open what you said and the reading" left={<Gl k="bubble" color={C.muted} />} chevron
                    onPress={() => nav.debrief({ outing: null, view: plan.debrief ?? null })} />
                ) : null}
              </Group>
              {passed ? <Button label="Debrief how it went" kind="accent" icon={<Icon name="mic" size={18} color="#14161C" />} onPress={() => nav.debrief({ outing: null, view: null, plan: item })} /> : null}
              <Button label={plan.debrief ? 'Plan the next one' : 'Pick another idea'} kind="quiet" small onPress={() => void save(withPlan(f, null))} wrap={s.selfStart} />
            </Block>
          ) : (
            <Block title="Ideas to meet up">
              <Segmented options={(Object.keys(BUDGET) as Budget[]).map((k) => ({ key: k, label: BUDGET[k] }))} value={budget} onChange={setBudget} />
              {f?.ideas && f.ideas.budget === budget ? (
                <>
                  <Group>
                    {f.ideas.items.map((idea, i) => (
                      <Item key={idea.title} title={idea.title} sub={`${idea.cost}. ${idea.why}`} lines={3}
                        action={<Button label="Plan this" kind="soft" small onPress={() => pick(i)} />} />
                    ))}
                  </Group>
                  <Text style={t.footnote}>{f.ideas.by === 'ai' ? 'Suggested by Nora from what you noted.' : 'From a short list, not from Nora.'}</Text>
                </>
              ) : null}
              <Button label={f?.ideas?.budget === budget ? 'New ideas' : 'Suggest ideas'} kind="quiet" busy={busy === 'ideas'} onPress={() => void ask('ideas')} />
            </Block>
          )}

          {r.prefs.looking ? (
            <View style={s.gap8}>
              <Press label={showNote ? 'Hide what I am looking for' : 'Show what I am looking for'} onPress={() => setShowNote(!showNote)} style={s.fold}>
                <Text style={t.subhead}>What I&apos;m looking for</Text>
                <Icon name={showNote ? 'up' : 'down'} size={16} color={C.muted} />
              </Press>
              {showNote ? <Group pad><Text style={t.subhead}>{r.prefs.looking}</Text></Group> : null}
            </View>
          ) : null}

          {confirm ? (
            <Group pad>
              <Text style={t.subhead}>{`Delete everything about ${e.person.name}: the name, where you met, notes and plans. This can't be undone.`}</Text>
              <View style={s.row}>
                <Button label="Keep" kind="quiet" onPress={() => setConfirm(false)} wrap={s.flex} />
                <Button label="Delete" kind="danger" onPress={() => void remove()} wrap={s.flex} />
              </View>
            </Group>
          ) : (
            <View style={s.row}>
              <Button label={f?.archived ? 'Bring back' : 'Archive'} kind="quiet" wrap={s.flex}
                onPress={() => { void save({ archived: !f?.archived }); a.notice(f?.archived ? 'Back in Talking to' : 'Archived'); if (!f?.archived) onClose(); }} />
              <Button label="Delete" kind="danger" onPress={() => setConfirm(true)} wrap={s.flex} />
            </View>
          )}
        </>
      )}
    </Screen>
  );
}

// ── sheets ──────────────────────────────────────────────────────────────────────────────────────────────────────
/** Add someone: a first name or nickname, where you met, what you talked about. */
export function AddSheet({ open, met, onClose, onAdded }: {
  open: boolean; met: { place: Place | null; session: string | null } | null; onClose: () => void; onAdded: (id: string) => void;
}) {
  const a = useAspect();
  const p = usePeople();
  const [name, setName] = useState('');
  const [place, setPlace] = useState<Place | null>(null);
  const [talked, setTalked] = useState('');
  const [was, setWas] = useState(false);
  if (open !== was) { setWas(open); if (open) { setName(''); setTalked(''); setPlace(met?.place ?? null); } }
  const add = async () => {
    const id = newId('rp');
    const day = today();
    try {
      await p.persons.put({ id, name: name.trim(), aspect: 'romance', rel: null, where: place ? PLACE[place] : null, added: day });
      await p.follow.put({ id, person: id, met: { day, place, session: met?.session ?? null }, talked: talked.trim() || null, next: null, done: [], archived: false });
      haptic.success();
      onClose();
      onAdded(id);
    } catch (err) { a.notice((err as Error).message); }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Add someone">
      <Field label="First name or nickname" value={name} onChangeText={setName} placeholder="Only you see it" autoFocus maxLength={40} />
      <View style={s.gap8}>
        <Text style={t.label}>Where you met</Text>
        <View style={s.chips}>{PLACES.map((k) => <Chip key={k} label={PLACE[k]} selected={place === k} onPress={() => setPlace(place === k ? null : k)} />)}</View>
      </View>
      <Field label="What you talked about" value={talked} onChangeText={setTalked} placeholder="A few words, optional" maxLength={300} />
      <Button label="Add to Talking to" kind="accent" onPress={() => void add()} disabled={!name.trim()} />
      <Text style={t.footnote}>Kept on your PC. Delete it any time from their page.</Text>
    </Sheet>
  );
}

/** The next step with someone, and the day for it. */
export function NextSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const a = useAspect();
  const p = usePeople();
  const e = id ? p.list?.find((x) => x.person.id === id) ?? null : null;
  const [what, setWhat] = useState('');
  const [due, setDue] = useState(myDay());
  const [dated, setDated] = useState(true);
  const [was, setWas] = useState<string | null>(null);
  if (id !== was) {
    setWas(id);
    if (id) {
      const next = e?.follow?.next;
      setWhat(next?.what ?? '');
      setDated(next ? !!next.due : true);
      setDue(next?.due ?? myDay());
    }
  }
  const save = (next: Step | null) => {
    if (!e) return;
    const f = e.follow;
    const base: Draft<Follow> = f ? { ...f } : blank(e.person.id);
    p.follow.put({ ...base, id: e.person.id, person: e.person.id, next }).catch((err: Error) => a.notice(err.message));
    onClose();
  };
  return (
    <Sheet open={!!id} onClose={onClose} title="Next step">
      <View style={s.chips}>{NEXT_STEPS.map((x) => <Chip key={x} label={x} selected={what === x} onPress={() => setWhat(x)} />)}</View>
      <Field label="Or your own" value={NEXT_STEPS.includes(what) ? '' : what} onChangeText={setWhat} placeholder="Something small and specific" maxLength={120} />
      <View style={s.gap8}>
        <Text style={t.label}>When</Text>
        <Segmented options={[{ key: 'day', label: 'On a day' }, { key: 'none', label: 'No day' }]} value={dated ? 'day' : 'none'} onChange={(k) => setDated(k === 'day')} />
        {dated ? <DayPicker value={due} onChange={setDue} /> : null}
      </View>
      <Button label="Save" kind="accent" onPress={() => save({ what: what.trim(), due: dated ? due : null })} disabled={!what.trim()} />
      {e?.follow?.next ? <Button label="No next step" kind="quiet" onPress={() => save(null)} /> : null}
    </Sheet>
  );
}

/** What they talked about, edited. */
export function TalkedSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const a = useAspect();
  const p = usePeople();
  const e = id ? p.list?.find((x) => x.person.id === id) ?? null : null;
  const [text, setText] = useState('');
  const [was, setWas] = useState<string | null>(null);
  if (id !== was) { setWas(id); if (id) setText(e?.follow?.talked ?? ''); }
  const save = () => {
    if (!e) return;
    const f = e.follow;
    const base: Draft<Follow> = f ? { ...f } : blank(e.person.id);
    p.follow.put({ ...base, id: e.person.id, person: e.person.id, talked: text.trim() || null }).catch((err: Error) => a.notice(err.message));
    onClose();
  };
  return (
    <Sheet open={!!id} onClose={onClose} title="What you talked about">
      <Field value={text} onChangeText={setText} placeholder="Their course, a book, the music at the cafe" multiline autoFocus maxLength={600} />
      <Button label="Save" kind="accent" onPress={save} />
    </Sheet>
  );
}

/** His private note on what he is looking for. */
export function LookingSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const a = useAspect();
  const prefs = usePrefs();
  const [text, setText] = useState('');
  const [was, setWas] = useState(false);
  if (open !== was) { setWas(open); if (open) setText(prefs.looking ?? ''); }
  const save = () => {
    prefs.put({ id: 'looking', text: text.trim() }).catch((err: Error) => a.notice(err.message));
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title="What I'm looking for">
      <Text style={t.subhead}>In your own words. Write it once and come back to it when you are deciding whether to follow up. Only you see it.</Text>
      <Field value={text} onChangeText={setText} placeholder="Someone I can talk to for hours" multiline autoFocus maxLength={2000} />
      <Button label="Save" kind="accent" onPress={save} />
    </Sheet>
  );
}

/** The weekly target he sets. */
export function TargetSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const a = useAspect();
  const prefs = usePrefs();
  const [n, setN] = useState(3);
  const [was, setWas] = useState(false);
  if (open !== was) { setWas(open); if (open) setN(prefs.target ?? 3); }
  const save = () => {
    prefs.put({ id: 'target', per_week: n }).catch((err: Error) => a.notice(err.message));
    haptic.medium();
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title="Conversations a week">
      <Stepper value={n} onChange={setN} min={1} max={30} label="Conversations a week" format={(v) => `${v} a week`} />
      <Text style={t.subhead}>Start small. One or two on most days does more than one big day, and a quiet week resets nothing.</Text>
      <Button label="Save" kind="accent" onPress={save} />
    </Sheet>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  flexGap: { flex: 1, minWidth: 0, gap: 2 },
  gap4: { gap: 4 },
  gap8: { gap: 8 },
  gap16: { gap: 16 },
  row: { flexDirection: 'row', gap: 12 },
  wrapRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  fold: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44 },
  selfStart: { alignSelf: 'flex-start' },
});
