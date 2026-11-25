import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  Avatar, Block, Button, Chip, Failed, Field, Group, haptic, Icon, Item, Lead, myDay, Press, Segmented, Sheet, Skeleton, t, undoable, useAspect,
} from '@/aspects/kit';
import { newId } from '@/lib/mod';
import { C } from '@/theme';
import { PLACE, PLACES } from './copy';
import { useRomance } from './data';
import { withPlan, type Entry } from './model';
import { useNav } from './nav';
import { CheckButton, plural, whenIn } from './parts';
import type { IdeaRec, Place } from './types';

// Ideas: a bank to draw from when he plans something or goes out. His own ideas (People's ideas, kept as Romance's),
// the meet up ideas suggested on each person's page, and ways in for each kind of place. Nothing here is sent.

const newest = (a: IdeaRec, b: IdeaRec) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''));

export function IdeasTab() {
  const a = useAspect();
  const r = useRomance();
  const nav = useNav();
  const [place, setPlace] = useState<Place | null>(null);
  const [showDone, setShowDone] = useState(false);
  const names = new Map((r.list ?? []).map((e) => [e.person.id, e.person.name]));
  const mine = r.mine;
  const open = (mine ?? []).filter((i) => !i.done).sort(newest);
  const done = (mine ?? []).filter((i) => i.done).sort((x, y) => String(y.done_on ?? '').localeCompare(String(x.done_on ?? '')));
  // ideas suggested on a person's page, for the people without a plan yet
  const suggested = (r.active ?? []).filter((e) => e.follow?.ideas?.items?.length && !(e.follow.plan && !e.follow.plan.debrief))
    .flatMap((e) => (e.follow?.ideas?.items ?? []).map((idea, i) => ({ e, idea, i })));
  const where: Place = place ?? r.primer.data?.last_place ?? 'cowork';
  const openers = r.primer.data?.openers?.[where] ?? [];

  const toggle = (i: IdeaRec) => {
    const now = !i.done;
    haptic.medium();
    r.ideas.patch(i.id, { done: now, done_on: now ? myDay() : null }).catch((e: Error) => a.notice(e.message));
    if (now) undoable(`${i.title}, done`, () => { void r.ideas.patch(i.id, { done: false, done_on: null }); });
  };
  const planSuggestion = (e: Entry, i: number) => {
    const f = e.follow;
    const idea = f?.ideas?.items[i];
    if (!f || !idea) return;
    haptic.medium();
    r.people.follow.put({ ...f, ...withPlan(f, { title: idea.title, steps: idea.steps.map((text) => ({ text, done: false })), date: null }) })
      .catch((err: Error) => a.notice(err.message));
    nav.person(e.person.id);
  };
  const forWho = (i: IdeaRec) => (i.person ? `For ${names.get(i.person) ?? 'someone no longer here'}` : 'For anyone');

  return (
    <>
      {mine == null && !r.ideas.error ? <Skeleton height={176} radius={28} /> : (
        <Lead>
          <Text style={[t.footnote, { color: a.color }]}>Ideas bank</Text>
          <View style={s.gap4}>
            <Text style={[t.title3, t.num]}>{open.length ? `${plural(open.length, 'idea')} kept` : 'Nothing kept yet'}</Text>
            <Text style={t.subhead}>Places to go, plans, and things they mentioned. Only you see them.</Text>
          </View>
          <Button label="Add an idea" kind="accent" onPress={() => nav.idea()} />
        </Lead>
      )}

      {r.ideas.error && mine == null ? <Group><Failed message={r.ideas.error} onRetry={r.ideas.refresh} /></Group> : null}

      {open.length ? (
        <Block title="Kept">
          <Group inset={56}>
            {open.map((i) => (
              <Item key={i.id} title={i.title} sub={[forWho(i), i.from].filter(Boolean).join('\n')} lines={3} label={`${i.title}. ${forWho(i)}. Edit`}
                left={<CheckButton label={`${i.title}, mark done`} onPress={() => toggle(i)} />} onPress={() => nav.idea({ edit: i })}
                action={<Button label="Plan" kind="soft" small onPress={() => nav.planIdea(i)} />} />
            ))}
          </Group>
        </Block>
      ) : null}

      {suggested.length ? (
        <Block title="Meet up ideas" sub="Suggested on each person's page. Plan one in a tap.">
          <Group>
            {suggested.map(({ e, idea, i }) => (
              <Item key={`${e.person.id}:${i}`} title={idea.title} sub={`For ${e.person.name}. ${idea.cost}`} lines={2}
                action={<Button label="Plan" kind="soft" small onPress={() => planSuggestion(e, i)} />} />
            ))}
          </Group>
        </Block>
      ) : null}

      <Block title="Ways in" sub="A question about the place, said once. Not a line to recite.">
        <Segmented options={PLACES.map((k) => ({ key: k, label: PLACE[k] }))} value={where} onChange={setPlace} />
        {r.primer.data ? (
          openers.length ? (
            <Group>
              {openers.map((o) => <Item key={o.id} title={o.line} sub={o.when} lines={3} />)}
            </Group>
          ) : <Group pad><Text style={t.subhead}>Ask one honest question about the place you are both in.</Text></Group>
        ) : r.primer.error ? <Group><Failed message={r.primer.error} onRetry={r.primer.refresh} /></Group> : <Skeleton height={160} radius={22} />}
      </Block>

      {done.length ? (
        <View style={s.gap8}>
          <Press label={showDone ? 'Hide done ideas' : `Show done ideas, ${done.length}`} onPress={() => setShowDone(!showDone)} style={s.fold}>
            <Text style={[t.subhead, t.num]}>{`Done, ${done.length}`}</Text>
            <Icon name={showDone ? 'up' : 'down'} size={16} color={C.muted} />
          </Press>
          {showDone ? (
            <Group inset={56}>
              {done.map((i) => (
                <Item key={i.id} title={i.title} done sub={i.done_on ? `Done ${whenIn(i.done_on)}` : 'Done'}
                  left={<CheckButton done label={`${i.title}, done. Undo`} onPress={() => toggle(i)} />} />
              ))}
            </Group>
          ) : null}
        </View>
      ) : null}
    </>
  );
}

// ── sheets ──────────────────────────────────────────────────────────────────────────────────────────────────────
/** Keep an idea: what it is, who it's for (or anyone), and what they mentioned. Editing offers delete with Undo. */
export function IdeaSheet({ open, edit, person, onClose }: { open: boolean; edit: IdeaRec | null; person: string | null; onClose: () => void }) {
  const a = useAspect();
  const r = useRomance();
  const [title, setTitle] = useState('');
  const [who, setWho] = useState<string | null>(null);
  const [from, setFrom] = useState('');
  const [sure, setSure] = useState(false);
  const [was, setWas] = useState(false);
  if (open !== was) {
    setWas(open);
    if (open) { setTitle(edit?.title ?? ''); setWho(edit ? edit.person : person); setFrom(edit?.from ?? ''); setSure(false); }
  }
  const save = () => {
    r.ideas.put({ ...(edit ?? {}), id: edit?.id ?? newId('id'), person: who, aspect: 'romance', kind: edit?.kind ?? 'plan', title: title.trim(),
      from: from.trim() || null, done: edit?.done ?? false, by: edit?.by ?? 'you' }).catch((e: Error) => a.notice(e.message));
    haptic.medium();
    onClose();
  };
  const del = () => {
    if (!edit) return;
    if (!sure) { setSure(true); return; }
    const before = edit;
    r.ideas.remove(edit.id).catch((e: Error) => a.notice(e.message));
    undoable('Idea deleted', () => { void r.ideas.put(before); });
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title={edit ? 'Edit idea' : 'Add an idea'}>
      <Field label="The idea" value={title} onChangeText={setTitle} placeholder="A place to go, a plan, something to try" autoFocus={!edit} maxLength={120} />
      <View style={s.gap8}>
        <Text style={t.label}>For</Text>
        <View style={s.chips}>
          <Chip label="Anyone" selected={who == null} onPress={() => setWho(null)} />
          {(r.active ?? []).map((e) => <Chip key={e.person.id} label={e.person.name} selected={who === e.person.id} onPress={() => setWho(e.person.id)} />)}
        </View>
      </View>
      <Field label="What they mentioned" value={from} onChangeText={setFrom} placeholder="Optional. A book, a cafe, a band" maxLength={200} />
      <Button label={edit ? 'Save' : 'Keep this idea'} kind="accent" onPress={save} disabled={!title.trim()} />
      {edit ? <Button label={sure ? 'Tap again to delete' : 'Delete'} kind={sure ? 'danger' : 'quiet'} onPress={del} /> : null}
      <Text style={t.footnote}>Kept on your PC with your other ideas. Nothing is shared.</Text>
    </Sheet>
  );
}

/** Who to plan an idea for anyone with. */
export function WhoSheet({ idea, onClose, onPick }: { idea: IdeaRec | null; onClose: () => void; onPick: (person: string, idea: IdeaRec) => void }) {
  const r = useRomance();
  const nav = useNav();
  const active = r.active ?? [];
  return (
    <Sheet open={!!idea} onClose={onClose} title="Plan it with">
      {idea ? <Text style={t.subhead}>{idea.title}</Text> : null}
      {active.length ? (
        <Group inset={72}>
          {active.map((e) => (
            <Item key={e.person.id} title={e.person.name} sub={e.follow?.plan && !e.follow.plan.debrief ? 'Has a plan already' : null}
              left={<Avatar name={e.person.name} size={44} />} chevron onPress={() => { if (idea) onPick(e.person.id, idea); }} />
          ))}
        </Group>
      ) : (
        <>
          <Text style={t.subhead}>Add someone first, then plan it with them.</Text>
          <Button label="Add someone" kind="soft" onPress={() => { onClose(); nav.add(); }} />
        </>
      )}
    </Sheet>
  );
}

const s = StyleSheet.create({
  gap4: { gap: 4 },
  gap8: { gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fold: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44 },
});
