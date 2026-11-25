import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Block, Button, Chip, DayPicker, Field, Group, haptic, Icon, Item, Lead, Loading, Screen, t, today, useAspect } from '@/aspects/kit';
import { useGet } from '@/lib/mod';
import { F } from '@/theme';
import type { Actions } from './actions';
import { dayAhead, fillName, firstName, roundSlot, whenAgo, type AiAnswer, type Bank, type Friends, type Person, type Week } from './data';
import { deepenIdeas, type DeepenIdea, type Model } from './model';
import { askIdeas, useIdeasState } from './ideas';
import { copy } from './parts';

export type Preset = { person?: string | null; idea?: DeepenIdea | null };
type Pick = { key: string; title: string; act: string | null; invite: string | null; idea: string | null; why?: string | null };

const TIMES = ['10:00', '13:00', '17:00', '18:00', '19:00', '20:00', '21:00'];

/** One idea to pick. Picked, it takes the page colour and a tick. */
function IdeaRow({ pick, selected, onPress, yours }: { pick: Pick; selected: boolean; onPress: () => void; yours?: boolean }) {
  const { color } = useAspect();
  return (
    <Item title={pick.title} sub={pick.why ?? (yours ? 'From your ideas' : null)} onPress={onPress} lines={3}
      label={`${pick.title}${selected ? ', picked' : ''}`} titleStyle={selected ? { color } : undefined}
      right={selected ? <Icon name="check" size={18} color={color} /> : undefined} />
  );
}

/** A plan in three taps: who, what, when. The third tap makes it; then the invite he copies and sends himself. */
export function PlanFlow({ open, onClose, preset, m, f, a, week, bank, notice }: {
  open: boolean; onClose: () => void; preset: Preset; m: Model; f: Friends; a: Actions; week: Week | null; bank: Bank | null; notice: (t: string) => void;
}) {
  const { color } = useAspect();
  const [who, setWho] = useState<string | null>(preset.person ?? null);
  const [what, setWhat] = useState<Pick | null>(preset.idea ? { key: preset.idea.id, title: preset.idea.title, act: preset.idea.act, invite: preset.idea.invite, idea: preset.idea.saved ? null : preset.idea.id } : null);
  const [own, setOwn] = useState('');
  const [writing, setWriting] = useState(false);
  const [moreIdeas, setMoreIdeas] = useState(false);
  const [day, setDay] = useState<string | null>(null);
  const [made, setMade] = useState<string | null>(null);
  const [invite, setInvite] = useState('');
  const person: Person | null = m.persons.find((p) => p.id === who) ?? null;
  const ai = useGet<{ item: AiAnswer | null }>(open && who ? `/mod/friends/ideas?person=${encodeURIComponent(who)}` : null);
  const answer = ai.data?.item && ai.data.item.person === who ? ai.data.item : null;
  const { busy: aiBusy, error: aiError } = useIdeasState(who);
  const ask = (force = false) => { if (who) askIdeas(who, force); };

  const people = [...m.friends.map((v) => v.p), ...m.newcomers.map((v) => v.p)];
  const fv = m.friends.find((v) => v.p.id === who) ?? null;
  const nv = m.newcomers.find((v) => v.p.id === who) ?? null;
  const bankIdeas = bank?.ideas ?? [];
  const ordered: Pick[] = (() => {
    if (!who) return [];
    if (fv) return deepenIdeas(fv, f.ideas.items ?? [], bankIdeas).map((d) => ({ key: d.id, title: d.title, act: d.act, invite: d.invite, idea: d.saved ? null : d.id }));
    const near = [...bankIdeas].sort((x, y) => Number(!!y.near) - Number(!!x.near));
    return near.map((b) => ({ key: b.id, title: b.title, act: b.act, invite: b.invite, idea: b.id }));
  })();
  const aiPicks: Pick[] = (answer?.ideas ?? []).map((i) => ({ key: `ai:${i.id}`, title: i.title, act: i.act, invite: i.invite, idea: null, why: i.why }));
  const shown = moreIdeas ? ordered : ordered.slice(0, 4);
  const presetOnly = !!preset.idea && !!what && !ordered.some((o) => o.key === what.key) && !aiPicks.some((o) => o.key === what.key) && what.key !== 'own';
  const choose = (p: Pick) => { setWhat(p); setDay(null); };
  const useOwn = () => { if (own.trim()) { choose({ key: 'own', title: own.trim(), act: null, invite: null, idea: null }); setWriting(false); } };

  const create = async (date: string, slot: string | null) => {
    if (!who || !what) return;
    haptic.medium();
    const line = fillName(what.invite ?? `${what.title.charAt(0).toLowerCase()}${what.title.slice(1)} ${date === today() ? 'today' : `on ${dayAhead(date)}`}${slot ? ` at ${slot}` : ''}, {name}?`, person);
    const id = await a.makePlan({ people: [who], title: what.title, act: what.act, date, slot, invite: line, idea: what.idea });
    if (!id) return;
    setInvite(line);
    setMade(id);
  };
  const plan = made ? m.plans.find((p) => p.id === made) ?? null : null;
  const free = week?.free ?? [];

  return (
    <Screen open={open} onClose={onClose} title={made ? 'Plan made' : 'New plan'}>
      {made ? (
        <Animated.View entering={FadeIn.duration(200)} style={s.gap24}>
          <Lead>
            <Text style={[t.footnote, { color }]}>{plan?.date ? `${dayAhead(plan.date)}${plan.slot ? `, ${plan.slot}` : ''}` : 'No day set yet'}</Text>
            <View style={s.gap4}>
              <Text style={t.title3}>{plan?.title ?? what?.title ?? ''}</Text>
              <Text style={t.subhead}>{`With ${person ? person.name : ''}`}</Text>
            </View>
          </Lead>
          <View style={s.gap8}>
            <Field label="Invite" value={invite} onChangeText={setInvite} multiline maxLength={300} />
            <Text style={t.footnote}>Edit it if you like. Nothing is sent from here.</Text>
          </View>
          <View style={s.gap12}>
            <Button label="Copy invite" kind="accent" onPress={async () => {
              a.patchPlan(made, { invite });
              const ok = await copy(invite);
              notice(ok ? 'Invite copied. Send it from your messages.' : "Couldn't copy on this device.");
            }} />
            <Button label="Done" kind="quiet" onPress={() => { a.patchPlan(made, { invite }); onClose(); }} />
          </View>
        </Animated.View>
      ) : (
        <>
          <Block title="Who">
            {people.length ? (
              <View style={s.chips}>
                {people.map((p) => <Chip key={p.id} label={people.filter((x) => firstName(x) === firstName(p)).length > 1 ? p.name : firstName(p)} selected={who === p.id}
                  onPress={() => { setWho(p.id); askIdeas(p.id); if (!preset.idea) setWhat(null); setDay(null); }} />)}
              </View>
            ) : <Group pad><Text style={t.footnote}>Add a friend or someone you met first.</Text></Group>}
          </Block>

          {who ? (
            <Block title="What" sub={nv ? 'Small and close to where you met works best for a first plan.' : undefined}>
              <Group>
                {presetOnly && what ? <IdeaRow pick={what} selected onPress={() => {}} /> : null}
                {shown.map((p) => <IdeaRow key={p.key} pick={p} selected={what?.key === p.key} onPress={() => choose(p)} yours={p.idea == null} />)}
                {ordered.length > 4 ? (
                  <Item title={moreIdeas ? 'Fewer ideas' : 'More ideas'} titleStyle={{ color }} onPress={() => setMoreIdeas((x) => !x)} />
                ) : null}
                {what?.key === 'own' && !writing ? <IdeaRow pick={what} selected onPress={() => { setOwn(what.title); setWriting(true); }} />
                  : !writing ? <Item title="Something else" titleStyle={{ color }} onPress={() => setWriting(true)} label="Something else. Write your own" /> : null}
              </Group>
              {writing ? (
                <View style={s.ownRow}>
                  <View style={s.flex}><Field value={own} onChangeText={setOwn} placeholder="What do you want to do?" autoFocus maxLength={60} onSubmit={useOwn} /></View>
                  <Button label="Use" kind="quiet" small disabled={!own.trim()} onPress={useOwn} />
                </View>
              ) : null}
            </Block>
          ) : null}

          {who ? (
            <Block title="Ideas from Nora"
              sub={!aiBusy && answer ? `Made ${whenAgo(answer.date)}, for the two of you.` : undefined}
              action={!aiBusy && (answer || aiError) ? (answer ? 'Fresh ideas' : 'Try again') : undefined} onAction={() => ask(true)}>
              {aiPicks.length && !aiBusy ? (
                <Group>{aiPicks.map((p) => <IdeaRow key={p.key} pick={p} selected={what?.key === p.key} onPress={() => choose(p)} />)}</Group>
              ) : aiBusy ? (
                <Group pad>
                  <Loading />
                  <Text style={[t.footnote, s.center]}>Nora is thinking of ideas for you two. Pick one above meanwhile.</Text>
                </Group>
              ) : (
                <Group pad>
                  <Text style={t.footnote}>{aiError ? 'Ideas from Nora are not available right now.' : 'No ideas from Nora yet.'}</Text>
                  {!aiError ? <Button label="Ask Nora" kind="quiet" small onPress={() => ask(false)} wrap={s.start} /> : null}
                </Group>
              )}
            </Block>
          ) : null}

          {who && what ? (
            <Block title="When" sub={!free.length ? (week ? 'No long free stretch in your calendar this week.' : 'Your calendar did not load. Pick a day.') : 'Free in your calendar'}>
              <View style={s.chips}>
                {free.slice(0, 6).map((w) => (
                  <Chip key={w.date} label={`${dayAhead(w.date)}, ${roundSlot(w.from)}`} onPress={() => void create(w.date, roundSlot(w.from))} />
                ))}
                <Chip label="Another day" selected={day != null} onPress={() => setDay(day ? null : today())} />
              </View>
              {day ? (
                <Animated.View entering={FadeIn.duration(160)} style={s.gap12}>
                  <DayPicker value={day} onChange={setDay} />
                  <Text style={[t.footnote, s.medium]}>What time?</Text>
                  <View style={s.chips}>
                    {TIMES.map((tm) => <Chip key={tm} label={tm} onPress={() => void create(day, tm)} />)}
                    <Chip label="Time open" onPress={() => void create(day, null)} />
                  </View>
                </Animated.View>
              ) : null}
            </Block>
          ) : null}
        </>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  center: { textAlign: 'center' },
  start: { alignSelf: 'flex-start' },
  medium: { fontFamily: F.medium },
  gap4: { gap: 4 },
  gap8: { gap: 8 },
  gap12: { gap: 12 },
  gap24: { gap: 24 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  ownRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
});
