import { useEffect } from 'react';
import { AccessibilityInfo, ActivityIndicator, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  FadeIn, FadeInDown, FadeOutUp, LinearTransition, type SharedValue, useAnimatedStyle, useReducedMotion,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Glass, lightTap } from '@/components/Glass';
import { ASPECT_COLOR, C, F } from '@/theme';
import { useFanProjects } from '../store';
import {
  cancelVoiceIdea, dismissVoiceChip, type Ptt, stopVoiceIdea, undoVoiceIdea, usePtt, useTakeLevel, useVoiceChip, type VoiceChip,
} from '../voice';
import { Elapsed, nameOf } from './parts';
import { AMBER, Glyph, PrimaryButton, REC, SecondaryButton } from './Sheet';

// Push to talk, on screen: a glass pill at the top while a take records ("Recording into Agentic OS", the voice's
// level as a red ring, the time, the words as the PC hears them). Locked, it gains Cancel and Stop and save. Let go
// and the same pill turns into the result: Saving idea, then Idea saved with Undo, or what went wrong.
// It sits at the top so the thumb on the fan never covers it; recording indicators live there on iPhone too.

const ENTER = FadeInDown.duration(220);
const EXIT = FadeOutUp.duration(180);
const LAYOUT = LinearTransition.duration(220);

export function RecorderOverlay({ live, offline }: { live: string; offline: boolean }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const ptt = usePtt();
  const chip = useVoiceChip();
  const box = { top: insets.top + 8, width: Math.min(width - 32, 420) };
  if (ptt.phase === 'recording') return <View pointerEvents="box-none" style={s.layer}><Recording ptt={ptt} live={live} offline={offline} box={box} /></View>;
  if (ptt.phase === 'error') return <View pointerEvents="box-none" style={s.layer}><Failed ptt={ptt} box={box} /></View>;
  if (chip) return <View pointerEvents="box-none" style={s.layer}><Result key={chip.seq} chip={chip} box={box} /></View>;
  return null;
}

type Box = { top: number; width: number };

function Recording({ ptt, live, offline, box }: { ptt: Extract<Ptt, { phase: 'recording' }>; live: string; offline: boolean; box: Box }) {
  const projects = useFanProjects();
  const level = useTakeLevel(ptt.since ? ptt.id : null);
  const name = nameOf(projects, ptt.project);
  const line = offline ? 'PC not reached. Still saving on this phone.'
    : live || (ptt.locked ? 'Hands free. Tap Stop and save when you are done.' : 'Let go to save. Slide up to keep recording.');
  return (
    <Animated.View entering={ENTER} exiting={EXIT} layout={LAYOUT} style={[s.pill, box]} accessibilityLabel={`Recording into ${name}`}>
      <Glass radius={24} />
      <View style={s.row}>
        <LevelRing level={level} />
        <View style={s.text}>
          <Text style={s.title} numberOfLines={1}>Recording into {name}</Text>
          <Text style={[s.sub, offline && { color: AMBER }, !!live && !offline && s.live]} numberOfLines={1} ellipsizeMode="head">{line}</Text>
        </View>
        {ptt.since ? <Elapsed since={ptt.since} style={s.time} /> : <Text style={s.time}>0:00</Text>}
      </View>
      {ptt.locked ? (
        <Animated.View entering={FadeIn.duration(160)} style={s.actions}>
          <SecondaryButton label="Cancel" onPress={cancelVoiceIdea} />
          <PrimaryButton label="Stop and save" onPress={stopVoiceIdea} />
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

/** The voice's loudness as a red ring swelling round the dot. Reduce Motion: the ring brightens instead of growing. */
function LevelRing({ level }: { level: SharedValue<number> }) {
  const reduce = useReducedMotion();
  const ring = useAnimatedStyle(() => (reduce
    ? { opacity: 0.2 + 0.8 * level.value }
    : { opacity: 0.3 + 0.5 * level.value, transform: [{ scale: 0.7 + 0.55 * level.value }] }));
  return (
    <View style={s.ringBox} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View style={[s.ring, ring]} />
      <View style={s.dot} />
    </View>
  );
}

function Failed({ ptt, box }: { ptt: Extract<Ptt, { phase: 'error' }>; box: Box }) {
  useEffect(() => { AccessibilityInfo.announceForAccessibility(`Couldn't record. ${ptt.message}`); }, [ptt.message]);
  return (
    <Animated.View entering={ENTER} exiting={EXIT} layout={LAYOUT} style={[s.pill, box]}>
      <Glass radius={24} />
      <View style={s.row}>
        <View style={s.text}>
          <Text style={[s.title, { color: C.danger }]}>Couldn’t record</Text>
          <Text style={s.sub} numberOfLines={2}>{ptt.message}</Text>
        </View>
      </View>
    </Animated.View>
  );
}

const COPY: Record<VoiceChip['kind'], (c: VoiceChip, project: string) => { title: string; sub: string }> = {
  saving: (_c, p) => ({ title: 'Saving idea', sub: p }),
  saved: (c, p) => ({ title: 'Idea saved', sub: c.detail ?? p }),
  phone: (_c, p) => ({ title: 'Saved on the phone', sub: `It becomes an idea in ${p} when your PC is back.` }),
  failed: (c) => ({ title: 'Couldn’t save the idea', sub: c.detail ? `${c.detail.replace(/[.\s]*$/, '.')} The recording is in Voices.` : 'The recording is in Voices.' }),
  empty: () => ({ title: 'Didn’t catch anything', sub: 'No idea was saved.' }),
  undone: () => ({ title: 'Not saved', sub: 'The recording stays in Voices.' }),
  short: () => ({ title: 'Hold the mic and talk', sub: 'Let go to save the idea.' }),
};

function Result({ chip, box }: { chip: VoiceChip; box: Box }) {
  const projects = useFanProjects();
  const { title, sub } = COPY[chip.kind](chip, nameOf(projects, chip.project));
  useEffect(() => { AccessibilityInfo.announceForAccessibility(`${title}. ${sub}`); }, [title, sub]);
  const bad = chip.kind === 'failed';
  return (
    <Animated.View entering={ENTER} exiting={EXIT} layout={LAYOUT} style={[s.pill, box]}>
      <Glass radius={24} />
      <Pressable accessibilityRole="button" accessibilityLabel={`${title}. ${sub}`} accessibilityHint="Hides this" style={s.row}
        onPress={() => dismissVoiceChip(chip.id)}>
        {chip.kind === 'saving' ? <View style={s.lead}><ActivityIndicator size="small" color={C.muted} /></View>
          : chip.kind === 'saved' ? <View style={s.lead}><Glyph name="checkmark" size={16} color={ASPECT_COLOR.mission} alt="✓" /></View>
          : null}
        <View style={s.text}>
          <Text style={[s.title, bad && { color: C.danger }]} numberOfLines={1}>{title}</Text>
          <Text style={s.sub} numberOfLines={2}>{sub}</Text>
        </View>
        {chip.undo ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Undo" hitSlop={12} style={s.undo}
            onPress={() => { lightTap(); undoVoiceIdea(chip.id); }}>
            <Text style={s.undoText}>Undo</Text>
          </Pressable>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  layer: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center' },
  pill: { position: 'absolute', borderRadius: 24, borderCurve: 'continuous', padding: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.45)' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 40, paddingRight: 8 },
  text: { flex: 1, gap: 2 },
  title: { fontFamily: F.semibold, fontSize: 14, lineHeight: 20, color: C.text },
  sub: { fontFamily: F.medium, fontSize: 12, lineHeight: 16, color: C.muted },
  live: { color: C.textSoft },
  time: { fontFamily: F.medium, fontSize: 14, lineHeight: 20, color: C.text, fontVariant: ['tabular-nums'] },
  ringBox: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: 40, height: 40, borderRadius: 20, backgroundColor: `${REC}66` },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: REC },
  lead: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, paddingTop: 8 },
  undo: { height: 40, paddingHorizontal: 12, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.1)' },
  undoText: { fontFamily: F.semibold, fontSize: 14, lineHeight: 20, color: C.text },
});
