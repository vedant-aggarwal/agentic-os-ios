import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
// gesture handler's ScrollView, so the hero's sideways drag can take over from the page's scroll
import { ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Backdrop, EdgeGlow } from '@/components/Backdrop';
import { EdgeBlur } from '@/components/EdgeBlur';
import { Dock, orbFromBottom } from '@/components/Dock';
import { Notice } from '@/components/Notice';
import { NowCard } from '@/components/NowCard';
import { SignIn } from '@/components/SignIn';
import { TaskGroup } from '@/components/TaskRow';
import { PcMicSheet } from '@/components/PcMicSheet';
import { VoicesSheet } from '@/components/VoicesSheet';
import { RemoteDesktop } from '@/components/remote/RemoteDesktop';
import { FilesSheet } from '@/components/FilesSheet';
import { useAgent } from '@/lib/agent';
import { micCenter, pillCenter, TOP_GAP, TOP_H, TopBar } from '@/components/TopBar';
import { api, signOut } from '@/lib/api';
import { gazeTouch } from '@/lib/gaze';
import { useToday } from '@/lib/useToday';
import { useWispr } from '@/lib/wispr';
import { useKeyboardMic } from '@/lib/kbmic';
import { Hero, HERO_H } from '@/hero/Hero';
import { AspectHost, dockClearance, initialAspect } from '@/aspects/AspectHost';
import { C, F, type AspectKey } from '@/theme';

export default function Today() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const t = useToday();
  const [local, setLocal] = useState<string | null>(null);
  const [aspect, setAspect] = useState<AspectKey | null>(initialAspect); // the aspect page the orb's dial opened
  const [immersive, setImmersive] = useState(false); // an aspect page's full-screen flow has hidden the dock
  const closeAspect = useCallback(() => { setAspect(null); setImmersive(false); }, []);
  const [allCarried, setAllCarried] = useState(false);
  const [micOpen, setMicOpen] = useState(false); // opened by tapping the PC mic button
  const [voicesOpen, setVoicesOpen] = useState(false); // the top bar's waveform button
  const [filesOpen, setFilesOpen] = useState(false); // the top bar's To PC button
  const [remoteOpen, setRemoteOpen] = useState(false); // the top bar's Remote PC button: the PC's screen, full screen
  const [heroOn, setHeroOn] = useState(true); // the 3D hero renders only while some of it is on screen
  // volume buttons drive Wispr on the PC while Today is up
  const mic = useWispr(!!t.view);
  const kbMic = useKeyboardMic(); // records for the keyboard extension (agenticos://flow)
  const agent = useAgent(!!t.view);
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
  const empty = !v.groups.length && !v.carried;
  return (
    // every touch on Today is passed to the smiley, which looks toward the finger
    <View style={s.screen} {...gazeTouch}>
      <Backdrop orb={orb} />
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={100}
        onScroll={(e) => { const on = e.nativeEvent.contentOffset.y < insets.top + HERO_H; if (on !== heroOn) setHeroOn(on); }}
        refreshControl={<RefreshControl refreshing={t.refreshing} onRefresh={t.refresh} tintColor={C.muted} />}>
        <Hero view={v} top={insets.top} topBar={TOP_GAP + TOP_H} active={heroOn && !aspect} />

        <View style={[s.sheet, { paddingBottom: insets.bottom + 140 }]}>
          <NowCard moment={v.moment} onDone={t.toggle} />
          {v.groups.map((g) => <TaskGroup key={g.key} group={g} onToggle={t.toggle} />)}
          {v.carried ? (
            <View>
              <TaskGroup group={v.carried} onToggle={t.toggle} limit={allCarried ? undefined : 5} />
              {v.carried.rows.length > 5 ? (
                <Pressable accessibilityRole="button" onPress={() => setAllCarried((x) => !x)} style={s.more}>
                  <Text style={s.moreText}>{allCarried ? 'Show fewer' : `Show all ${v.carried.rows.length}`}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
          {empty ? <Text style={s.emptyText}>Nothing due today or carried over. Add tasks with agentos on the PC.</Text> : null}
          <Pressable accessibilityRole="button" onPress={async () => { await signOut(); t.reload(); }} style={s.more}>
            <Text style={[s.moreText, { color: C.faint }]}>Sign out</Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* t^2.6 over the zone: about 1 pt where the navbar's top edge sits (40% down), then dense under the
          bar, 14 pt at the bottom edge */}
      {/* the same blur under the top bar, dense at the screen's top edge */}
      <EdgeBlur edge="top" height={insets.top + TOP_GAP + TOP_H + 28} strength={30} curve={2} />
      <TopBar top={insets.top} width={width} live={live} onMic={() => { setClosedLive(false); setMicOpen(true); }}
        onRemote={() => setRemoteOpen(true)}
        onVoices={() => setVoicesOpen(true)} onFiles={() => setFilesOpen(true)} onNotBuilt={notBuilt} />
      {/* an aspect page grows out of the orb, over Today and its top bar; the dock stays above it */}
      <AspectHost aspect={aspect} origin={{ x: width / 2, y: height - orb }} dock={immersive ? insets.bottom : dockClearance(insets.bottom)}
        onClose={closeAspect} onOpen={setAspect} onNotice={setLocal} onImmersive={setImmersive} />
      <EdgeBlur height={insets.bottom + 150} strength={35} curve={2.6} />
      <EdgeGlow height={insets.bottom + 200} orb={orb} />
      <Notice text={kbMic.state === 'recording' ? 'Listening for the keyboard. Swipe back to your app and talk.' : kbMic.error ?? local ?? t.notice} bottom={insets.bottom + 112} onClear={clear} />
      <Dock bottom={insets.bottom} width={width} aspects={v.aspects} onNotBuilt={notBuilt}
        onAspect={setAspect} onHome={aspect ? closeAspect : undefined} hidden={immersive} />
      {/* opens by itself while a volume press has Wispr going, and closes once it has sent */}
      <PcMicSheet open={micOpen || (live && !closedLive)} onScreen={() => setRemoteOpen(true)} origin={micCenter(insets.top, width)} phase={mic.phase}
        since={mic.since} error={mic.error} source={mic.source} sourceNote={mic.sourceNote} onSource={mic.setSource}
        onClose={() => { setMicOpen(false); if (live) setClosedLive(true); }}
        onTalkIn={mic.startTalk} onTalkOut={mic.endTalk} onHandsFree={mic.toggleHandsFree}
        onSayIn={mic.sayIn} onSayOut={mic.sayOut} onSayLock={mic.sayLock} onSayToggle={mic.sayToggle} sayLocked={mic.locked} agent={agent} live={mic.live} offline={mic.offline}
        onStop={() => { agent.stop(); mic.cancel(); api('/pc/keys', { method: 'POST', body: { action: 'stop' } }).catch(() => {}); }} />
      <FilesSheet open={filesOpen} origin={pillCenter(0, insets.top, width)} onClose={() => setFilesOpen(false)} />
      <VoicesSheet open={voicesOpen} origin={pillCenter(3, insets.top, width)} onClose={() => setVoicesOpen(false)} />
      <RemoteDesktop open={remoteOpen} onClose={() => setRemoteOpen(false)} />
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
