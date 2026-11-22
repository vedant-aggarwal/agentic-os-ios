import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { addDays, Button, Card, Chip, Field, haptic, Loading, Press, R, Screen, Section, SP, SURF, t, tint, today, useAspect } from '@/aspects/kit';
import { useGet } from '@/lib/mod';
import type { Actions } from './actions';
import { dayAhead, fillName, firstName, roundSlot, whenAgo, type AiAnswer, type Bank, type Friends, type Person, type Week } from './data';
import { deepenIdeas, type DeepenIdea, type Model } from './model';
import { askIdeas, useIdeasState } from './ideas';
import { copy } from './parts';

export type Preset = { person?: string | null; idea?: DeepenIdea | null };
type Pick = { key: string; title: string; act: string | null; invite: string | null; idea: string | null; why?: string | null };

const TIMES = ['10:00', '13:00', '17:00', '18:00', '19:00', '20:00', '21:00'];

/** One tappable idea. Selected, it takes the page colour. */
function IdeaRow({ pick, selected, onPress, tag }: { pick: Pick; selected: boolean; onPress: () => void; tag?: string }) {
  const { color } = useAspect();
  return (
    <Press label={pick.title} role="radio" state={{ selected }} onPress={onPress} feel="tick"
      style={[s.idea, selected && { backgroundColor: tint(color, 0.12), borderColor: tint(color, 0.5) }]}>
      <View style={s.flex}>
        <Text style={[t.strong, selected && { color }]}>{pick.title}</Text>
        {pick.why ? <Text style={t.small}>{pick.why}</Text> : null}
      </View>
      {tag ? <Text style={t.caption}>{tag}</Text> : null}
    </Press>
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
  const ai = useGet<{ item: AiAnswer | null }>(who ? `/mod/friends/ideas?person=${encodeURIComponent(who)}` : null);
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
  const days = Array.from({ length: 14 }, (_, i) => addDays(today(), i));

  return (
    <Screen open={open} onClose={onClose} title={made ? 'Plan made' : 'New plan'}>
      {made ? (
        <Animated.View entering={FadeIn.duration(200)} style={s.gap24}>
          <Card tone={color} style={s.gap12}>
            <Text style={[t.label, { color }]}>{plan?.date ? `${dayAhead(plan.date)}${plan.slot ? `, ${plan.slot}` : ''}` : ''}</Text>
            <Text style={t.title2}>{plan?.title ?? what?.title}</Text>
            <Text style={t.small}>With {person ? person.name : ''}</Text>
          </Card>
          <View style={s.gap8}>
            <Field label="Invite" value={invite} onChangeText={setInvite} multiline maxLength={300} />
            <Text style={t.caption}>Edit it if you like. Nothing is sent from here.</Text>
          </View>
          <Button label="Copy invite" kind="accent" onPress={async () => {
            a.patchPlan(made, { invite });
            const ok = await copy(invite);
            notice(ok ? 'Invite copied. Send it from your messages.' : "Couldn't copy on this device.");
          }} />
          <Button label="Done" kind="quiet" onPress={() => { a.patchPlan(made, { invite }); onClose(); }} />
        </Animated.View>
      ) : (
        <>
          <Section title="Who">
            {people.length ? (
              <View style={s.chips}>
                {people.map((p) => <Chip key={p.id} label={people.filter((x) => firstName(x) === firstName(p)).length > 1 ? p.name : firstName(p)} selected={who === p.id}
                  onPress={() => { setWho(p.id); askIdeas(p.id); if (!preset.idea) setWhat(null); setDay(null); }} />)}
              </View>
            ) : <Text style={t.small}>Add a friend or someone you met first.</Text>}
          </Section>

          {who ? (
            <Section title="What">
              <View style={s.gap8}>
                {nv ? <Text style={t.caption}>Small and close to where you met works best for a first plan.</Text> : null}
                {preset.idea && what && !ordered.some((o) => o.key === what.key) && !aiPicks.some((o) => o.key === what.key) ? (
                  <IdeaRow pick={what} selected onPress={() => {}} />
                ) : null}
                {aiPicks.map((p) => <IdeaRow key={p.key} pick={p} selected={what?.key === p.key} onPress={() => { setWhat(p); setDay(null); }} />)}
                {aiBusy ? <View style={s.aiWait}><Loading /><Text style={[t.small, s.center]}>Thinking of ideas for you two. Pick one below meanwhile.</Text></View> : null}
                {!aiBusy && aiError && !aiPicks.length ? (
                  <View style={s.aiNote}>
                    <Text style={[t.small, s.flex]}>Ideas from Claude are not available right now.</Text>
                    <Press label="Try again for ideas" onPress={() => ask(true)} hitSlop={10}><Text style={[t.label, { color }]}>Try again</Text></Press>
                  </View>
                ) : null}
                {!aiBusy && answer ? (
                  <View style={s.aiNote}>
                    <Text style={[t.caption, s.flex]}>{answer.date === today() ? 'Ideas from Claude, today' : `Ideas from Claude, ${whenAgo(answer.date)}`}</Text>
                    <Press label="Ask for fresh ideas" onPress={() => ask(true)} hitSlop={10}><Text style={[t.label, { color }]}>Fresh ideas</Text></Press>
                  </View>
                ) : null}
                {shown.map((p) => <IdeaRow key={p.key} pick={p} selected={what?.key === p.key} onPress={() => { setWhat(p); setDay(null); }} tag={p.idea == null ? 'Yours' : undefined} />)}
                {ordered.length > 4 ? (
                  <Press label={moreIdeas ? 'Fewer ideas' : 'More ideas'} onPress={() => setMoreIdeas((x) => !x)} feel="tick" style={s.more}>
                    <Text style={[t.label, { color }]}>{moreIdeas ? 'Fewer ideas' : 'More ideas'}</Text>
                  </Press>
                ) : null}
                {writing ? (
                  <View style={s.ownRow}>
                    <View style={s.flex}><Field value={own} onChangeText={setOwn} placeholder="What do you want to do?" autoFocus maxLength={60}
                      onSubmit={() => { if (own.trim()) { setWhat({ key: 'own', title: own.trim(), act: null, invite: null, idea: null }); setWriting(false); } }} /></View>
                    <Button label="Use" kind="quiet" small disabled={!own.trim()} onPress={() => { setWhat({ key: 'own', title: own.trim(), act: null, invite: null, idea: null }); setWriting(false); }} />
                  </View>
                ) : what?.key === 'own' ? (
                  <IdeaRow pick={what} selected onPress={() => setWriting(true)} />
                ) : (
                  <Press label="Something else" onPress={() => setWriting(true)} feel="tick" style={s.more}>
                    <Text style={[t.label, { color }]}>Something else</Text>
                  </Press>
                )}
              </View>
            </Section>
          ) : null}

          {who && what ? (
            <Section title="When">
              <View style={s.chips}>
                {free.slice(0, 6).map((w) => (
                  <Chip key={w.date} label={`${dayAhead(w.date)}, ${roundSlot(w.from)}`} onPress={() => void create(w.date, roundSlot(w.from))} />
                ))}
                <Chip label="Another day" selected={day != null} onPress={() => setDay(day ? null : today())} />
              </View>
              {!free.length ? <Text style={t.caption}>{week ? 'No long free stretch in your calendar this week.' : 'Your calendar did not load. Pick a day.'}</Text> : null}
              {day ? (
                <Animated.View entering={FadeIn.duration(160)} style={s.gap12}>
                  <View style={s.chips}>
                    {days.map((d) => <Chip key={d} label={dayAhead(d)} selected={day === d} onPress={() => setDay(d)} />)}
                  </View>
                  <Text style={t.label}>At</Text>
                  <View style={s.chips}>
                    {TIMES.map((tm) => <Chip key={tm} label={tm} onPress={() => void create(day, tm)} />)}
                    <Chip label="Time open" onPress={() => void create(day, null)} />
                  </View>
                </Animated.View>
              ) : null}
            </Section>
          ) : null}
        </>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  center: { textAlign: 'center' },
  gap8: { gap: SP[8] },
  gap12: { gap: SP[12] },
  gap24: { gap: SP[24] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SP[8] },
  idea: {
    flexDirection: 'row', alignItems: 'center', gap: SP[12], minHeight: 56, paddingHorizontal: SP[16], paddingVertical: SP[12],
    borderRadius: R.row, borderCurve: 'continuous', backgroundColor: SURF.row, borderWidth: 1, borderColor: 'transparent',
  },
  aiWait: { alignItems: 'center' },
  aiNote: { flexDirection: 'row', alignItems: 'center', gap: SP[12], minHeight: 36, paddingHorizontal: SP[4] },
  more: { minHeight: 44, justifyContent: 'center', paddingHorizontal: SP[4] },
  ownRow: { flexDirection: 'row', alignItems: 'flex-end', gap: SP[8] },
});
