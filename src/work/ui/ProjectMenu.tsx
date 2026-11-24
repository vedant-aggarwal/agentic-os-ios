import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { Glass } from '@/components/Glass';
import { C } from '@/theme';
import type { ProjectCard } from '../types';
import { IdeaIcon, JobIcon, PinIcon, SettingsIcon } from './icons';
import { Press } from './Press';
import { EASE, GUTTER, T } from './tokens';

export type MenuAt = { project: ProjectCard; y: number };

const W = 232;
const ITEM = 48;
const H = ITEM * 4 + 40; // four items, the name line, the inset

/**
 * What a held project offers: start a job in it, pin or unpin, move between Active and Ideas, and its settings. It grows out of the
 * finger's spot, below it, or above when the finger is low; the page dims behind it and a tap anywhere else closes it.
 */
export function ProjectMenu({ at, top, bottom, onStart, onPin, onMove, onSettings, onClose }: {
  at: MenuAt; top: number; bottom: number; onStart: () => void; onPin: () => void; onMove: () => void; onSettings: () => void; onClose: () => void;
}) {
  const { height } = useWindowDimensions();
  const reduce = useReducedMotion();
  const below = at.y + 16 + H <= height - bottom;
  const y = below ? Math.max(top, at.y + 16) : Math.max(top, at.y - 16 - H);
  const v = useSharedValue(0);
  useEffect(() => { v.set(withTiming(1, { duration: 200, easing: EASE })); }, [v]);
  const grow = useAnimatedStyle(() => ({
    opacity: v.value,
    transform: reduce ? [] : [{ scale: 0.94 + 0.06 * v.value }],
  }));
  const pinned = at.project.pinned;
  return (
    <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)} style={StyleSheet.absoluteFill}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close menu" onPress={onClose} style={[StyleSheet.absoluteFill, s.dim]} />
      <Animated.View accessibilityViewIsModal style={[s.menu, { top: y, transformOrigin: below ? 'top left' : 'bottom left' }, grow]}>
        <Glass radius={20} />
        <Text numberOfLines={1} style={[T.meta, s.name]}>{at.project.name}</Text>
        <Item label="Start a job" icon={<JobIcon size={16} />} onPress={onStart} />
        <Item label={pinned ? 'Unpin' : 'Pin to top'} icon={<PinIcon size={16} color={C.text} />} onPress={onPin} />
        <Item label={at.project.status === 'paused' ? 'Move to Active' : 'Move to Ideas'} icon={<IdeaIcon size={17} color={C.text} />} onPress={onMove} />
        <Item label="Settings" icon={<SettingsIcon />} onPress={onSettings} />
      </Animated.View>
    </Animated.View>
  );
}

function Item({ label, icon, onPress }: { label: string; icon: React.ReactNode; onPress: () => void }) {
  return (
    <Press onPress={onPress} haptic>
      {(pressed) => (
        <View style={[s.item, pressed && s.itemPressed]}>
          <View style={s.icon}>{icon}</View>
          <Text style={[T.row, s.label]}>{label}</Text>
        </View>
      )}
    </Press>
  );
}

const s = StyleSheet.create({
  dim: { backgroundColor: 'rgba(0,0,0,0.4)' },
  menu: { position: 'absolute', left: GUTTER, width: W, padding: 8, borderRadius: 20, boxShadow: '0 16px 40px rgba(0,0,0,0.5)' },
  name: { paddingHorizontal: 12, paddingTop: 4, paddingBottom: 4 },
  // 12 pt corners inside the menu's 20 at an 8 pt inset
  item: { height: ITEM, borderRadius: 12, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  itemPressed: { backgroundColor: 'rgba(255,255,255,0.1)' },
  icon: { width: 24, alignItems: 'center' },
  label: { color: C.text },
});
