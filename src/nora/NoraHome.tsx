import { BlurView } from 'expo-blur';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Card, clock, Empty, Failed, Glyph, Press, Section, Skeleton, SURF, t, tint } from '@/aspects/kit';
import { useReveal } from '@/components/Reveal';
import { ApiError } from '@/lib/api';
import { DEMO } from '@/lib/demo';
import { appName, nora, type FeedItem, type NoraHome as Home } from '@/lib/nora';
import { demoHome, demoMode } from '@/lib/noraDemo';
import { C } from '@/theme';
import { Composer, NGlyph, NORA, TopRow } from './parts';
import { callTransport, noraUi, useNora } from './state';
import { useDictate } from './useDictate';

// Home (the dock's left orb): what Nora has ready for him. Questions waiting on him first, each answered in a tap
// (or a few words, typed or said); then what she did today, each with Undo; what she noticed; her read of the day
// and when she last looked. It grows out of the orb and sits under the dock, so chat and the orb stay in reach.

const dockClear = (bottom: number) => Math.max(bottom, 12) + 12 + 64 + 40;
type Local = Record<string, { state: 'busy' | 'yes' | 'no' | 'sent' | 'undone' | 'snoozed'; error?: string }>;
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Still up' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function useHome(open: boolean) {
  const [data, setData] = useState<Home | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async (quiet = false) => {
    if (!quiet) setRefreshing(true);
    try {
      if (DEMO) {
        await new Promise((r) => setTimeout(r, 500));
        if (demoMode() === 'home-fail') throw new ApiError(0, "Can't reach your PC. Check it's on and online.");
        setData(demoHome());
      } else setData(await nora.home());
      setError(null);
    } catch (e) { setError(errText(e)); } finally { setRefreshing(false); }
  }, []);
  useEffect(() => {
    if (!open) return;
    const first = setTimeout(() => void load(true), 0);
    const id = setInterval(() => void load(true), 60_000);
    return () => { clearTimeout(first); clearInterval(id); };
  }, [open, load]);
  return { data, error, refreshing, load };
}

export function NoraHome({ origin }: { origin: { x: number; y: number } }) {
  const ui = useNora();
  const r = useReveal(ui.home, origin);
  if (!r.ever) return null;
  return (
    <Animated.View style={[r.shell, !r.mounted && s.hidden]} pointerEvents={ui.home ? 'auto' : 'none'}>
      <Animated.View style={r.stage}>
        <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, s.tint]} />
        <Animated.View style={[{ width: r.width, height: r.height }, r.content]}>
          <HomeBody open={ui.home} />
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

function HomeBody({ open }: { open: boolean }) {
  const insets = useSafeAreaInsets();
  const h = useHome(open);
  const [local, setLocal] = useState<Local>({});
  const [answering, setAnswering] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const dict = useDictate();
  const mark = (id: string, v: Local[string] | null) => setLocal((l) => {
    const n = { ...l };
    if (v) n[id] = v; else delete n[id];
    return n;
  });
  const run = async (id: string, done: Local[string]['state'], job: () => Promise<unknown>) => {
    mark(id, { state: 'busy' });
    try {
      const out = (await job()) as { error?: string } | undefined;
      if (out?.error) throw new Error(out.error);
      mark(id, { state: done });
      void h.load(true);
    } catch (e) { mark(id, { state: 'busy', error: errText(e) }); setTimeout(() => mark(id, null), 4000); }
  };

  const d = h.data;
  const asks = d?.asks ?? [];
  const items = d ? [...d.items, ...d.older.filter((x) => !d.items.some((y) => y.id === x.id))] : [];
  const did = items.filter((x) => x.kind === 'did');
  const noticed = items.filter((x) => x.kind !== 'did' && x.kind !== 'ask' && x.status !== 'expired');
  const nothing = !!d && !asks.length && !did.length && !noticed.length;
  const sub = !d ? `${greeting()}.` : asks.length ? `${greeting()}. ${asks.length === 1 ? 'One thing' : `${asks.length} things`} waiting on you.` : `${greeting()}. Nothing waiting on you.`;

  const answer = (x: FeedItem, text: string) => {
    setAnswering(null);
    void run(x.id, 'sent', () => (DEMO ? Promise.resolve() : nora.answerItem(x.id, { choice: 'yes', text })));
  };

  return (
    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
      contentContainerStyle={[s.content, { paddingTop: insets.top + 8, paddingBottom: dockClear(insets.bottom) + 24 }]}
      refreshControl={<RefreshControl refreshing={h.refreshing} onRefresh={() => void h.load()} tintColor={C.muted} />}>
      <TopRow title="Ready for you" sub={sub} onClose={noraUi.closeHome} />

      {!d && !h.error ? (
        <View style={s.gap12}><Skeleton height={112} radius={24} /><Skeleton height={20} width={140} radius={6} /><Skeleton height={148} radius={24} /><Skeleton height={148} radius={24} /></View>
      ) : !d ? (
        <Failed message={h.error ?? ''} onRetry={() => void h.load()} />
      ) : (
        <>
          {d.inCall ? (
            <Card tone={NORA} style={s.row}>
              <Text style={[t.strong, s.flex]}>On a call with {d.name}</Text>
              <Button label="Open call" small kind="accent" color={NORA} onPress={() => noraUi.call({ follow: true })} />
            </Card>
          ) : null}

          <Card style={s.gap8}>
            <Text style={t.heading}>{d.mood?.label ?? 'Today'}</Text>
            {d.mood?.line ? <Text style={t.body}>{d.mood.line}</Text> : null}
            {d.busy ? <Text style={t.small}>Busy with {d.busy.title} until {clock(d.busy.until)}</Text> : null}
            {d.heartbeat.last ? (
              <Text style={t.small}>Last looked at {d.heartbeat.last.time}{d.heartbeat.last.note ? `: ${d.heartbeat.last.note}` : ''}</Text>
            ) : <Text style={t.small}>{d.heartbeat.on ? "She hasn't looked yet today." : 'Her check ins are off.'}</Text>}
          </Card>
          {h.error ? <Text style={t.caption}>{h.error}</Text> : null}

          {asks.length ? (
            <Section title="Waiting on you">
              {asks.map((x) => (
                <AskCard key={x.id} x={x} local={local[x.id]} open={answering === x.id}
                  onYes={() => {
                    if (x.ask?.question) { dict.cancel(); setDraft(''); setAnswering(x.id); return; }
                    void run(x.id, 'yes', () => (DEMO ? Promise.resolve() : nora.answerItem(x.id, { choice: 'yes' })));
                  }}
                  onNo={() => void run(x.id, 'no', () => (DEMO ? Promise.resolve() : nora.answerItem(x.id, { choice: 'no', text: x.ask?.question ? 'Not now' : undefined })))}
                  reply={answering === x.id ? (
                    <View style={s.gap8}>
                      <Composer draft={draft} setDraft={setDraft} onSend={(text) => answer(x, text)} dict={dict} autoFocus
                        inset placeholder="Your answer" label={`Your answer for ${x.from ?? 'them'}`} />
                      <Press label="Cancel answering" onPress={() => { dict.cancel(); setAnswering(null); }} style={s.cancel}>
                        <Text style={t.label}>Cancel</Text>
                      </Press>
                    </View>
                  ) : null} />
              ))}
            </Section>
          ) : null}

          {did.length ? (
            <Section title="Done for you today">
              <View style={s.list}>
                {did.map((x, i) => {
                  const st = local[x.id], undone = x.undone || st?.state === 'undone';
                  return (
                    <ItemRow key={x.id} first={i === 0} x={x} sub={`${appName(x.app)} at ${x.time}${x.source === 'call' ? ', on a call' : ''}`} dim={undone}
                      error={st?.error}
                      right={undone ? <Text style={t.caption}>Undone</Text>
                        : x.undo ? <SmallAct label="Undo" what={x.title} busy={st?.state === 'busy' && !st.error}
                          onPress={() => void run(x.id, 'undone', () => (DEMO ? Promise.resolve() : nora.undoItem(x.id)))} /> : null} />
                  );
                })}
              </View>
            </Section>
          ) : null}

          {noticed.length ? (
            <Section title="Noticed">
              <View style={s.list}>
                {noticed.map((x, i) => {
                  const st = local[x.id], snoozable = x.status === 'open' && !!x.ladder;
                  return (
                    <ItemRow key={x.id} first={i === 0} x={x} sub={x.text ?? `${appName(x.app)} at ${x.time}`} error={st?.error}
                      right={st?.state === 'snoozed' ? <Text style={t.caption}>In 10 min</Text>
                        : snoozable ? <SmallAct label="Later" what={x.title} busy={st?.state === 'busy' && !st.error}
                          onPress={() => void run(x.id, 'snoozed', () => (DEMO ? Promise.resolve() : nora.snoozeItem(x.id, 10)))} /> : null} />
                  );
                })}
              </View>
            </Section>
          ) : null}

          {nothing ? (
            <Empty title="Nothing waiting on you" body={`${d.name} puts what she finds here as the day goes: questions for you, what she did and what she noticed.`}
              action={`Chat with ${d.name}`} onAction={() => noraUi.openChat()} />
          ) : null}

          {d.upcoming?.length ? (
            <Section title="Coming up">
              <View style={s.list}>
                {d.upcoming.map((x, i) => <CallRow key={x.id} first={i === 0} glyph={/call/i.test(x.title) ? 'phone' : 'sparkle'}
                  label={upcomingLabel(x.title, whenOf(x.at, x.time, d.day))} />)}
              </View>
            </Section>
          ) : null}

          {d.calls.morning || d.calls.night ? (
            <Section title="Calls" action={callTransport() !== 'none' ? 'Call now' : undefined} onAction={() => noraUi.call()}>
              <View style={s.list}>
                {d.calls.morning ? <CallRow first label={`Morning call at ${d.calls.morning}`} /> : null}
                {d.calls.night ? <CallRow first={!d.calls.morning} label={`Night call at ${d.calls.night}`} /> : null}
              </View>
            </Section>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

function AskCard({ x, local, open, onYes, onNo, reply }: {
  x: FeedItem; local?: Local[string]; open: boolean; onYes: () => void; onNo: () => void; reply: React.ReactNode;
}) {
  const [more, setMore] = useState(false);
  const urgent = x.urgency >= 80;
  const done = local && local.state !== 'busy' ? local.state : null;
  const busy = local?.state === 'busy' && !local.error;
  return (
    <Animated.View layout={LinearTransition.duration(200)}>
      <Card style={s.gap12} tone={urgent && !done ? NORA : undefined}>
        <View style={s.row}>
          <Text style={[t.caption, s.flex]} numberOfLines={1}>{x.from ?? appName(x.app)}</Text>
          {urgent && !done ? <Text style={[t.caption, { color: NORA }]}>Urgent</Text> : null}
          <Text style={[t.caption, t.num]}>{x.time}</Text>
        </View>
        <Text style={t.strong}>{x.title}</Text>
        {x.text ? (
          <Press label={more ? 'Show less' : 'Show all'} feel="none" scale={1} onPress={() => setMore((v) => !v)}>
            <Text style={t.small} numberOfLines={more ? undefined : 3}>{x.text}</Text>
          </Press>
        ) : null}
        {x.ask?.draft ? <View style={s.draft}><Text style={t.small}>{x.ask.draft}</Text></View> : null}
        {done ? (
          <Animated.View entering={FadeIn.duration(160)} style={s.row}>
            <Glyph sf="checkmark.circle.fill" d="M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18zM8 12.5l2.5 2.5L16 9.5" size={16} color={C.muted} />
            <Text style={t.small}>{done === 'sent' ? `Sent to ${x.from ?? 'them'}` : done === 'no' ? 'Not now' : 'Done'}</Text>
          </Animated.View>
        ) : open ? reply : (
          <View style={s.row}>
            <Button label={x.ask?.yes ?? 'Yes'} small onPress={onYes} busy={busy} />
            <Button label={x.ask?.no ?? 'Not now'} small kind="quiet" onPress={onNo} disabled={busy} />
          </View>
        )}
        {local?.error ? <Text style={[t.caption, { color: C.danger }]}>{local.error}</Text> : null}
      </Card>
    </Animated.View>
  );
}

function ItemRow({ x, sub, right, first, dim, error }: { x: FeedItem; sub: string; right: React.ReactNode; first: boolean; dim?: boolean; error?: string }) {
  return (
    <View style={[s.item, !first && s.itemLine]}>
      <View style={s.flex}>
        <Text style={[t.body, dim && s.struck]} numberOfLines={2}>{x.title}</Text>
        <Text style={t.caption} numberOfLines={2}>{sub}</Text>
        {error ? <Text style={[t.caption, { color: C.danger }]}>{error}</Text> : null}
      </View>
      {right}
    </View>
  );
}

/** A small action at the end of a row ("Undo", "Later"), named with its row for VoiceOver. */
function SmallAct({ label, what, onPress, busy }: { label: string; what: string; onPress: () => void; busy?: boolean }) {
  return (
    <Press label={`${label}: ${what}`} onPress={onPress} disabled={busy} hitSlop={4} wrap={s.act} style={s.small}>
      {busy ? <ActivityIndicator size="small" color={C.text} /> : <Text style={[t.label, { color: C.text }]}>{label}</Text>}
    </Press>
  );
}

// "11:00" today, "Tomorrow 11:00", or "25 Nov 11:00" (days in IST, like the server's)
function whenOf(at: string, time: string, today: string) {
  const day = (ms: number) => new Date(ms + 330 * 60_000).toISOString().slice(0, 10);
  const d = day(Date.parse(at));
  if (d === today) return time;
  if (d === day(Date.parse(`${today}T12:00:00+05:30`) + 86_400_000)) return `Tomorrow ${time}`;
  const [, m, dd] = d.split('-');
  return `${Number(dd)} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m) - 1]} ${time}`;
}

// Her job names start with their time ("11:00 call: Mandeep follow-ups"): "Call at 11:00: Mandeep follow-ups"
function upcomingLabel(title: string, when: string) {
  const m = /^\d{1,2}:\d{2}\s*(call)?\s*:?\s*/i.exec(title);
  const rest = m ? title.slice(m[0].length) : title;
  return m?.[1] ? `Call at ${when}: ${rest}` : `${when}: ${rest}`;
}

function CallRow({ label, first, glyph = 'phone' }: { label: string; first: boolean; glyph?: 'phone' | 'sparkle' }) {
  return (
    <View style={[s.item, !first && s.itemLine]}>
      <NGlyph name={glyph} size={16} color={C.muted} />
      <Text style={[t.body, s.flex]}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  hidden: { display: 'none' },
  tint: { backgroundColor: 'rgba(9,10,14,0.96)' },
  content: { paddingHorizontal: 16, gap: 24 },
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  gap8: { gap: 8 },
  gap12: { gap: 12 },
  list: { borderRadius: 24, borderCurve: 'continuous', backgroundColor: SURF.card, paddingHorizontal: 16 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 12 },
  itemLine: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: SURF.line },
  struck: { textDecorationLine: 'line-through', color: C.faint },
  act: { flexShrink: 0 },
  small: { height: 40, minWidth: 64, paddingHorizontal: 16, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: SURF.raised },
  draft: { borderLeftWidth: 2, borderColor: tint(C.text, 0.24), paddingLeft: 12 },
  cancel: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: 16 },
});
