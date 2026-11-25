import { useEffect, useState, type ReactNode } from 'react';
import { RefreshControl, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { EdgeBlur } from '@/components/EdgeBlur';
import { C } from '@/theme';
import { ASPECT_NAME, useAspect } from '../context';
import { Icon, IconButton } from './controls';
import { MOTION, t } from './tokens';

/**
 * The top of an aspect page: its name in its colour (the same word the dial showed), an optional line under it,
 * an optional control, and the close button. Every page keeps a close button in this spot.
 */
export function PageHeader({ title, subtitle, right }: { title?: string; subtitle?: string | null; right?: ReactNode }) {
  const a = useAspect();
  return (
    <View style={s.header}>
      <View style={s.headerText}>
        <Text accessibilityRole="header" numberOfLines={1} style={[t.title, { color: a.color }]}>{title ?? ASPECT_NAME[a.aspect]}</Text>
        {subtitle ? <Text numberOfLines={2} style={t.small}>{subtitle}</Text> : null}
      </View>
      {right}
      <IconButton label="Close" size={36} onPress={a.close}><Icon name="close" size={16} /></IconButton>
    </View>
  );
}

/**
 * A scrolling page with the safe areas, the dock clearance and the soft top edge handled. Put sections straight
 * inside; they sit 24 apart. Leave `header` on unless the page draws its own top (it must still offer Close).
 */
export function Page({ title, subtitle, right, header = true, children, onRefresh, refreshing = false, contentStyle, footer }: {
  title?: string; subtitle?: string | null; right?: ReactNode; header?: boolean; children: ReactNode;
  onRefresh?: () => void; refreshing?: boolean; contentStyle?: StyleProp<ViewStyle>;
  /** Drawn over the page, outside the scroll: a floating action, a Screen, a Sheet. */
  footer?: ReactNode;
}) {
  const a = useAspect();
  return (
    <View style={s.fill}>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
        contentContainerStyle={[s.content, { paddingTop: a.insets.top + 12, paddingBottom: a.dock + 24 }, contentStyle]}
        refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.muted} /> : undefined}>
        {header ? <PageHeader title={title} subtitle={subtitle} right={right} /> : null}
        {children}
      </ScrollView>
      <EdgeBlur edge="top" height={a.insets.top + 20} strength={30} curve={2} />
      {footer}
    </View>
  );
}

/**
 * A second level inside a page (one workout, one person, a settings list). It slides in from the right over the
 * page, with a back button, and the left-edge drag goes back here before it closes the page. Render it as the
 * `footer` of the Page (or anywhere after the page's content, inside a full-size parent).
 * `immersive` hides the dock while it is open: use it for flows that need the whole screen.
 */
export function Screen({ open, onClose, title, right, children, scroll = true, immersive = false, contentStyle, footer }: {
  open: boolean; onClose: () => void; title?: string; right?: ReactNode; children: ReactNode;
  scroll?: boolean; immersive?: boolean; contentStyle?: StyleProp<ViewStyle>;
  /** Pinned over the bottom of the screen, outside the scroll: a rest timer, a bar of actions. */
  footer?: ReactNode;
}) {
  const a = useAspect();
  const { onBack, setImmersive, width } = a;
  const p = useSharedValue(0);
  const [mounted, setMounted] = useState(open); // shown, or still sliding away
  if (open && !mounted) setMounted(true);
  useEffect(() => {
    p.set(withSpring(open ? 1 : 0, MOTION.spring));
    if (open) return;
    const id = setTimeout(() => setMounted(false), 440);
    return () => clearTimeout(id);
  }, [open, p]);
  useEffect(() => (open ? onBack(onClose) : undefined), [open, onBack, onClose]);
  useEffect(() => {
    if (!open || !immersive) return;
    setImmersive(true);
    return () => setImmersive(false);
  }, [open, immersive, setImmersive]);
  const slide = useAnimatedStyle(() => ({ opacity: Math.min(p.value * 3, 1), transform: [{ translateX: (1 - p.value) * width }] }));
  if (!mounted) return null;
  const pad = { paddingBottom: (immersive ? a.insets.bottom : a.dock) + 24 };
  return (
    <Animated.View style={[StyleSheet.absoluteFill, s.screen, slide]} pointerEvents={open ? 'auto' : 'none'}>
      <View style={[s.screenHead, { paddingTop: a.insets.top + 12 }]}>
        <IconButton label="Back" size={36} onPress={onClose}><Icon name="left" size={16} /></IconButton>
        <Text accessibilityRole="header" numberOfLines={1} style={[t.headline, s.screenTitle]}>{title ?? ''}</Text>
        {right ?? <View style={s.screenSpacer} />}
      </View>
      {scroll ? (
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={[s.screenContent, pad, contentStyle]}>
          {children}
        </ScrollView>
      ) : (
        <View style={[s.fill, s.screenBody, pad, contentStyle]}>{children}</View>
      )}
      {footer}
    </Animated.View>
  );
}

/** What an aspect shows until its page is built. The app never shows mock content in its place. */
export function NotBuilt() {
  return (
    <Page>
      <Text style={t.body}>Not built yet.</Text>
    </Page>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingHorizontal: 16, gap: 24 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  headerText: { flex: 1, minWidth: 0, gap: 4 },
  screen: { backgroundColor: C.scene },
  screenHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 12 },
  screenTitle: { flex: 1, textAlign: 'center' },
  screenSpacer: { width: 36 },
  screenContent: { paddingHorizontal: 16, paddingTop: 4, gap: 24 },
  screenBody: { paddingHorizontal: 16 },
});
