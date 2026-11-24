import { useCallback, useEffect, useMemo, useState } from 'react';
import { useIsFocused } from 'expo-router';
import { AppState, Platform, Pressable, RefreshControl, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
// gesture handler's ScrollView, so the hero's sideways drag can take over from the page's scroll
import { ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Backdrop, EdgeGlow } from '@/components/Backdrop';
import { EdgeBlur } from '@/components/EdgeBlur';
import { Dock, orbFromBottom } from '@/components/Dock';
import { Notice } from '@/components/Notice';
import { SignIn } from '@/components/SignIn';
import { AccountSheet } from '@/components/AccountSheet';
import { PcMicSheet } from '@/components/PcMicSheet';
import { VoicesSheet } from '@/components/VoicesSheet';
import { RemoteDesktop } from '@/components/remote/RemoteDesktop';
import { FilesSheet } from '@/components/FilesSheet';
import { PcControls, type PcTab } from '@/components/PcControls';
import { useAgent } from '@/lib/agent';
import { micCenter, pillCenter, TOP_GAP, TOP_H, TopBar } from '@/components/TopBar';
import { api, signOut } from '@/lib/api';
import { gazeTouch } from '@/lib/gaze';
import { useToday } from '@/lib/useToday';
import { useBody } from '@/lib/body';
import { startContactSync } from '@/lib/contacts';
import { TodayPlan, TodayToast, useTodayToast } from '@/today2/TodayPlan';
import { addReach } from '@/today2/day';
import type { AspectProgress } from '@/lib/today';
import { type NoraKeys, useWispr } from '@/lib/wispr';
import { noraUi } from '@/nora/state';
import { MoodLogger } from '@/mood/MoodLogger';
import { useKeyboardMic } from '@/lib/kbmic';
import { Hero, HERO_H } from '@/hero/Hero';
import { AspectHost, dockClearance, initialAspect, initialLink, type HostEntry } from '@/aspects/AspectHost';
import { LifeContext } from '@/aspects/_linked/life';
import { sectionEntry, SECTION_TARGETS } from '@/lib/aspectLinks';
import { onLink, openLink } from '@/lib/links';
import { invalidate, warm } from '@/lib/mod';
import { C, F, type AspectKey } from '@/theme';
import DeskToday from '@/desk/DeskToday';
import { useNora } from '@/nora/state';
import { useDesktop } from '@/desk/store';
import { preloadPages, WARM } from '@/aspects/registry';
import { DEMO } from '@/lib/demo';
import { PetLab } from '@/pet/PetLab';

// Volume down: a press rings Nora (not again while a call is up), a hold records a voice note to her chat.
const NORA_KEYS: NoraKeys = {
  tap: () => { if (!noraUi.inCall()) noraUi.call(); },
  holdStart: () => noraUi.voiceNote(),
  holdEnd: () => noraUi.voiceNoteSend(),
};

// A desktop browser gets its own layout (src/desk); phones and narrow windows keep this one.
// dev, web sample mode only: `?demo&petlab` opens the mood pet's test page (src/pet/PetLab)
const PET_LAB = DEMO && new URLSearchParams(location.search).has('petlab');
export default function Today() {
  return PET_LAB ? <PetLab /> : <TodayScreen />;
}

function TodayScreen() {
  // While Today sits on screen, get every aspect page ready so the first tap opens drawn: their reads in one round
  // trip (each request through the tunnel costs most of a second), and each page's code.
  useEffect(() => {
    let last = 0;
    const go = () => {
      if (Date.now() - last < 5 * 60_000) return;
      last = Date.now();
      void warm(WARM);
      preloadPages(); // web: each page's file; phone: each page's module, so the first tap draws at once
    };
    const t = setTimeout(go, 1500);
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') go(); });
    return () => { clearTimeout(t); sub.remove(); };
  }, []);
  return useDesktop() ? <DeskToday /> : <PhoneToday />;
}

function PhoneToday() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const t = useToday();
  const [local, setLocal] = useState<string | null>(null);
  const [aspect, setAspect] = useState<AspectKey | null>(initialAspect); // the aspect page the orb's dial opened
  const [immersive, setImmersive] = useState(false); // an aspect page's full-screen flow has hidden the dock
  const [entry, setEntry] = useState<HostEntry | null>(null); // a link on its way to the aspect page
  const doneEntry = useCallback((stamp: number) => setEntry((e) => (e?.stamp === stamp ? null : e)), []);
  const { reload } = t;
  // Back on Today: a section may have changed its tasks (a goal's task in Mission, a move from Growth's review).
  const closeAspect = useCallback(() => { setAspect(null); setImmersive(false); setEntry(null); void reload(); }, [reload]);
  // the orb's dial and a page's own jump open a page at its home
  const openAspect = useCallback((key: AspectKey) => { setEntry(null); setAspect(key); }, []);
  const [micOpen, setMicOpen] = useState(false); // opened by tapping the PC mic button
  const [voicesOpen, setVoicesOpen] = useState(false); // the top bar's waveform button
  const [accountOpen, setAccountOpen] = useState(false); // the top bar's person button
  // the mood logger, flying out of the smiley at this point (dev, web sample mode: `?demo&mood` gives the web bar the
  // phone's mood button, and `mood=1` also opens the logger on load)
  const [moodFrom, setMoodFrom] = useState<{ x: number; y: number } | null>(() =>
    DEMO && new URLSearchParams(location.search).get('mood') === '1' ? { x: width - 102, y: insets.top + 32 } : null);
  const [filesOpen, setFilesOpen] = useState(false); // the top bar's To PC button
  const [remoteOpen, setRemoteOpen] = useState(false); // the top bar's Remote PC button: the PC's screen, full screen
  const [pcTab, setPcTab] = useState<PcTab | null>(null); // hold Remote PC: media remote and power
  const [heroOn, setHeroOn] = useState(true); // the 3D hero renders only while some of it is on screen
  // Today's routine ticks per aspect (shower, meals, habits...), reported by the plan. The crystals and the orb's
  // arcs count them on top of the tasks, so every tick on Today fills its crystal.
  const [routine, setRoutine] = useState<AspectProgress | null>(null);
  const reach = useMemo(() => (t.view ? addReach(t.view.reach, routine) : {}), [t.view, routine]);
  const planned = useMemo(() => (t.view ? addReach(t.view.aspects, routine) : {}), [t.view, routine]);
  // A page pushed over Today (Work, a job, a project) leaves Today mounted underneath: both WebGL scenes stop then,
  // else they keep drawing every frame behind the page and the whole app stutters.
  const focused = useIsFocused();
  // dev, web sample mode only: window.__mood() opens the mood logger (for driving it from a test browser)
  useEffect(() => {
    if (DEMO) (window as unknown as { __mood?: (x?: number, y?: number) => void }).__mood = (x, y) => setMoodFrom({ x: x ?? width - 102, y: y ?? insets.top + 32 });
  }, [width, insets.top]);
  // volume up drives Wispr on the PC while Today is up; volume down is Nora's (a press calls, a hold is a voice note)
  const native = Platform.OS !== 'web'; // the web app has no PC controls: no Wispr, no PC agent
  const mic = useWispr(!!t.view && native, NORA_KEYS);
  const kbMic = useKeyboardMic(); // records for the keyboard extension (agenticos://flow)
  const agent = useAgent(!!t.view && native);
  const nu = useNora();
  const noraOpen = nu.chat;
  const callUp = !!nu.call; // a call owns the mic: the PC mic page stays shut while one is up (lib/calls.ts)
  const b = useBody(!!t.view); // today's workout, water and protein, under the Body part of the plan
  const tt = useTodayToast();
  const signedIn = !!t.view;
  useEffect(() => (signedIn ? startContactSync() : undefined), [signedIn]); // contacts to the PC, at most every 12 h (lib/contacts.ts)
  // A command is being taken or worked on (the Action button may have started it with the app shut): show it.
  const agentLive = agent.heard === 'listening' || agent.busy;
  const { settle } = mic;
  useEffect(() => { if (agent.busy || agent.heard === 'nothing') settle(); }, [agent.busy, agent.heard, settle]); // the PC took a locked command
  // Something is running: a dictation, a command being heard, or the agent working. The PC page opens for it,
  // and if he closes it, it stays closed (still running) until the next thing starts.
  const live = agentLive || mic.phase !== 'idle';
  const [closedLive, setClosedLive] = useState(false);
  if (!live && closedLive) setClosedLive(false);
  const notBuilt = useCallback((what: string) => setLocal(`${what}: not built yet`), []);
  const { clearNotice } = t;
  const clear = useCallback(() => { setLocal(null); clearNotice(); }, [clearNotice]);
  const { reload: reloadBody } = b;
  // Ticking a task here moves the goal it serves: Mission and Growth read it again.
  const { toggle: toggleTask, cancel: cancelTask, restore: restoreTask } = t;
  const toggle = useCallback(async (id: string) => { await toggleTask(id); invalidate('/mod/mission/'); invalidate('/mod/growth/'); }, [toggleTask]);
  // cancelling one for today (a repeating one skips to its next) or bringing it back moves its goal the same way
  const cancel = useCallback(async (id: string) => { await cancelTask(id); invalidate('/mod/mission/'); invalidate('/mod/growth/'); }, [cancelTask]);
  const restore = useCallback(async (id: string) => { await restoreTask(id); invalidate('/mod/mission/'); invalidate('/mod/growth/'); }, [restoreTask]);

  // Links into a section (agenticos://<aspect>/<part>, from a push, a widget, a tap on Today or another page) open
  // that page and hand it the part; agenticos://today comes back here.
  useEffect(() => {
    const offs = SECTION_TARGETS.map((target) => onLink(target, (link) => {
      const e = sectionEntry(link);
      if (!e) return;
      setAspect(e.aspect);
      setEntry(e);
    }));
    offs.push(onLink('today', () => closeAspect()));
    if (initialLink) openLink(initialLink);
    return () => { for (const off of offs) off(); };
  }, [closeAspect]);
  // A link for Today (a section, Nora, tasks, a push or widget tap) first closes the pages drawn over it, so what it
  // opens is in view; agenticos://voice opens Voices.
  useEffect(() => {
    const close = () => { setRemoteOpen(false); setFilesOpen(false); setVoicesOpen(false); setAccountOpen(false); setPcTab(null); setMoodFrom(null); };
    const offs = [...SECTION_TARGETS, 'today', 'nora', 'tasks'].map((target) => onLink(target, close));
    offs.push(onLink('voice', () => { close(); setVoicesOpen(true); }));
    return () => { for (const off of offs) off(); };
  }, []);

  if (t.state.status === 'loading') return <View style={s.screen} />;
  if (t.state.status === 'signedOut') return <SignIn onDone={t.reload} />;
  if (t.state.status === 'error' || !t.view) {
    return (
      <View style={[s.screen, s.center]}>
        <Backdrop />
        <Text style={s.errTitle}>Today didn&apos;t load</Text>
        <Text style={s.errBody}>{t.state.status === 'error' ? t.state.message : ''}</Text>
        <Pressable accessibilityRole="button" onPress={t.reload} style={s.retry}><Text style={s.retryText}>Try again</Text></Pressable>
      </View>
    );
  }

  const v = t.view;
  const orb = orbFromBottom(insets.bottom);
  return (
    // every touch on Today is passed to the smiley, which looks toward the finger
    <View style={s.screen} {...gazeTouch}>
      <Backdrop orb={orb} />
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        contentOffset={{ x: 0, y: insets.top + HERO_H - 40 }}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={100}
        onScroll={(e) => { const on = e.nativeEvent.contentOffset.y < insets.top + HERO_H; if (on !== heroOn) setHeroOn(on); }}
        refreshControl={<RefreshControl refreshing={t.refreshing} onRefresh={() => { t.refresh(); reloadBody(); }} tintColor={C.muted} />}>
        <Hero view={v} reach={reach} top={insets.top} topBar={TOP_GAP + TOP_H} active={focused && heroOn && !aspect && !moodFrom} />

        <View style={[s.sheet, { paddingBottom: insets.bottom + 140 }]}>
          {t.state.status === 'ready' ? (
            <TodayPlan today={t.state.today} life={t.state.life} areas={t.state.areas} body={b.body} say={tt.say} hide={tt.hide}
              onOpen={openLink} onToggleTask={(id) => { void toggle(id); }} onCancelTask={(id) => { void cancel(id); }} onRestoreTask={(id) => { void restore(id); }}
              onHome={() => setAspect(null)} onRoutine={setRoutine} />
          ) : null}
          <Pressable accessibilityRole="button" onPress={async () => { await signOut(); t.reload(); }} style={s.more}>
            <Text style={[s.moreText, { color: C.faint }]}>Sign out</Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* t^2.6 over the zone: about 1 pt where the navbar's top edge sits (40% down), then dense under the
          bar, 14 pt at the bottom edge */}
      {/* the same blur under the top bar, dense at the screen's top edge */}
      <EdgeBlur edge="top" height={insets.top + TOP_GAP + TOP_H + 28} strength={30} curve={2} />
      {/* on web the bar would sit over Nora's chat header */}
      {native || !noraOpen ? <TopBar top={insets.top} width={width} live={live} petActive={focused && !aspect} onMic={() => { setClosedLive(false); setMicOpen(true); }}
        onRemote={() => setRemoteOpen(true)} onRemoteHold={() => setPcTab('media')}
        onVoices={() => setVoicesOpen(true)} onFiles={() => setFilesOpen(true)} onAccount={() => setAccountOpen(true)} onMood={setMoodFrom} /> : null}
      {/* an aspect page grows out of the orb, over Today and its top bar; the dock stays above it */}
      {/* the pages read today's rows and tick them through Today, so a tick shows on both at once */}
      <LifeContext value={{ sections: v.sections, areaAspects: t.state.life.areaAspects, toggle }}>
        <AspectHost aspect={aspect} origin={{ x: width / 2, y: height - orb }} dock={immersive ? insets.bottom : dockClearance(insets.bottom)}
          entry={entry} onEntryDone={doneEntry} onClose={closeAspect} onOpen={openAspect} onNotice={setLocal} onImmersive={setImmersive} />
      </LifeContext>
      {/* a page's full-screen flow hides the dock, so the blur and glow under it go too (they washed out its buttons) */}
      {!immersive ? <EdgeBlur height={insets.bottom + 150} strength={35} curve={2.6} /> : null}
      {!immersive ? <EdgeGlow height={insets.bottom + 200} orb={orb} /> : null}
      <TodayToast toast={tt.toast} bottom={insets.bottom + 112} />
      <Notice text={kbMic.state === 'recording' ? 'Listening for the keyboard. Swipe back to your app and talk.' : kbMic.error ?? local ?? t.notice} bottom={insets.bottom + 112} onClear={clear} />
      <Dock bottom={insets.bottom} width={width} aspects={planned} onNotBuilt={notBuilt}
        onAspect={openAspect} onHome={aspect ? closeAspect : undefined} hidden={immersive} />
      {/* opens by itself while a volume press has Wispr going, and closes once it has sent */}
      <PcMicSheet open={!callUp && (micOpen || (live && !closedLive))} onScreen={() => setRemoteOpen(true)} origin={micCenter(insets.top, width)} phase={mic.phase}
        since={mic.since} error={mic.error} source={mic.source} sourceNote={mic.sourceNote} onSource={mic.setSource}
        onClose={() => { setMicOpen(false); if (live) setClosedLive(true); }}
        onTalkIn={mic.startTalk} onTalkOut={mic.endTalk} onHandsFree={mic.toggleHandsFree}
        onSayIn={mic.sayIn} onSayOut={mic.sayOut} onSayLock={mic.sayLock} onSayToggle={mic.sayToggle} sayLocked={mic.locked} agent={agent} live={mic.live} offline={mic.offline}
        onStop={() => { agent.stop(); mic.cancel(); api('/pc/keys', { method: 'POST', body: { action: 'stop' } }).catch(() => {}); }} />
      <FilesSheet open={filesOpen} origin={pillCenter(0, insets.top, width)} onClose={() => setFilesOpen(false)} />
      <VoicesSheet open={voicesOpen} origin={pillCenter(3, insets.top, width)} onClose={() => setVoicesOpen(false)} />
      <AccountSheet open={accountOpen} onClose={() => setAccountOpen(false)} onSignedOut={t.reload} />
      <RemoteDesktop open={remoteOpen} onClose={() => setRemoteOpen(false)} />
      <PcControls tab={pcTab} onTab={setPcTab} onClose={() => setPcTab(null)} />
      {moodFrom ? <MoodLogger from={moodFrom} onClose={() => setMoodFrom(null)} /> : null}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.scene },
  center: { alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  sheet: {
    flexGrow: 1, backgroundColor: C.sheet, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingTop: 20, paddingHorizontal: 16, gap: 24, borderTopWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.08)',
  },
  more: { minHeight: 44, justifyContent: 'center' },
  moreText: { fontFamily: F.medium, fontSize: 14, lineHeight: 20, color: C.textSoft },
  emptyText: { fontFamily: F.regular, fontSize: 16, lineHeight: 24, color: C.muted },
  errTitle: { fontFamily: F.semibold, fontSize: 24, lineHeight: 32, color: C.text },
  errBody: { fontFamily: F.regular, fontSize: 16, lineHeight: 24, color: C.muted, textAlign: 'center' },
  retry: { height: 48, paddingHorizontal: 24, borderRadius: 24, backgroundColor: C.text, alignItems: 'center', justifyContent: 'center' },
  retryText: { fontFamily: F.semibold, fontSize: 16, color: C.scene },
});
