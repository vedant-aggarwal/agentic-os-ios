import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  addDays, Button, Card, CheckRing, Chip, Divider, Empty, Failed, Field, Glyph, haptic, Icon, Press, Row, Screen, Section, Segmented, Sheet,
  Skeleton, shortDay, t, tint, today, useAspect, weekday,
} from '@/aspects/kit';
import { call, newId, type Draft } from '@/lib/mod';
import { C } from '@/theme';
import { BUDGET, NEXT_STEPS, PLACE, PLACES } from './copy';
import { usePeople, usePrefs } from './data';
import { copyText, dueWords, placeAt, sinceDay, whenIn } from './parts';
import type { Budget, Follow, Person, Place, Step } from './types';

type Entry = { person: Person; follow: Follow | null };

/** "Met at a cafe, 3 days ago". */
export function metLine(e: Entry) {
  const m = e.follow?.met;
  const where = m?.place ? (m.place === 'other' ? 'somewhere else' : placeAt(m.place)) : e.person.where ? `at ${e.person.where}` : null;
  const day = m?.day ?? e.person.added ?? e.person.created_at?.slice(0, 10) ?? null;
  const when = day ? sinceDay(day) : null;
  return ['Met', where, when && /^\d+ [A-Z]/.test(when) ? `on ${when}` : when].filter(Boolean).join(' ');
}
export function nextLine(f: Follow | null) {
  if (!f?.next?.what) return null;
  const due = dueWords(f.next.due);
  return due ? `${f.next.what}, ${due}` : f.next.what;
}

// ── Talking to ───────────────────────────────────────────────────────────────────────────────────────────────────
export function PeopleScreen({ open, onClose, onOpen, onAdd, onLooking }: {
  open: boolean; onClose: () => void; onOpen: (id: string) => void; onAdd: () => void; onLooking: () => void;
}) {
  const p = usePeople();
  const prefs = usePrefs();
  const [showArchived, setShowArchived] = useState(false);
  const active = p.list?.filter((e) => !e.follow?.archived) ?? [];
  const archived = p.list?.filter((e) => e.follow?.archived) ?? [];
  return (
    <Screen open={open} onClose={onClose} title="Talking to">
      <Card onPress={onLooking} label="Edit what I'm looking for" style={s.gap8}>
        <View style={s.between}>
          <Text style={t.label}>What I&apos;m looking for</Text>
          <Icon name="pencil" size={16} color={C.muted} />
        </View>
        {prefs.looking ? <Text style={t.body}>{prefs.looking}</Text> : <Text style={t.small}>A few words in your own voice, read back when you decide whether to follow up. Only you see it.</Text>}
      </Card>

      {p.list == null ? (
        p.error ? <Failed message={p.error} onRetry={p.refresh} /> : <View style={s.gap12}>{[0, 1].map((i) => <Skeleton key={i} height={64} radius={16} />)}</View>
      ) : active.length === 0 ? (
        <Empty title="Nobody here yet" body="When you meet someone you'd like to see again, add them here or from the end of an outing. A first name or a nickname is enough." action="Add someone" onAction={onAdd} />
      ) : (
        <Section title="People" action="Add" onAction={onAdd} gap={0}>
          {active.map((e, i) => (
            <View key={e.person.id}>
              {i ? <Divider /> : null}
              <Row title={e.person.name} sub={[metLine(e), nextLine(e.follow) ? `Next: ${nextLine(e.follow)}` : null].filter(Boolean).join('. ')} chevron onPress={() => onOpen(e.person.id)} />
            </View>
          ))}
        </Section>
      )}

      {archived.length ? (
        <View style={s.gap8}>
          <Press label={showArchived ? 'Hide archived' : `Archived, ${archived.length}`} onPress={() => setShowArchived(!showArchived)} style={s.fold}>
            <Text style={t.label}>Archived ({archived.length})</Text>
            <Icon name={showArchived ? 'up' : 'down'} size={16} color={C.muted} />
          </Press>
          {showArchived ? archived.map((e) => <Row key={e.person.id} title={e.person.name} sub={metLine(e)} chevron onPress={() => onOpen(e.person.id)} />) : null}
        </View>
      ) : null}
    </Screen>
  );
}

// ── one person ──────────────────────────────────────────────────────────────────────────────────────────────────
export function PersonScreen({ id, onClose, onNext, onTalked }: { id: string | null; onClose: () => void; onNext: (id: string) => void; onTalked: (id: string) => void }) {
  const a = useAspect();
  const p = usePeople();
  const prefs = usePrefs();
  const [lineAt, setLineAt] = useState(0);
  const [busy, setBusy] = useState<'line' | 'ideas' | null>(null);
  const [budget, setBudget] = useState<Budget>('low');
  const [confirm, setConfirm] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const e = id ? p.list?.find((x) => x.person.id === id) ?? null : null;
  const f = e?.follow ?? null;
  // a follow up record is made the first time he sets something on it
  const save = (change: Partial<Follow>) => {
    if (!e) return Promise.resolve();
    const base: Draft<Follow> = f ? { ...f } : { id: e.person.id, person: e.person.id, done: [], archived: false };
    return p.follow.put({ ...base, ...change, id: e.person.id, person: e.person.id }).then(() => {}, (err: Error) => a.notice(err.message));
  };
  const markDone = () => {
    if (!f?.next) return;
    haptic.medium();
    void save({ next: null, done: [...(f.done ?? []), { what: f.next.what, at: new Date().toISOString() }] });
    a.notice('Done. What is the next step?');
    onNext(e!.person.id);
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
    void save({ plan: { title: idea.title, steps: idea.steps.map((text) => ({ text, done: false })), date: null } });
  };
  const tick = (i: number) => {
    if (!f?.plan) return;
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

  return (
    <Screen open={!!id} onClose={onClose} title={e?.person.name ?? ''}>
      {!e ? (
        p.list == null ? <Skeleton height={160} radius={24} /> : <Empty title="Not here any more" body="This person was archived or deleted." />
      ) : (
        <>
          <View style={s.gap4}>
            <Text style={t.small}>{metLine(e)}</Text>
            <Press label="What you talked about" onPress={() => onTalked(e.person.id)} style={s.talked}>
              <Text style={[t.body, s.flex, !f?.talked && { color: C.faint }]}>{f?.talked || 'What did you talk about? A few words help the next message.'}</Text>
              <Icon name="pencil" size={16} color={C.muted} />
            </Press>
          </View>

          <Section title="Next step" action={f?.next ? 'Change' : undefined} onAction={() => onNext(e.person.id)}>
            {f?.next ? (
              <Card tone={a.color} style={s.nextCard}>
                <Press label={`Mark done: ${f.next.what}`} role="checkbox" state={{ checked: false }} onPress={markDone} feel="none" hitSlop={10}>
                  <CheckRing done={false} size={28} />
                </Press>
                <View style={s.flex}>
                  <Text style={t.strong}>{f.next.what}</Text>
                  {f.next.due ? <Text style={t.small}>{capital(dueWords(f.next.due) ?? '')}</Text> : null}
                </View>
              </Card>
            ) : (
              <Button label="Set a next step" kind="soft" onPress={() => onNext(e.person.id)} />
            )}
            {f?.done?.length ? <Text style={t.caption}>Done: {f.done.slice(-3).map((x) => `${x.what.toLowerCase()} ${whenIn(x.at.slice(0, 10))}`).join(', ')}.</Text> : null}
          </Section>

          <Section title="A message you could send">
            {sentOne ? <Text style={t.small}>You&apos;ve sent one. If there&apos;s no reply, let it rest; that is an answer too.</Text> : null}
            {lines.length ? (
              <Card style={s.gap12}>
                <Text selectable style={t.lead}>{lines[lineAt % lines.length]}</Text>
                <View style={s.row}>
                  <Button label="Copy" kind="soft" small icon={<Glyph sf="doc.on.doc" d="M9 9h10v10H9zM5 15V5h10" size={14} color={a.color} />} onPress={() => { void copyText(lines[lineAt % lines.length]).then((ok) => a.notice(ok ? 'Copied. Edit it and send it yourself.' : "Couldn't copy here")); }} />
                  {lines.length > 1 ? <Button label="Another" kind="quiet" small onPress={() => setLineAt(lineAt + 1)} /> : null}
                  <Button label="New ones" kind="quiet" small busy={busy === 'line'} onPress={() => void ask('line')} />
                </View>
                <Text style={t.caption}>{f?.line?.by === 'ai' ? 'Written by AI from what you noted. Nothing is ever sent for you.' : 'A plain starting point. Nothing is ever sent for you.'}</Text>
              </Card>
            ) : (
              <Button label="Suggest a message" kind="quiet" busy={busy === 'line'} onPress={() => void ask('line')} />
            )}
          </Section>

          <Section title="Ideas to meet up">
            {f?.plan ? (
              <Card style={s.gap8}>
                <Text style={t.strong}>{f.plan.title}</Text>
                {f.plan.steps.map((st, i) => <Row key={st.text} title={st.text} done={st.done} onToggle={() => tick(i)} />)}
                <Button label="Pick another idea" kind="quiet" small onPress={() => void save({ plan: null })} wrap={s.selfStart} />
              </Card>
            ) : (
              <>
                <Segmented options={(Object.keys(BUDGET) as Budget[]).map((k) => ({ key: k, label: BUDGET[k] }))} value={budget} onChange={setBudget} />
                {f?.ideas && f.ideas.budget === budget ? (
                  <View style={s.gap12}>
                    {f.ideas.items.map((idea, i) => (
                      <Card key={idea.title} style={s.gap8}>
                        <View style={s.between}>
                          <Text style={[t.strong, s.flex]}>{idea.title}</Text>
                          <Text style={[t.label, t.num]}>{idea.cost}</Text>
                        </View>
                        <Text style={t.small}>{idea.why}</Text>
                        <Button label="Plan this" kind="soft" small onPress={() => pick(i)} wrap={s.selfStart} />
                      </Card>
                    ))}
                    <Text style={t.caption}>{f.ideas.by === 'ai' ? 'Suggested by AI from what you noted.' : 'From a short list, not from AI.'}</Text>
                  </View>
                ) : null}
                <Button label={f?.ideas?.budget === budget ? 'New ideas' : 'Suggest ideas'} kind="quiet" busy={busy === 'ideas'} onPress={() => void ask('ideas')} />
              </>
            )}
          </Section>

          {prefs.looking ? (
            <View style={s.gap8}>
              <Press label={showNote ? 'Hide what I am looking for' : 'Show what I am looking for'} onPress={() => setShowNote(!showNote)} style={s.fold}>
                <Text style={t.label}>What I&apos;m looking for</Text>
                <Icon name={showNote ? 'up' : 'down'} size={16} color={C.muted} />
              </Press>
              {showNote ? <Text style={t.body}>{prefs.looking}</Text> : null}
            </View>
          ) : null}

          <Divider />
          {confirm ? (
            <View style={s.gap8}>
              <Text style={t.small}>Delete everything about {e.person.name}: the name, where you met, notes and plans. This can&apos;t be undone.</Text>
              <View style={s.row}>
                <Button label="Keep" kind="quiet" onPress={() => setConfirm(false)} wrap={s.flex} />
                <Button label="Delete" kind="danger" onPress={() => void remove()} wrap={s.flex} />
              </View>
            </View>
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
const capital = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);

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
      <Text style={t.caption}>Kept on your PC. Delete it any time from their page.</Text>
    </Sheet>
  );
}

/** The next step with someone, and when. */
export function NextSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const a = useAspect();
  const p = usePeople();
  const e = id ? p.list?.find((x) => x.person.id === id) ?? null : null;
  const [what, setWhat] = useState('');
  const [due, setDue] = useState<string | null>(null);
  const [was, setWas] = useState<string | null>(null);
  if (id !== was) { setWas(id); if (id) { setWhat(e?.follow?.next?.what ?? ''); setDue(e?.follow?.next?.due ?? today()); } }
  const t0 = today();
  const sat = addDays(t0, (6 - weekday(t0) + 7) % 7 || 7);
  const dates: { label: string; day: string | null }[] = [
    { label: 'Today', day: t0 }, { label: 'Tomorrow', day: addDays(t0, 1) }, { label: weekday(t0) === 0 || weekday(t0) === 6 ? 'Next weekend' : 'This weekend', day: sat }, { label: 'Next week', day: addDays(t0, 7) }, { label: 'No date', day: null },
  ];
  const save = (next: Step | null) => {
    if (!e) return;
    const f = e.follow;
    const base: Draft<Follow> = f ? { ...f } : { id: e.person.id, person: e.person.id, done: [], archived: false };
    p.follow.put({ ...base, id: e.person.id, person: e.person.id, next }).catch((err: Error) => a.notice(err.message));
    onClose();
  };
  return (
    <Sheet open={!!id} onClose={onClose} title="Next step">
      <View style={s.chips}>{NEXT_STEPS.map((x) => <Chip key={x} label={x} selected={what === x} onPress={() => setWhat(x)} />)}</View>
      <Field label="Or your own" value={NEXT_STEPS.includes(what) ? '' : what} onChangeText={setWhat} placeholder="Something small and specific" maxLength={120} />
      <View style={s.gap8}>
        <Text style={t.label}>When</Text>
        <View style={s.chips}>{dates.map((d) => <Chip key={d.label} label={d.day && d.label.endsWith('weekend') ? `${d.label}, ${shortDay(d.day)}` : d.label} selected={due === d.day} onPress={() => setDue(d.day)} />)}</View>
      </View>
      <Button label="Save" kind="accent" onPress={() => save({ what: what.trim(), due })} disabled={!what.trim()} />
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
    const base: Draft<Follow> = f ? { ...f } : { id: e.person.id, person: e.person.id, done: [], archived: false };
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
      <Text style={t.small}>In your own words. Write it once and come back to it when you are deciding whether to follow up. Only you see it.</Text>
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
      <Stepper2 value={n} onChange={setN} color={a.color} />
      <Text style={t.small}>Start small. One or two on most days does more than one big day, and a quiet week resets nothing.</Text>
      <Button label="Save" kind="accent" onPress={save} />
    </Sheet>
  );
}

function Stepper2({ value, onChange, color }: { value: number; onChange: (v: number) => void; color: string }) {
  return (
    <View style={s.stepper} accessibilityRole="adjustable" accessibilityLabel="Conversations a week" accessibilityValue={{ text: String(value) }}>
      <Press label="Fewer" onPress={() => onChange(Math.max(1, value - 1))} disabled={value <= 1} style={s.stepBtn}><Icon name="minus" /></Press>
      <Text style={[t.display, t.num, s.stepValue, { color }]}>{value}</Text>
      <Press label="More" onPress={() => onChange(Math.min(30, value + 1))} disabled={value >= 30} style={s.stepBtn}><Icon name="plus" /></Press>
    </View>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  gap4: { gap: 4 },
  gap8: { gap: 8 },
  gap12: { gap: 12 },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  fold: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44 },
  talked: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 8 },
  nextCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  selfStart: { alignSelf: 'flex-start' },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24, paddingVertical: 8 },
  stepBtn: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.07)' },
  stepValue: { minWidth: 72, textAlign: 'center' },
  tintBg: { backgroundColor: tint('#000000', 0) },
});
