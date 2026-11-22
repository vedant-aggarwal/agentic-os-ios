import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { Glass } from '@/components/Glass';
import { PcMic } from '@/components/Icons';
import { Sym } from '@/components/Sym';
import { C, F } from '@/theme';
import type { JobFull } from '../types';
import { ENGINE } from './model';
import { IcClose, IcStop, IcUp, Press } from './ui';

// The reply box. While a turn runs, a message waits on the phone ("Waiting for the turn to finish", with Stop) and goes
// as soon as the turn ends. A stopped job is picked up again by the next message, which takes a few seconds: "Resuming".

export type SendPhase = 'idle' | 'sending' | 'resuming';

export const busyStatus = (s: JobFull['status'] | undefined) => s === 'running' || s === 'starting' || s === 'needs_input';

export function Composer({ job, phase, queued, onSend, onStop, onCancelQueued, onMic }: {
  job: JobFull | null; phase: SendPhase; queued: string | null;
  onSend: (text: string) => Promise<boolean>; onStop: () => void; onCancelQueued: () => void; onMic: () => void;
}) {
  const [draft, setDraft] = useState('');
  const who = job ? ENGINE[job.engine] : 'the agent';
  const status = job?.status;

  if (status === 'done') {
    return (
      <View style={s.doneBar}>
        <Text style={s.doneText}>This job is done. Start a new job to keep going.</Text>
      </View>
    );
  }

  const placeholder = busyStatus(status) ? 'Add a follow up'
    : status === 'stopped' ? `Message ${who} to pick it up again`
      : status === 'failed' ? `Message ${who} to try again`
        : `Reply to ${who}`;
  const canSend = !!draft.trim() && phase === 'idle' && !queued;
  const send = async () => {
    const t = draft.trim();
    if (!t || !canSend) return;
    if (await onSend(t)) setDraft('');
  };

  return (
    <Animated.View layout={LinearTransition.duration(180)} style={s.wrap}>
      {queued ? (
        <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)} style={s.strip} accessibilityLiveRegion="polite">
          <View style={s.flex}>
            <Text style={s.stripTitle}>Waiting for the turn to finish</Text>
            <Text style={s.stripBody} numberOfLines={1}>{queued}</Text>
          </View>
          <Press accessibilityLabel="Stop the turn" onPress={onStop} style={s.stop}>
            <Sym name="stop.fill" size={12} color="#fff" fallback={<IcStop size={11} />} />
            <Text style={s.stopText}>Stop</Text>
          </Press>
          <Press accessibilityLabel="Don't send it" hitSlop={8} onPress={onCancelQueued} style={s.iconBtn}>
            <Sym name="xmark" size={13} color={C.muted} fallback={<IcClose size={13} color={C.muted} />} />
          </Press>
        </Animated.View>
      ) : phase === 'resuming' ? (
        <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)} style={s.strip} accessibilityLiveRegion="polite">
          <ActivityIndicator size="small" color={C.muted} />
          <Text style={[s.stripTitle, s.flex]}>Resuming. This takes a few seconds.</Text>
        </Animated.View>
      ) : null}

      <View style={s.bar}>
        <Glass radius={24} />
        <Press accessibilityLabel="Talk" onPress={onMic} style={s.mic}>
          <Sym name="mic.fill" size={18} color={C.muted} fallback={<PcMic size={18} color={C.muted} />} />
        </Press>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={placeholder}
          placeholderTextColor={C.faint}
          multiline
          style={s.input}
          keyboardAppearance="dark"
          accessibilityLabel="Message"
          editable={phase === 'idle'}
        />
        <Press accessibilityLabel="Send" disabled={!canSend} onPress={send} style={[s.send, !canSend && phase === 'idle' && s.sendOff]}>
          {phase !== 'idle' ? <ActivityIndicator size="small" color="#0B0C10" />
            : <Sym name="arrow.up" size={15} color="#0B0C10" fallback={<IcUp size={15} color="#0B0C10" />} />}
        </Press>
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  wrap: { paddingHorizontal: 16, paddingTop: 8, gap: 8 },
  strip: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 16, paddingRight: 8, minHeight: 52, borderRadius: 16,
    borderCurve: 'continuous', backgroundColor: 'rgba(30,31,35,0.96)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.12)',
  },
  stripTitle: { fontFamily: F.medium, fontSize: 14, lineHeight: 20, color: C.text },
  stripBody: { fontFamily: F.regular, fontSize: 12, lineHeight: 16, color: C.muted },
  stop: { height: 36, paddingHorizontal: 12, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#E5484D' },
  stopText: { fontFamily: F.semibold, fontSize: 14, lineHeight: 20, color: '#fff' },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  bar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 4, minHeight: 52, borderRadius: 24, padding: 6,
    boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
  },
  mic: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  input: {
    flex: 1, fontFamily: F.regular, fontSize: 16, lineHeight: 24, color: C.text, maxHeight: 120,
    paddingTop: 8, paddingBottom: 8, paddingHorizontal: 4,
  },
  send: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.text, alignItems: 'center', justifyContent: 'center' },
  sendOff: { opacity: 0.35 },
  doneBar: { marginHorizontal: 16, marginTop: 8, minHeight: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.05)', paddingHorizontal: 16 },
  doneText: { fontFamily: F.medium, fontSize: 14, lineHeight: 20, color: C.muted, textAlign: 'center' },
});
