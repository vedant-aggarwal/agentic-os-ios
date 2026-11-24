import { useState } from 'react';
import { Text, View } from 'react-native';
import { Image } from 'expo-image';
import { C } from '@/theme';
import { fileSource } from '@/lib/mod';
import { Button, Card, Failed, Icon, Loading, myDay, Press, Row, Screen, Section, Sheet, shortDay, Skeleton, Spark, SP, t, useAspect } from '@/aspects/kit';
import {
  agoDays, dropScan, filePath, readScan, startScan, tick, useFace, usePoll, useProtocols, useRubric, type Face, type FaceFeature, type Pick, type Protocol, type RoutineRow,
} from '../api';
import { useNav } from '../nav';
import { CHANGE, Delta, EvidenceTag, EVIDENCE, List, Score, ScoreRow, Tag, s as u, useInnerWidth, useSeen } from '../ui';

export const FREQ: Record<Protocol['freq'], string> = { daily: 'Every day', '3x': 'Three times a week', '2x': 'Twice a week', weekly: 'Once a week', once: 'Once' };
export const WHEN: Record<'am' | 'pm' | 'day', string> = { am: 'Morning', day: 'Through the day', pm: 'Night' };

export function FaceScreen({ open, onClose, title }: { open: boolean; onClose: () => void; title: string }) {
  const read = useFace(useSeen(open));
  const nav = useNav();
  const [feature, setFeature] = useState<string | null>(null);
  const [proto, setProto] = useState<{ p: Protocol; why?: string } | null>(null);
  const { data, error, refresh } = read;
  const working = !!data?.open && (data.open.status === 'reading' || data.open.status === 'planning');
  usePoll(refresh, open && working, 4000);
  return (
    <>
      <Screen open={open} onClose={onClose} title={title}>
        {!data && error ? <Failed message={error} onRetry={() => { void refresh(); }} /> : null}
        {!data && !error ? <View style={u.gap16}><Skeleton height={200} radius={24} /><Skeleton height={180} radius={24} /><Skeleton height={300} radius={24} /></View> : null}
        {data ? (
          <>
            {data.open ? <OpenScan f={data} /> : null}
            {data.latest ? <Hero f={data} /> : !data.open ? <Intro onStart={() => nav.openFlow({ kind: 'scan' })} /> : null}
            {data.routine.total ? <RoutineCard f={data} /> : null}
            {data.latest ? <Features f={data} onOpen={setFeature} /> : null}
            {data.plan ? <PlanCard f={data} onOpen={(p, why) => setProto({ p, why })} /> : null}
            {data.latest ? <Progress f={data} /> : null}
            {data.latest || data.plan ? <LeftOut /> : null}
            {data.latest ? <About f={data} /> : null}
          </>
        ) : null}
      </Screen>
      <FeatureDetail id={feature} f={data} onClose={() => setFeature(null)} onProto={(p) => setProto({ p })} />
      <ProtocolSheet item={proto} onClose={() => setProto(null)} />
    </>
  );
}

function Intro({ onStart }: { onStart: () => void }) {
  const rubric = useRubric();
  return (
    <Card style={u.gap12}>
      <Text style={t.title2}>Your face, measured</Text>
      <Text style={t.body}>Six photos from your library: front, smile, both profiles, three quarter and skin up close. The PC checks each for light and focus, then Nora reads them twice against a fixed rubric. You get a score for each feature, what can change and what is structure, and a plan from a library of protocols with honest evidence.</Text>
      {rubric.data ? <Text style={t.small}>{rubric.data.light}</Text> : null}
      <Button label="Start scan" kind="accent" onPress={onStart} />
    </Card>
  );
}

/** A scan that is being shot, read, or needs another go. */
function OpenScan({ f }: { f: Face }) {
  const nav = useNav();
  const a = useAspect();
  const o = f.open!;
  const [busy, setBusy] = useState(false);
  if (o.status === 'reading' || o.status === 'planning') {
    return <Card tone={a.color}><Loading label={o.status === 'reading' ? 'Nora is reading your photos twice and comparing the reads. About two minutes; you can leave.' : 'Nora is picking your plan from the protocol library.'} /></Card>;
  }
  const n = Object.keys(o.photos ?? {}).length;
  const again = async () => { setBusy(true); try { await readScan(o.id); } catch (e) { a.notice((e as Error).message); } setBusy(false); };
  return (
    <Card tone={a.color} style={u.gap12}>
      <Text style={[t.label, { color: a.color }]}>{o.status === 'shooting' ? 'Scan in progress' : o.status === 'refused' ? 'The scan needs another photo' : 'The reading stopped'}</Text>
      <Text style={t.body}>{o.status === 'shooting' ? `${n} of 6 photos taken.` : o.refuse ?? o.error ?? ''}</Text>
      <View style={u.row}>
        {o.status === 'failed' && n === 6 ? <Button label="Read again" kind="accent" busy={busy} onPress={() => { void again(); }} wrap={u.flex} />
          : <Button label={o.status === 'shooting' ? 'Continue' : 'Retake photos'} kind="accent" onPress={() => nav.openFlow({ kind: 'scan' })} wrap={u.flex} />}
        <Button label="Throw away" kind="quiet" onPress={() => { void dropScan(o.id); }} />
      </View>
    </Card>
  );
}

/** "Front only" when only the front photo could be read, else "8 of 12 measured" when some features weren't seen. */
export const scopeWord = (sc: { measured: number; of: number; shots: string[]; partial: boolean } | undefined) =>
  !sc ? null : sc.partial && sc.shots.length === 1 && sc.shots[0] === 'front' ? 'Front only' : sc.measured < sc.of ? `${sc.measured} of ${sc.of} measured` : null;
const listOf = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}` : xs[0] ?? '');

function Hero({ f }: { f: Face }) {
  const nav = useNav();
  const a = useAspect();
  const l = f.latest!;
  const days = Math.max(0, Math.round((Date.parse(`${myDay()}T00:00:00Z`) - Date.parse(`${l.date}T00:00:00Z`)) / 864e5));
  const due = f.due;
  const sc = l.scope;
  const word = scopeWord(sc);
  const retake = sc?.retake ?? [];
  const [busy, setBusy] = useState(false);
  // a retake starts a scan with this one's good photos already in, so only the refused angles are left
  const again = async () => {
    setBusy(true);
    try { await startScan(l.id); nav.openFlow({ kind: 'scan' }); } catch (e) { a.notice((e as Error).message); }
    setBusy(false);
  };
  const compared = l.delta != null && sc && l.compared != null && l.compared < sc.of ? ` The change compares only the ${l.compared} features measured in both scans.` : '';
  return (
    <Card style={u.gap12}>
      <Text style={t.label}>Overall</Text>
      <View style={u.between}>
        <View style={u.row}>
          <Score v={l.overall} margin={l.margin} />
          {word ? <Tag>{word}</Tag> : null}
        </View>
        <Delta d={l.delta} />
      </View>
      <Text style={t.small}>{`${shortDay(l.date)}, ${agoDays(days)}. Nora's reading of your photos against a fixed rubric${sc && sc.measured < sc.of ? `, the average of the ${sc.measured} features it could see` : ''}. A change inside the margin is not counted.${compared}`}</Text>
      {retake.length && !f.open ? (
        <View style={u.between}>
          <Text style={[t.small, u.flex]}>{`The ${listOf(retake.map((x) => SHOT_WORD[x] ?? x))} ${retake.length === 1 ? 'photo' : 'photos'} couldn't be read, so those features are left out.`}</Text>
          <Button label={`Retake ${retake.length} ${retake.length === 1 ? 'photo' : 'photos'}`} kind="soft" small busy={busy} onPress={() => { void again(); }} />
        </View>
      ) : null}
      {due ? (
        <View style={u.between}>
          <Text style={[t.small, u.flex]}>{due.days <= 0 ? 'Rescan due. Skin turns over in about four weeks; two weeks shows the start.' : due.days === 1 ? 'Next scan tomorrow.' : `Next scan on ${shortDay(due.date)}.`}</Text>
          <Button label="Rescan" kind={due.days <= 0 ? 'soft' : 'quiet'} small onPress={() => nav.openFlow({ kind: 'scan' })} />
        </View>
      ) : null}
    </Card>
  );
}

// ── today's routine ──
function RoutineCard({ f }: { f: Face }) {
  const nav = useNav();
  const a = useAspect();
  const [local, setLocal] = useState<Record<string, boolean>>({});
  const r = f.routine;
  const toggle = async (x: RoutineRow) => {
    const on = !(local[x.id] ?? x.done);
    setLocal({ ...local, [x.id]: on });
    try { await tick(x.id, on); } catch (e) { setLocal((l) => { const n = { ...l }; delete n[x.id]; return n; }); a.notice((e as Error).message); }
  };
  const groups = (['am', 'day', 'pm'] as const).filter((w) => r[w].length);
  return (
    <Section title="Today's routine">
      {groups.map((w) => {
        const rows = r[w];
        const left = rows.filter((x) => !(local[x.id] ?? x.done));
        const min = rows.reduce((s, x) => s + (x.minutes ?? 0), 0);
        return (
          <Card key={w} style={u.gap4}>
            <View style={u.between}>
              <View>
                <Text style={t.strong}>{WHEN[w]}</Text>
                <Text style={[t.caption, t.num]}>{`${rows.length - left.length} of ${rows.length} done${min ? `, about ${min} min` : ''}`}</Text>
              </View>
              {left.length && rows.some((x) => x.steps.length) ? <Button label="Guide me" kind="soft" small onPress={() => nav.openFlow({ kind: 'routine', when: w })} /> : null}
            </View>
            {rows.map((x) => (
              <Row key={x.id} title={x.text} sub={x.minutes ? `${x.minutes} min` : null} done={local[x.id] ?? x.done} onToggle={() => { void toggle(x); }} />
            ))}
          </Card>
        );
      })}
    </Section>
  );
}

// ── features ──
function Features({ f, onOpen }: { f: Face; onOpen: (id: string) => void }) {
  const [all, setAll] = useState(false);
  const seen = f.features.filter((x) => x.v != null).sort((a, b) => (a.change === 'no' ? 1 : 0) - (b.change === 'no' ? 1 : 0) || (a.v ?? 0) - (b.v ?? 0));
  const unseen = f.features.filter((x) => x.v == null);
  const shown = all ? seen : seen.slice(0, 6);
  return (
    <Section title="By feature" action={seen.length > 6 ? (all ? 'Fewer' : `All ${seen.length}`) : undefined} onAction={() => setAll(!all)}>
      <List>
        {shown.map((x) => (
          <ScoreRow key={x.id} name={x.name} v={x.v} margin={x.margin} faint={x.change === 'no'} note={x.evidence || null} onPress={() => onOpen(x.id)}
            right={x.change === 'no' ? <Tag>Structure</Tag> : x.delta ? <Delta d={x.delta} /> : x.unsure ? <Tag>Unsure</Tag> : undefined} />
        ))}
      </List>
      {unseen.length ? <Text style={t.small}>{`Not seen this time: ${unseen.map((x) => x.name.toLowerCase()).join(', ')}. ${unseenWhy(f)}`}</Text> : null}
    </Section>
  );
}
const SHOT_WORD: Record<string, string> = { front: 'front', smile: 'smile', left: 'left profile', right: 'right profile', three: 'three quarter', skin: 'skin' };
// the refused photos get a Retake button beside the overall; here it only says what the overall leaves out
const unseenWhy = (f: Face) => ((f.latest?.checks ?? []).some((c) => !c.ok) ? 'The overall leaves them out.' : 'Retake those angles next scan.');

function FeatureDetail({ id, f, onClose, onProto }: { id: string | null; f: Face | null; onClose: () => void; onProto: (p: Protocol) => void }) {
  const rubric = useRubric();
  const lib = useProtocols();
  const w = useInnerWidth();
  const a = useAspect();
  const x: FaceFeature | undefined = f?.features.find((y) => y.id === id);
  const r = rubric.data?.features.find((y) => y.id === id);
  const inPlan = new Set((f?.plan?.picks ?? []).concat(f?.plan?.presentation ?? []).map((p) => p.id));
  const protos = (lib.data?.items ?? []).filter((p) => id && p.features.includes(id) && (x?.change !== 'no' || p.kind === 'presentation' || p.kind === 'refer'));
  return (
    <Screen open={!!id && !!x} onClose={onClose} title={x?.name ?? ''}>
      {x ? (
        <>
          <Card style={u.gap12}>
            <View style={u.between}><Score v={x.v} margin={x.margin} /><Tag>{CHANGE[x.change]}</Tag></View>
            {x.evidence ? <Text style={t.body}>{x.evidence}</Text> : null}
            {x.unsure ? <Text style={t.small}>Only one read could judge this, or the two reads disagreed, so the margin is wide.</Text> : null}
            {x.trend.filter((p) => p.v != null).length > 1 ? <Spark values={x.trend.map((p) => p.v)} width={w} height={56} /> : null}
          </Card>
          {r ? (
            <>
              <Section title="What can change"><Text style={t.body}>{r.can}</Text></Section>
              <Section title="What is structure"><Text style={t.body}>{r.fixed}</Text></Section>
              <Section title="How it is scored">
                <List>
                  {r.anchors.map((an, i) => {
                    const at = (i + 1) * 20;
                    const here = x.v != null && Math.abs(x.v - at) < 10;
                    return (
                      <View key={i} style={[u.row, { paddingVertical: SP[12], alignItems: 'flex-start' }]}>
                        <Text style={[t.strong, t.num, { width: 28 }, here && { color: a.color }]}>{at}</Text>
                        <Text style={[t.small, u.flex, here && { color: C.text }]}>{an}</Text>
                      </View>
                    );
                  })}
                </List>
              </Section>
            </>
          ) : <Skeleton height={200} radius={24} />}
          {protos.length ? (
            <Section title="What helps">
              <List>
                {protos.map((p) => <Row key={p.id} title={p.name} sub={`${EVIDENCE[p.evidence].word}${inPlan.has(p.id) ? ', in your plan' : ''}`} chevron onPress={() => onProto(p)} />)}
              </List>
            </Section>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

// ── the plan ──
function PlanCard({ f, onOpen }: { f: Face; onOpen: (p: Protocol, why: string) => void }) {
  const plan = f.plan!;
  return (
    <Section title="Your plan">
      {plan.summary ? <Text style={t.body}>{plan.summary}</Text> : null}
      <List>{plan.picks.map((p) => <PickRow key={p.id} p={p} onOpen={onOpen} />)}</List>
      {plan.presentation.length ? (
        <>
          <Text style={t.section}>For structure</Text>
          <List>{plan.presentation.map((p) => <PickRow key={p.id} p={p} onOpen={onOpen} />)}</List>
        </>
      ) : null}
      <Text style={t.caption}>{`Picked by ${plan.by === 'claude' ? 'Nora' : 'the rules'} from the protocol library, ${shortDay(plan.at.slice(0, 10))}.`}</Text>
    </Section>
  );
}
function PickRow({ p, onOpen }: { p: Pick; onOpen: (p: Protocol, why: string) => void }) {
  const pr = p.protocol;
  return (
    <Press label={`${pr.name}. ${p.why}`} onPress={() => onOpen(pr, p.why)} scale={0.99}>
      <View style={[u.gap8, { paddingVertical: SP[12] }]}>
        <View style={u.between}>
          <Text numberOfLines={1} style={[t.strong, u.flex]}>{pr.name}</Text>
          <Icon name="right" size={16} color={C.faint} />
        </View>
        <Text style={t.small}>{p.why}</Text>
        <View style={u.wrap}>
          <EvidenceTag level={pr.evidence} />
          {pr.kind === 'link' ? <Tag>In Gym and Diet</Tag> : pr.kind === 'refer' ? <Tag>A professional&apos;s call</Tag> : <Tag>{`${FREQ[pr.freq]}${pr.minutes ? `, ${pr.minutes} min` : ''}`}</Tag>}
        </View>
      </View>
    </Press>
  );
}

export function ProtocolSheet({ item, onClose }: { item: { p: Protocol; why?: string } | null; onClose: () => void }) {
  const nav = useNav();
  const p = item?.p;
  return (
    <Sheet open={!!p} onClose={onClose} title={p?.name}>
      {p ? (
        <>
          <View style={u.wrap}><EvidenceTag level={p.evidence} /><Tag>{`${FREQ[p.freq]}${p.minutes ? `, ${p.minutes} min` : ''}`}</Tag></View>
          <Text style={t.small}>{EVIDENCE[p.evidence].long}</Text>
          {item?.why ? <Text style={t.strong}>{item.why}</Text> : null}
          <Text style={t.body}>{p.does}</Text>
          {p.steps.length ? (
            <Section title="Steps">
              {p.steps.map((s, i) => (
                <View key={i} style={[u.row, { alignItems: 'flex-start' }]}>
                  <Text style={[t.label, t.num, { width: 20 }]}>{i + 1}</Text>
                  <Text style={[t.body, u.flex]}>{s.text}</Text>
                  {s.sec ? <Text style={[t.caption, t.num]}>{s.sec >= 60 ? `${Math.round(s.sec / 60)} min` : `${s.sec} s`}</Text> : null}
                </View>
              ))}
            </Section>
          ) : null}
          {p.cautions?.length ? <Section title="Careful">{p.cautions.map((c, i) => <Text key={i} style={t.small}>{c}</Text>)}</Section> : null}
          {p.kind === 'link' ? <Button label={p.link === 'diet' ? 'Open Diet' : 'Open Gym'} kind="soft" onPress={() => { onClose(); nav.openPart(p.link === 'diet' ? 'diet' : 'gym'); }} /> : null}
        </>
      ) : null}
    </Sheet>
  );
}

// ── progress: before and after ──
function Progress({ f }: { f: Face }) {
  const w = useInnerWidth();
  const first = f.first, last = f.latest!;
  const half = (w - SP[12]) / 2;
  return (
    <Section title="Progress">
      {first ? (
        <Card style={u.gap12}>
          {(['front', 'left', 'right'] as const).filter((k) => first.photos[k] && last.photos[k]).map((k) => (
            <View key={k} style={u.gap8}>
              <Text style={t.label}>{k === 'front' ? 'Front' : k === 'left' ? 'Left profile' : 'Right profile'}</Text>
              <View style={u.row}>
                {[first, last].map((s) => (
                  <View key={s.id} style={u.gap4}>
                    <Image source={fileSource(filePath(s.photos[k], true))} style={[u.thumb, { width: half, height: half * 1.25 }]} contentFit="cover" accessibilityLabel={`${k} photo, ${shortDay(s.date)}`} />
                    <Text style={t.caption}>{shortDay(s.date)}</Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
          {f.scans.length > 1 ? <Spark values={[...f.scans].reverse().map((s) => s.overall)} width={w} height={56} /> : null}
        </Card>
      ) : (
        <Card style={u.row}>
          {last.photos.front ? <Image source={fileSource(filePath(last.photos.front, true))} style={[u.thumb, { width: 72, height: 90 }]} contentFit="cover" accessibilityLabel="Front photo" /> : null}
          <Text style={[t.small, u.flex]}>Your first scan. The next one shows here side by side with this, angle by angle.</Text>
        </Card>
      )}
      {f.scans.length > 1 ? <List>{f.scans.map((s) => <Row key={s.id} title={shortDay(s.date)} right={s.overall != null ? `${s.overall}${s.margin ? ` ± ${s.margin}` : ''}` : ''} />)}</List> : null}
    </Section>
  );
}

function LeftOut() {
  const lib = useProtocols();
  const [open, setOpen] = useState(false);
  if (!lib.data) return null;
  return (
    <Section title="Left out on purpose" action={open ? 'Hide' : 'Why'} onAction={() => setOpen(!open)}>
      {open ? <List>{lib.data.never.map((n) => <Row key={n.name} title={n.name} sub={n.why} />)}</List>
        : <Text style={t.small}>Bone smashing, hard chewing, needling, drugs and crash diets are never in a plan.</Text>}
    </Section>
  );
}

function About({ f }: { f: Face }) {
  const rubric = useRubric();
  return (
    <Section title="About the score">
      <Text style={t.small}>{`Rubric ${f.rubric.replace('face-rubric-', 'version ')}. Each feature is read twice from the photos; the score is the average and the margin is how far the two reads differ, at least ${rubric.data?.margin ?? 4}. Skin tone, ethnicity and gender are never scored. Anything medical goes to a dermatologist or your orthodontist.`}</Text>
    </Section>
  );
}
