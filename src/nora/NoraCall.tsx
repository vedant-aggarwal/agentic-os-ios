import { BlurView } from 'expo-blur';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Press, SURF, t } from '@/aspects/kit';
import { useReveal } from '@/components/Reveal';
import { clock } from '@/lib/nora';
import { C } from '@/theme';
import { useCall } from './call/useCall';
import { NGlyph, NORA, useElapsed } from './parts';
import { Ball, useTurn } from './Sphere';
import { noraUi, useNora, type CallAsk } from './state';

// Talking to Nora (tap the orb): a live call. Her sphere is the call: it swells with her voice, the line under it
// says whether she's listening, speaking or working on something in Codex, and both sides' words show as they come.
// It grows out of the orb over everything. See call/useCall.ts for where the audio runs.

const R = 84; // the sphere's radius on this screen
const END = '#E5484D';

export function NoraCall({ origin }: { origin: { x: number; y: number } }) {
  const ui = useNora();
  const r = useReveal(!!ui.call, origin);
  const [shown, setShown] = useState<CallAsk | null>(ui.call); // kept while the screen closes, so it still says Call ended
  if (ui.call && ui.call !== shown) setShown(ui.call);
  if (!r.mounted && !ui.call) return null;
  return (
    <Animated.View style={r.shell} pointerEvents={ui.call ? 'auto' : 'none'}>
      <Animated.View style={r.stage}>
        <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, s.tint]} />
        <Animated.View style={[{ width: r.width, height: r.height }, r.content]}>
          {shown ? <CallBody key={shown.seq} ask={shown} /> : null}
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

function CallBody({ ask }: { ask: CallAsk | null }) {
  const insets = useSafeAreaInsets();
  const c = useCall(ask, noraUi.closeCall);
  const secs = useElapsed(c.phase === 'live' ? c.t0 : null);
  const turn = useTurn(c.phase !== 'failed' && c.phase !== 'ended');
  const word = c.phase === 'connecting' ? 'Connecting'
    : c.phase === 'ended' ? 'Call ended'
      : c.phase === 'failed' ? "Couldn't connect"
        : c.talk === 'thinking' ? 'Working on it'
          : c.muted ? 'Muted'
            : c.talk === 'speaking' ? 'Speaking' : 'Listening';
  const failed = c.phase === 'failed';
  const showSpeaker = c.mode === 'relay' || c.mode === 'sim';

  return (
    <View style={[s.fill, { paddingTop: insets.top + 24, paddingBottom: Math.max(insets.bottom, 16) + 24 }]}>
      <View style={s.head}>
        <Text accessibilityRole="header" style={[t.title2, s.centre]}>Nora</Text>
        <Text style={[t.label, t.num, s.centre]}>
          {c.phase === 'live' ? clock(secs) : c.phase === 'ended' ? clock(c.lasted) : ask?.reason && ask.incomingId ? ask.reason : ' '}
        </Text>
      </View>

      <View style={s.stage}>
        <Orb t={turn} level={c.level} dim={failed} />
        <Text accessibilityLiveRegion="polite" style={[t.strong, s.centre, c.talk === 'thinking' && c.phase === 'live' && { color: NORA }]}>{word}</Text>
      </View>

      <View style={s.words}>
        {failed ? (
          <>
            <Text style={[t.body, s.centre]}>{c.error}</Text>
            <View style={s.failRow}>
              <Button label="Chat instead" onPress={() => { noraUi.closeCall(); noraUi.openChat({ mic: true }); }} />
              {c.mode !== 'none' ? <Button label="Try again" kind="quiet" onPress={() => noraUi.call({ incomingId: ask?.incomingId, reason: ask?.reason })} /> : null}
            </View>
          </>
        ) : (
          <>
            <Text style={[t.lead, s.centre]} numberOfLines={4}>{c.her}</Text>
            {c.his ? <Text style={[t.small, s.centre]} numberOfLines={2}>{c.his}</Text> : null}
          </>
        )}
      </View>

      {failed ? (
        <Press label="Close" onPress={noraUi.closeCall} style={s.close} wrap={s.closeWrap}><Text style={t.label}>Close</Text></Press>
      ) : (
        <View style={s.controls}>
          <Control label={c.muted ? 'Unmute' : 'Mute'} on={c.muted} onPress={c.toggleMute} disabled={c.phase === 'ended'}>
            <NGlyph name={c.muted ? 'micOff' : 'mic'} size={24} color={c.muted ? C.scene : C.text} />
          </Control>
          <View style={s.ctl}>
            <Press label="End call" onPress={c.end} scale={0.92} feel="medium" style={s.end} disabled={c.phase === 'ended'}>
              <NGlyph name="hangup" size={30} color="#fff" />
            </Press>
            <Text style={t.caption}>End</Text>
          </View>
          {showSpeaker ? (
            <Control label="Speaker" on={c.speaker} onPress={c.toggleSpeaker} disabled={c.phase === 'ended'}>
              <NGlyph name="speaker" size={24} color={c.speaker ? C.scene : C.text} />
            </Control>
          ) : <View style={s.ctl} />}
        </View>
      )}
    </View>
  );
}

/** Her sphere: it swells a little with her voice; a thin ring rides out with it while she speaks. */
function Orb({ t: turn, level, dim }: { t: SharedValue<number>; level: SharedValue<number>; dim: boolean }) {
  const reduce = useReducedMotion();
  const grow = useAnimatedStyle(() => ({ opacity: dim ? 0.4 : 1, transform: [{ scale: reduce ? 1 : 1 + level.value * 0.07 }] }));
  const ring = useAnimatedStyle(() => ({ opacity: dim ? 0 : level.value * 0.7, transform: [{ scale: 1.08 + (reduce ? 0 : level.value * 0.2) }] }));
  return (
    <View style={s.orbBox} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View style={[s.ring, ring]} />
      <Animated.View style={[s.ball, grow]}><Ball t={turn} r={R} /></Animated.View>
    </View>
  );
}

function Control({ label, on, onPress, disabled, children }: { label: string; on: boolean; onPress: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <View style={s.ctl}>
      <Press label={label} onPress={onPress} scale={0.92} disabled={disabled} role="button" state={{ selected: on }}
        style={[s.round, on && s.roundOn]}>{children}</Press>
      <Text style={t.caption}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  tint: { backgroundColor: 'rgba(8,9,12,0.9)' },
  fill: { flex: 1, paddingHorizontal: 24 },
  head: { alignItems: 'center', gap: 4 },
  centre: { textAlign: 'center' },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 24 },
  orbBox: { width: R * 2 + 48, height: R * 2 + 48, alignItems: 'center', justifyContent: 'center' },
  ball: { width: R * 2, height: R * 2, borderRadius: R, boxShadow: '0 16px 40px rgba(0,0,0,0.5)' },
  ring: { position: 'absolute', width: R * 2, height: R * 2, borderRadius: R, borderWidth: 2, borderColor: NORA },
  words: { minHeight: 132, gap: 8, justifyContent: 'flex-start', paddingBottom: 24 },
  failRow: { flexDirection: 'row', justifyContent: 'center', gap: 12, paddingTop: 16 },
  controls: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 8 },
  ctl: { width: 80, alignItems: 'center', gap: 8 },
  round: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: SURF.raised },
  roundOn: { backgroundColor: C.text },
  end: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: END },
  closeWrap: { alignSelf: 'center' },
  close: { minHeight: 44, minWidth: 88, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
});
