import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming, cancelAnimation } from 'react-native-reanimated';
import { MicIcon } from './Icons';
import { Press } from './Press';
import { useDictation } from '@/lib/dictation';
import { C, F } from '@/theme';

type Props = { value: string; onChangeText: (t: string) => void; placeholder: string; minHeight?: number; right?: React.ReactNode } & Pick<TextInputProps, 'maxLength' | 'onFocus' | 'autoFocus'>;

/** A text box with a mic: speech streams in live (Codex dictation through the PC) and is added after what is already typed. */
export function VoiceField({ value, onChangeText, placeholder, minHeight = 96, maxLength = 2000, onFocus, autoFocus, right }: Props) {
  const base = useRef('');
  const { state, error, start, stop, cancel } = useDictation((text) => {
    if (!text) return; // an empty end (error or no speech) keeps what is already there
    const b = base.current;
    onChangeText((b && text ? b.replace(/\s+$/, '') + ' ' : b) + text);
  });
  const on = state !== 'idle';

  // The message was sent (the box was emptied from outside) while the mic was on: stop listening and drop the rest.
  const prev = useRef(value);
  useEffect(() => {
    if (prev.current && !value && state !== 'idle') cancel();
    prev.current = value;
  }, [value, state, cancel]);

  const pulse = useSharedValue(0);
  useEffect(() => {
    if (state === 'live') pulse.value = withRepeat(withTiming(1, { duration: 700 }), -1, true);
    else {
      cancelAnimation(pulse);
      pulse.value = 0;
    }
  }, [state, pulse]);
  const ring = useAnimatedStyle(() => ({ opacity: 0.18 + pulse.value * 0.25, transform: [{ scale: 1 + pulse.value * 0.35 }] }));

  return (
    <View>
      <View style={[styles.box, on && styles.boxOn]}>
        <TextInput
          style={[styles.input, { minHeight, paddingRight: right ? 104 : 60 }]}
          value={value}
          onChangeText={onChangeText}
          placeholder={state === 'live' ? 'Listening…' : placeholder}
          placeholderTextColor={C.faint}
          multiline
          maxLength={maxLength}
          textAlignVertical="top"
          editable={!on}
          onFocus={onFocus}
          autoFocus={autoFocus}
        />
        <View style={styles.micWrap}>
          {right}
          {state === 'live' ? <Animated.View pointerEvents="none" style={[styles.halo, ring]} /> : null}
          <Press
            style={[styles.mic, on && { backgroundColor: C.yt }]}
            scale={0.9}
            accessibilityLabel={on ? 'Stop dictation' : 'Dictate'}
            onPress={() => {
              if (on) return stop();
              base.current = value;
              start();
            }}
          >
            {state === 'connecting' || state === 'finishing' ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : on ? (
              <View style={styles.stopSq} />
            ) : (
              <MicIcon size={19} />
            )}
          </Press>
        </View>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: 18, backgroundColor: C.card, borderWidth: 2, borderColor: 'transparent' },
  boxOn: { borderColor: C.yt },
  input: { paddingTop: 14, paddingBottom: 14, paddingLeft: 14, paddingRight: 60, fontFamily: F.r, fontSize: 16, lineHeight: 22, color: C.ink },
  micWrap: { position: 'absolute', right: 8, bottom: 8, height: 40, flexDirection: 'row', alignItems: 'center', gap: 6 },
  halo: { position: 'absolute', right: 0, width: 40, height: 40, borderRadius: 20, backgroundColor: C.yt },
  mic: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  stopSq: { width: 12, height: 12, borderRadius: 3, backgroundColor: '#fff' },
  error: { marginTop: 6, fontFamily: F.m, fontSize: 13, lineHeight: 18, color: '#B4232F' },
});
