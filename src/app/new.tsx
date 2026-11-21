import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { Avatar } from '@/components/Avatar';
import { Check, Chevron, InstagramMark, Plus, SparkIcon, YouTubeMark } from '@/components/Icons';
import { Press } from '@/components/Press';
import { VoiceField } from '@/components/VoiceField';
import { compact, createReels, draftConcepts, useDirections, useHome, useProfiles, useReels, type Concept, type Post } from '@/lib/api';
import { land, measureTile } from '@/lib/flight';
import { INSTAGRAM, YOUTUBE, type Slot } from '@/lib/lineup';
import { C, F } from '@/theme';

const native = Platform.OS !== 'web';
// Same order as the home grid: YouTube and Instagram side by side, row by row.
const ORDER: Slot[] = YOUTUBE.flatMap((yt, i) => [yt, INSTAGRAM[i]]).filter(Boolean);

/**
 * Concept Generator: pick a channel, see what works there, say or type a raw idea, draft concepts with AI,
 * pick one or more, and build the next step (the video's structure). Vedant's words are direction, never copy.
 * When it's done the sheet crumples and flies into that channel's tile on the home grid.
 */
export default function ConceptGenerator() {
  const { channel } = useLocalSearchParams<{ channel?: string }>();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const TOP = insets.top + 10;
  const SHEET = H - TOP;

  const [channelId, setChannelId] = useState<string | null>(ORDER.some((s) => s.channelId === channel) ? String(channel) : null);
  const [raw, setRaw] = useState('');
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [picked, setPicked] = useState<number[]>([]);
  const [mode, setMode] = useState<'separate' | 'combined'>('separate');
  const [directionId, setDirectionId] = useState<string | null>(null);
  const [other, setOther] = useState('');
  const [notes, setNotes] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flying, setFlying] = useState(false);

  const dirs = useDirections();
  const slot = ORDER.find((s) => s.channelId === channelId);
  const dirId = directionId ?? (channelId ? dirs?.defaults[channelId] : null) ?? null;

  // ---------- sheet motion ----------
  const y = useRef(new Animated.Value(SHEET)).current; // 0 = open, SHEET = off screen
  const pos = useRef(SHEET);
  const crumple = useRef(new Animated.Value(0)).current;
  const fly = useRef(new Animated.Value(0)).current;
  const [target, setTarget] = useState({ dx: 0, dy: H, size: 40 });

  useEffect(() => {
    const id = y.addListener(({ value }) => (pos.current = value));
    Animated.spring(y, { toValue: 0, damping: 30, stiffness: 280, mass: 1, useNativeDriver: native }).start();
    return () => y.removeListener(id);
  }, [y]);

  const close = () => {
    if (flying) return;
    Animated.timing(y, { toValue: SHEET, duration: 230, easing: Easing.in(Easing.quad), useNativeDriver: native }).start(() =>
      router.canGoBack() ? router.back() : router.replace('/'),
    );
  };

  const pan = useMemo(() => {
    let start = 0;
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 4 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderGrant: () => {
        y.stopAnimation();
        start = pos.current;
      },
      onPanResponderMove: (_, g) => {
        const next = start + g.dy;
        y.setValue(next < 0 ? next * 0.25 : next); // rubber band past the top
      },
      onPanResponderRelease: (_, g) => {
        if (pos.current + g.vy * 160 > 140) return close();
        Animated.spring(y, { toValue: 0, velocity: g.vy, damping: 30, stiffness: 300, useNativeDriver: native }).start();
      },
      onPanResponderTerminate: () => Animated.spring(y, { toValue: 0, useNativeDriver: native }).start(),
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Crumple the page into a ball and throw it into the channel's tile (or the + button when the tile isn't on screen). */
  const flyAway = async (id: string) => {
    const rect = await measureTile(id);
    const cx = rect ? rect.x + rect.width / 2 : W / 2;
    const cy = rect ? rect.y + rect.height / 2 : H - Math.max(insets.bottom, 16) - 20;
    setTarget({ dx: cx - W / 2, dy: cy - (TOP + SHEET / 2), size: 34 });
    setFlying(true);
    Animated.sequence([
      Animated.timing(crumple, { toValue: 1, duration: 420, easing: Easing.inOut(Easing.cubic), useNativeDriver: native }),
      Animated.timing(fly, { toValue: 1, duration: 520, easing: Easing.bezier(0.5, 0, 0.3, 1), useNativeDriver: native }),
    ]).start(() => {
      land(id);
      router.canGoBack() ? router.back() : router.replace('/');
    });
  };

  // Crumpled: the page squashes to a rough square and twists; then it shrinks to a ball on its way to the tile.
  const ball = Math.min(W, SHEET) * 0.42;
  const sx = Animated.multiply(
    crumple.interpolate({ inputRange: [0, 0.45, 1], outputRange: [1, 0.78, ball / W] }),
    fly.interpolate({ inputRange: [0, 1], outputRange: [1, target.size / ball] }),
  );
  const sy = Animated.multiply(
    crumple.interpolate({ inputRange: [0, 0.45, 1], outputRange: [1, 0.55, ball / SHEET] }),
    fly.interpolate({ inputRange: [0, 1], outputRange: [1, target.size / ball] }),
  );
  const shade = Animated.multiply(
    y.interpolate({ inputRange: [0, SHEET], outputRange: [1, 0], extrapolate: 'clamp' }),
    fly.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
  );

  // ---------- actions ----------
  const pickChannel = (id: string) => {
    if (id === channelId) return;
    setChannelId(id);
    setConcepts([]);
    setPicked([]);
    setDirectionId(null);
    setError(null);
  };

  const draft = async () => {
    if (!channelId || drafting) return;
    setDrafting(true);
    setError(null);
    try {
      const ideas = await draftConcepts({
        channelId,
        direction: raw.trim(),
        directionId: dirId || '',
        directionOther: dirId === 'other' ? other.trim() : '',
        avoid: concepts.map((c) => c.title),
      });
      setConcepts((prev) => [...prev, ...ideas]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDrafting(false);
    }
  };

  const toggle = (i: number) => setPicked((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]));
  const chosen = picked.map((i) => concepts[i]).filter(Boolean);
  const combined = mode === 'combined' && chosen.length > 1;
  const ready = !!channelId && chosen.length > 0 && !building && !drafting;

  const build = async () => {
    if (!ready || !channelId) return;
    setBuilding(true);
    setError(null);
    try {
      await createReels({
        channelId,
        ideas: chosen,
        notes: notes.trim(),
        mode: combined ? 'combined' : 'separate',
        directionId: dirId || '',
        directionOther: dirId === 'other' ? other.trim() : '',
      });
      flyAway(channelId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBuilding(false);
    }
  };

  const buildLabel = chosen.length === 0 ? 'Pick a concept' : combined ? 'Build structure for 1 combined reel' : chosen.length === 1 ? 'Build structure' : `Build structure for ${chosen.length} reels`;

  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View style={[styles.backdrop, { opacity: shade }]}>
        <Pressable style={{ flex: 1 }} onPress={close} accessibilityLabel="Close" />
      </Animated.View>

      <Animated.View
        style={[
          styles.sheet,
          flying && { borderRadius: Math.min(W, SHEET) / 2, overflow: 'hidden' },
          {
            top: TOP,
            height: SHEET,
            transform: [
              { translateX: fly.interpolate({ inputRange: [0, 1], outputRange: [0, target.dx] }) },
              { translateY: Animated.add(y, fly.interpolate({ inputRange: [0, 1], outputRange: [0, target.dy] })) },
              { rotate: crumple.interpolate({ inputRange: [0, 0.45, 1], outputRange: ['0deg', '-5deg', '9deg'] }) },
              { rotate: fly.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '200deg'] }) },
              { scaleX: sx },
              { scaleY: sy },
            ],
          },
        ]}
      >
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={TOP}>
          <View {...pan.panHandlers}>
            <View style={styles.gripZone}>
              <View style={styles.grip} />
            </View>
            <View style={styles.head}>
              <Text style={styles.title}>Concept Generator</Text>
              <Press style={styles.close} scale={0.9} onPress={close} accessibilityLabel="Close">
                <View style={{ transform: [{ rotate: '45deg' }] }}>
                  <Plus size={20} />
                </View>
              </Press>
            </View>
          </View>

          <ScrollView contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.channels}>
              {ORDER.map((s) => {
                const on = s.channelId === channelId;
                return (
                  <Press
                    key={s.channelId}
                    style={[styles.channel, on && styles.channelOn]}
                    scale={0.95}
                    onPress={() => pickChannel(s.channelId)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`${s.name}, ${s.platform}`}
                  >
                    <Avatar slot={s} size={32} live />
                    <Text numberOfLines={1} style={styles.channelName}>{s.name}</Text>
                    {s.platform === 'youtube' ? <YouTubeMark size={15} /> : <InstagramMark size={13} />}
                  </Press>
                );
              })}
            </ScrollView>

            <View style={{ paddingHorizontal: 16 }}>
              {!slot ? (
                <View style={styles.hint}>
                  <Text style={styles.hintText}>Pick a channel to see what works there and draft concepts for it.</Text>
                </View>
              ) : (
                <>
                  <ChannelContext channelId={slot.channelId} />

                  <Text style={styles.h2}>Raw idea</Text>
                  <VoiceField
                    value={raw}
                    onChangeText={setRaw}
                    placeholder="Say or type anything. It's read as direction, never copied."
                    minHeight={88}
                  />

                  <Press style={[styles.draft, drafting && { opacity: 0.6 }]} disabled={drafting} onPress={draft} accessibilityLabel="Draft concepts with AI">
                    {drafting ? <ActivityIndicator color={C.ink} /> : <SparkIcon size={18} />}
                    <Text style={styles.draftText}>{drafting ? 'Drafting concepts…' : concepts.length ? 'Draft more' : 'Draft concepts'}</Text>
                  </Press>

                  {concepts.length ? (
                    <>
                      <Text style={styles.h2}>
                        Concepts <Text style={styles.h2sub}>{picked.length ? `${picked.length} picked` : 'tap to pick one or more'}</Text>
                      </Text>
                      <View style={{ gap: 8 }}>
                        {concepts.map((c, i) => (
                          <ConceptCard key={i} c={c} on={picked.includes(i)} onPress={() => toggle(i)} />
                        ))}
                      </View>

                      <Segmented
                        value={mode}
                        onChange={setMode}
                        left={{ key: 'separate', label: 'Separate reels' }}
                        right={{ key: 'combined', label: 'One combined reel' }}
                      />
                      {mode === 'combined' && chosen.length < 2 ? <Text style={styles.note}>Pick two or more concepts to combine them.</Text> : null}

                      <DirectionPicker channelId={slot.channelId} value={dirId} onChange={setDirectionId} other={other} onOther={setOther} />

                      <Text style={styles.h2}>Additional context</Text>
                      <VoiceField value={notes} onChangeText={setNotes} placeholder="Anything the structure should know. Optional." minHeight={72} />
                    </>
                  ) : null}
                </>
              )}
              {error ? <Text style={styles.error}>{error}</Text> : null}
            </View>
          </ScrollView>

          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <Press style={[styles.create, !ready && { opacity: 0.35 }]} disabled={!ready} onPress={build} accessibilityLabel={buildLabel}>
              {building ? <ActivityIndicator color="#fff" /> : <Text style={styles.createText}>{buildLabel}</Text>}
            </Press>
          </View>
        </KeyboardAvoidingView>

        {/* Paper creases that show as the page crumples. */}
        <Animated.View pointerEvents="none" style={[styles.paper, { opacity: crumple.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 0.5, 1] }) }]}>
          <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
            <Path d="M0 30 L38 44 L62 18 L100 36 M8 100 L30 62 L58 74 L100 52 M38 44 L30 62 M62 18 L58 74 M0 70 L30 62" stroke="#C9CBD0" strokeWidth={0.9} fill="none" />
          </Svg>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

/** What the channel promises and what has worked there: top posts by views, or the latest when views aren't known. */
function ChannelContext({ channelId }: { channelId: string }) {
  const { data } = useHome();
  const profiles = useProfiles();
  const { reels } = useReels();
  const ch = data?.channels.find((c) => c.id === channelId);
  const prof = profiles?.find((p) => p.id === channelId);
  const posts = (ch?.posts || []).filter((p) => p.status === 'published');
  const byViews = posts.filter((p) => p.views != null).sort((a, b) => (b.views || 0) - (a.views || 0));
  const top: Post[] = (byViews.length ? byViews : posts).slice(0, 6);
  const making = (reels || []).filter((r) => r.channelId === channelId).length;
  const stats = [
    ch?.stats.followers != null ? `${compact(ch.stats.followers)} ${ch.platform === 'youtube' ? 'subscribers' : 'followers'}` : null,
    posts.length ? `${posts.length} posts` : null,
    making ? `${making} in production` : null,
  ].filter(Boolean);

  return (
    <View style={styles.ctx}>
      {prof?.promise ? <Text style={styles.promise}>{prof.promise}</Text> : null}
      {stats.length ? <Text style={styles.ctxStats}>{stats.join(' · ')}</Text> : null}
      {top.length ? (
        <>
          <Text style={styles.ctxLabel}>{byViews.length ? 'Best performing' : 'Latest posts'}</Text>
          {!top.some((p) => p.thumb) ? (
            // No cover images known (Instagram schedule entries): a plain list reads better than empty boxes.
            <View style={{ gap: 6 }}>
              {top.slice(0, 4).map((p, i) => (
                <View key={p.at + i} style={styles.postRow}>
                  <Text numberOfLines={1} style={[styles.postTitle, { flex: 1, marginTop: 0 }]}>{p.title}</Text>
                  {p.views != null ? <Text style={[styles.postViews, { marginTop: 0 }]}>{compact(p.views)}</Text> : null}
                </View>
              ))}
            </View>
          ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ marginHorizontal: -14 }}>
            <View style={{ width: 6 }} />
            {top.map((p, i) => (
              <View key={p.at + i} style={styles.post}>
                {p.thumb ? <Image source={p.thumb} style={styles.thumb} contentFit="cover" /> : <View style={[styles.thumb, { backgroundColor: C.empty }]} />}
                <Text numberOfLines={2} style={styles.postTitle}>{p.title}</Text>
                {p.views != null ? <Text style={styles.postViews}>{compact(p.views)} views</Text> : null}
              </View>
            ))}
            <View style={{ width: 6 }} />
          </ScrollView>
          )}
        </>
      ) : (
        <Text style={styles.ctxStats}>Nothing posted yet. Concepts come from the channel's promise and audience.</Text>
      )}
    </View>
  );
}

function ConceptCard({ c, on, onPress }: { c: Concept; on: boolean; onPress: () => void }) {
  return (
    <Press style={[styles.concept, on && styles.conceptOn]} scale={0.98} onPress={onPress} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
      <View style={{ flex: 1 }}>
        <Text style={styles.cTitle}>{c.title}</Text>
        <Text style={styles.cHook}>{c.hook}</Text>
        <Text numberOfLines={on ? undefined : 3} style={styles.cBody}>{c.premise}</Text>
        {on && c.why ? <Text style={styles.cWhy}>{c.why}</Text> : null}
      </View>
      <View style={[styles.tick, on && styles.tickOn]}>{on ? <Check size={13} /> : null}</View>
    </Press>
  );
}

type Opt<K extends string> = { key: K; label: string };

/** Two options on a track; the knob slides to the one tapped. Left is the default. */
function Segmented<K extends string>({ value, onChange, left, right }: { value: K; onChange: (k: K) => void; left: Opt<K>; right: Opt<K> }) {
  const [w, setW] = useState(0);
  const x = useRef(new Animated.Value(value === right.key ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(x, { toValue: value === right.key ? 1 : 0, damping: 22, stiffness: 260, useNativeDriver: native }).start();
  }, [value, right.key, x]);
  const half = (w - 8) / 2;
  return (
    <View style={styles.seg} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {w ? <Animated.View style={[styles.knob, { width: half, transform: [{ translateX: x.interpolate({ inputRange: [0, 1], outputRange: [0, half] }) }] }]} /> : null}
      {[left, right].map((o) => (
        <Pressable key={o.key} style={styles.segOpt} onPress={() => onChange(o.key)} accessibilityRole="radio" accessibilityState={{ selected: value === o.key }}>
          <Text style={[styles.segText, value === o.key && { color: C.ink, fontFamily: F.b }]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Generation direction: the channel's own ways of making content first, every other one after, and Other for Vedant's own words. */
function DirectionPicker({ channelId, value, onChange, other, onOther }: { channelId: string; value: string | null; onChange: (id: string) => void; other: string; onOther: (t: string) => void }) {
  const dirs = useDirections();
  const [open, setOpen] = useState(false);
  const list = dirs?.directions || [];
  const mine = list.filter((d) => d.channels.includes(channelId));
  const rest = list.filter((d) => !d.channels.includes(channelId));
  const current = value === 'other' ? { name: 'Other', summary: 'Your own direction' } : list.find((d) => d.id === value);
  const isDefault = value != null && value === dirs?.defaults[channelId];

  const row = (id: string, name: string, summary: string) => {
    const on = id === value;
    return (
      <Pressable
        key={id}
        style={[styles.dirRow, on && { backgroundColor: C.bg }]}
        onPress={() => {
          onChange(id);
          setOpen(false);
        }}
        accessibilityRole="radio"
        accessibilityState={{ selected: on }}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.dirName}>
            {name}
            {id === dirs?.defaults[channelId] ? <Text style={styles.dirDefault}>  Default</Text> : null}
          </Text>
          <Text numberOfLines={2} style={styles.dirSum}>{summary}</Text>
        </View>
        {on ? <View style={[styles.tick, styles.tickOn]}><Check size={13} /></View> : null}
      </Pressable>
    );
  };

  return (
    <>
      <Text style={styles.h2}>Generation direction</Text>
      <Press style={styles.dropdown} scale={0.98} onPress={() => setOpen((o) => !o)} accessibilityRole="button" accessibilityState={{ expanded: open }}>
        <View style={{ flex: 1 }}>
          <Text style={styles.dirName}>
            {current?.name || (dirs ? 'Choose a direction' : 'Loading…')}
            {isDefault ? <Text style={styles.dirDefault}>  Default</Text> : null}
          </Text>
          {current && !open ? <Text numberOfLines={1} style={styles.dirSum}>{current.summary}</Text> : null}
        </View>
        <View style={{ transform: [{ rotate: open ? '90deg' : '-90deg' }] }}>
          <Chevron size={18} color={C.muted} />
        </View>
      </Press>
      {open ? (
        <View style={styles.dirList}>
          {mine.map((d) => row(d.id, d.name, d.summary))}
          {rest.length ? <Text style={styles.dirGroup}>Other channels' directions</Text> : null}
          {rest.map((d) => row(d.id, d.name, d.summary))}
          {row('other', 'Other', 'Describe the style in your own words')}
        </View>
      ) : null}
      {value === 'other' ? (
        <View style={{ marginTop: 8 }}>
          <TextInput
            style={styles.otherInput}
            value={other}
            onChangeText={onOther}
            placeholder="How should this one be made?"
            placeholderTextColor={C.faint}
            multiline
            maxLength={1000}
          />
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(20,20,20,0.4)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: C.bg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -4 },
    elevation: 16,
  },
  paper: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#FAFAFB' },
  gripZone: { height: 22, alignItems: 'center', justifyContent: 'center' },
  grip: { width: 40, height: 5, borderRadius: 3, backgroundColor: '#C9CBD0' },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 10 },
  title: { flex: 1, fontFamily: F.b, fontSize: 24, lineHeight: 30, letterSpacing: -0.4, color: C.ink },
  close: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  channels: { gap: 8, paddingHorizontal: 16, paddingVertical: 4 },
  channel: { height: 48, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 8, paddingRight: 12, borderRadius: 24, backgroundColor: C.card, borderWidth: 2, borderColor: 'transparent' },
  channelOn: { borderColor: C.ink },
  channelName: { maxWidth: 130, fontFamily: F.s, fontSize: 14, lineHeight: 18, color: C.ink },
  hint: { marginTop: 16, padding: 16, borderRadius: 20, backgroundColor: C.card },
  hintText: { fontFamily: F.r, fontSize: 15, lineHeight: 22, color: C.muted },
  ctx: { marginTop: 12, padding: 14, borderRadius: 20, backgroundColor: C.card },
  promise: { fontFamily: F.s, fontSize: 15, lineHeight: 21, color: C.ink },
  ctxStats: { marginTop: 4, fontFamily: F.m, fontSize: 13, lineHeight: 18, color: C.muted },
  ctxLabel: { marginTop: 12, marginBottom: 8, fontFamily: F.s, fontSize: 13, lineHeight: 18, color: C.ink2 },
  post: { width: 104 },
  postRow: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 34, paddingHorizontal: 10, borderRadius: 10, backgroundColor: C.bg },
  thumb: { width: 104, height: 138, borderRadius: 12 },
  postTitle: { marginTop: 6, fontFamily: F.m, fontSize: 12, lineHeight: 16, color: C.ink },
  postViews: { marginTop: 2, fontFamily: F.b, fontSize: 12, lineHeight: 16, color: C.ink },
  h2: { marginTop: 20, marginBottom: 8, fontFamily: F.s, fontSize: 16, lineHeight: 20, color: C.ink },
  h2sub: { fontFamily: F.m, fontSize: 13, color: C.muted },
  draft: { marginTop: 10, height: 48, borderRadius: 24, backgroundColor: C.card, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderColor: C.ink },
  draftText: { fontFamily: F.b, fontSize: 15, color: C.ink },
  concept: { flexDirection: 'row', gap: 12, padding: 14, borderRadius: 20, backgroundColor: C.card, borderWidth: 2, borderColor: 'transparent' },
  conceptOn: { borderColor: C.ink },
  cTitle: { fontFamily: F.b, fontSize: 16, lineHeight: 21, color: C.ink },
  cHook: { marginTop: 4, fontFamily: F.s, fontSize: 14, lineHeight: 20, color: C.ink2 },
  cBody: { marginTop: 4, fontFamily: F.r, fontSize: 14, lineHeight: 20, color: C.muted },
  cWhy: { marginTop: 8, fontFamily: F.m, fontSize: 13, lineHeight: 18, color: C.growInk },
  tick: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: C.empty, alignItems: 'center', justifyContent: 'center' },
  tickOn: { backgroundColor: C.ink, borderColor: C.ink },
  seg: { marginTop: 16, height: 48, borderRadius: 24, backgroundColor: C.empty, padding: 4, flexDirection: 'row' },
  knob: { position: 'absolute', top: 4, left: 4, bottom: 4, borderRadius: 20, backgroundColor: C.card, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  segOpt: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  segText: { fontFamily: F.s, fontSize: 14, color: C.muted },
  note: { marginTop: 6, fontFamily: F.m, fontSize: 13, lineHeight: 18, color: C.muted },
  dropdown: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18, backgroundColor: C.card },
  dirList: { marginTop: 6, padding: 6, borderRadius: 18, backgroundColor: C.card },
  dirRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12 },
  dirGroup: { marginTop: 8, marginBottom: 2, marginLeft: 10, fontFamily: F.s, fontSize: 12, lineHeight: 16, color: C.faint },
  dirName: { fontFamily: F.s, fontSize: 15, lineHeight: 20, color: C.ink },
  dirDefault: { fontFamily: F.m, fontSize: 12, color: C.growInk },
  dirSum: { marginTop: 1, fontFamily: F.r, fontSize: 13, lineHeight: 18, color: C.muted },
  otherInput: { minHeight: 64, borderRadius: 18, backgroundColor: C.card, padding: 14, fontFamily: F.r, fontSize: 15, lineHeight: 21, color: C.ink, textAlignVertical: 'top' },
  error: { marginTop: 16, fontFamily: F.m, fontSize: 14, lineHeight: 20, color: '#B4232F' },
  footer: { paddingHorizontal: 16, paddingTop: 10, backgroundColor: C.bg },
  create: { height: 52, borderRadius: 26, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  createText: { fontFamily: F.b, fontSize: 16, color: '#fff' },
});
