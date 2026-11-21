import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Keyboard,
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
import { ChannelContext } from '@/components/concepts/ChannelContext';
import { ConceptEditor } from '@/components/concepts/ConceptEditor';
import { StrengthSlider } from '@/components/concepts/StrengthSlider';
import { Check, Chevron, InstagramMark, Plus, SparkIcon, YouTubeMark } from '@/components/Icons';
import { Press } from '@/components/Press';
import { VoiceField } from '@/components/VoiceField';
import { createReels, useDirections, type Concept } from '@/lib/api';
import { land, measureTile } from '@/lib/flight';
import { INSTAGRAM, YOUTUBE, type Slot } from '@/lib/lineup';
import { live, resetSession } from '@/lib/live';
import { C, F } from '@/theme';

const native = Platform.OS !== 'web';
// Two rows of four: YouTube on top, Instagram below.
const ORDER: Slot[] = [...YOUTUBE, ...INSTAGRAM];

type Chat = { role: 'you' | 'kai'; text: string; error?: string };
const key = (v: number, i: number) => `${v}:${i}`;

/** Everything one channel's page holds. Each channel keeps its own, so switching channels mid-draft loses nothing. */
type Board = {
  raw: string;
  strength: number;
  directionId: string | null;
  other: string;
  versions: Concept[][];
  vi: number;
  picked: string[];
  chat: Chat[];
  say: string;
  busy: 'draft' | 'refine' | null;
  error: string | null;
};
const EMPTY: Board = { raw: '', strength: 2, directionId: null, other: '', versions: [], vi: 0, picked: [], chat: [], say: '', busy: null, error: null };

/**
 * Concept Generator: pick a channel, see what works there, give a raw idea (typed or spoken) and how closely to
 * follow it, then draft concepts. Each draft or chat change is a version; picks can come from any version.
 * Hold a concept to edit it, chat with Kai to reshape them, then build the structure. When it's done the sheet
 * crumples and flies into that channel's tile on the home grid.
 */
export default function ConceptGenerator() {
  const params = useLocalSearchParams<{ channel?: string; idea?: string }>();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const TOP = insets.top + 10;
  const SHEET = H - TOP;

  const [channelId, setChannelId] = useState<string | null>(ORDER.some((s) => s.channelId === params.channel) ? String(params.channel) : null);
  const [seedIdea] = useState(params.idea ? String(params.idea) : '');
  const [boards, setBoards] = useState<Record<string, Board>>({});
  const [editing, setEditing] = useState<{ v: number; i: number } | null>(null);
  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [flying, setFlying] = useState(false);
  const [kb, setKb] = useState(false);
  const sessionId = useRef('c' + Date.now().toString(36)).current;
  const cancels = useRef<Record<string, () => void>>({});
  const current = useRef(channelId);
  current.current = channelId;

  /** Change one channel's board; streaming replies keep landing on their own channel even after switching. */
  const upd = (ch: string, f: (b: Board) => Partial<Board>) =>
    setBoards((all) => {
      const b = all[ch] || { ...EMPTY, raw: seedIdea };
      return { ...all, [ch]: { ...b, ...f(b) } };
    });
  const board = (channelId && boards[channelId]) || { ...EMPTY, raw: seedIdea };
  const { raw, strength, directionId, other, versions, vi, picked, chat, say, busy } = board;
  const error = board.error || buildError;
  const set = (patch: Partial<Board>) => channelId && upd(channelId, () => patch);
  const setRaw = (t: string) => set({ raw: t });
  const setSay = (t: string) => set({ say: t });

  const dirs = useDirections();
  const slot = ORDER.find((s) => s.channelId === channelId);
  const dirId = directionId ?? (channelId ? dirs?.defaults[channelId] : null) ?? null;
  const shown = versions[vi] || [];

  // The footer button hides while typing so the keyboard and the button never cover the field together.
  useEffect(() => {
    const a = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKb(true));
    const b = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKb(false));
    return () => {
      a.remove();
      b.remove();
      const all = cancels.current;
      Object.keys(all).forEach((ch) => {
        all[ch]?.();
        resetSession(`refine:${sessionId}:${ch}`);
      });
    };
  }, [sessionId]);

  // ---------- scrolling helpers ----------
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  const chatScroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const ys = useRef<Record<string, number>>({});
  const at = (name: string) => (e: { nativeEvent: { layout: { y: number } } }) => (ys.current[name] = e.nativeEvent.layout.y);
  const scrollToY = (y: number, delay = 80) => setTimeout(() => scroller.current?.scrollTo({ y: Math.max(0, y), animated: true }), delay);
  const pad = (name: string) => (ys.current.body || 0) + (ys.current[name] || 0);

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
    Keyboard.dismiss();
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
    setEditing(null);
    setBuildError(null);
  };

  const direction = () => ({ directionId: dirId || '', directionOther: dirId === 'other' ? other.trim() : '' });

  /** A new version fills in as concepts stream from the PC. */
  const draft = () => {
    if (!channelId || busy) return;
    const ch = channelId;
    Keyboard.dismiss();
    const v = versions.length;
    upd(ch, (b) => ({ error: null, busy: 'draft', versions: [...b.versions, []], vi: v }));
    scrollToY(pad('concepts') - 8, 150);
    let got = 0;
    cancels.current[ch] = live('draft', {
      channelId: ch,
      direction: raw.trim(),
      strength,
      ...direction(),
      avoid: versions.flat().map((c) => c.title),
    }, {
      onConcept: (c) => {
        got++;
        upd(ch, (b) => ({ versions: b.versions.map((x, j) => (j === v ? [...x, c] : x)) }));
      },
      onDone: () => upd(ch, () => ({ busy: null })),
      onError: (e) =>
        upd(ch, (b) =>
          got
            ? { busy: null, error: e }
            : { busy: null, error: e, versions: b.versions.filter((_, j) => j !== v), vi: Math.max(0, Math.min(b.vi, v - 1)) },
        ),
    });
  };

  /** Ask Kai to change the concepts on screen; a reply with concepts becomes the next version. */
  const refine = () => {
    const message = say.trim();
    if (!channelId || !message || busy) return;
    const ch = channelId;
    const turn = chat.length;
    upd(ch, (b) => ({ say: '', error: null, busy: 'refine', chat: [...b.chat, { role: 'you', text: message }, { role: 'kai', text: '' }] }));
    const base = shown;
    const v = versions.length; // no draft can be running (busy), so the next version goes here
    let first = true;
    const reply = (f: (m: Chat) => Chat) => upd(ch, (b) => ({ chat: b.chat.map((m, j) => (j === turn + 1 ? f(m) : m)) }));
    cancels.current[ch] = live('refine', { sessionId: `${sessionId}:${ch}`, channelId: ch, message, concepts: base, ...direction() }, {
      onText: (t) => reply((m) => ({ ...m, text: m.text + t })),
      onConcept: (c) => {
        if (first) {
          first = false;
          upd(ch, (b) => ({ versions: [...b.versions, [c]], vi: v }));
          if (current.current === ch) scrollToY(pad('concepts') - 8, 120);
          return;
        }
        upd(ch, (b) => ({ versions: b.versions.map((x, j) => (j === v ? [...x, c] : x)) }));
      },
      onDone: () => upd(ch, () => ({ busy: null })),
      onError: (e) => {
        upd(ch, () => ({ busy: null }));
        reply((m) => ({ ...m, error: e }));
      },
    });
  };

  const setVi = (n: number) => set({ vi: n });
  const toggle = (i: number) => set({ picked: picked.includes(key(vi, i)) ? picked.filter((x) => x !== key(vi, i)) : [...picked, key(vi, i)] });
  const chosen = picked.map((k) => { const [v, i] = k.split(':').map(Number); return versions[v]?.[i]; }).filter(Boolean) as Concept[];
  const pickedHere = shown.filter((_, i) => picked.includes(key(vi, i))).length;
  const ready = !!channelId && chosen.length > 0 && !building && !busy;

  const build = async () => {
    if (!ready || !channelId) return;
    setBuilding(true);
    setBuildError(null);
    try {
      // What Vedant told Kai while refining is direction for the structure too.
      const notes = chat.filter((m) => m.role === 'you').map((m) => m.text).join(' / ').slice(0, 2000);
      await createReels({ channelId, ideas: chosen, notes, mode: 'separate', ...direction() });
      flyAway(channelId);
    } catch (e) {
      setBuildError(e instanceof Error ? e.message : String(e));
      setBuilding(false);
    }
  };

  const buildLabel = chosen.length === 0 ? 'Pick a concept' : chosen.length === 1 ? 'Build structure' : `Build structure for ${chosen.length} reels`;

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

        <ScrollView
          ref={scroller}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: kb ? 24 : 96 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          automaticallyAdjustKeyboardInsets
        >
          {/* Two rows of four: every channel visible at once, no sideways scrolling. */}
          <View style={styles.channels}>
            {ORDER.map((s) => {
              const on = s.channelId === channelId;
              return (
                <Press
                  key={s.channelId}
                  style={[styles.channel, on && styles.channelOn]}
                  scale={0.94}
                  onPress={() => pickChannel(s.channelId)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${s.name}, ${s.platform}`}
                >
                  <View>
                    <Avatar slot={s} size={44} live />
                    <View style={styles.badge}>{s.platform === 'youtube' ? <YouTubeMark size={12} /> : <InstagramMark size={11} />}</View>
                  </View>
                  <Text numberOfLines={1} style={styles.channelName}>{s.name}</Text>
                </Press>
              );
            })}
          </View>

          <View style={{ paddingHorizontal: 16 }} onLayout={at('body')}>
            {!slot ? (
              <View style={styles.hint}>
                <Text style={styles.hintText}>Pick a channel to see what works there and draft concepts for it.</Text>
              </View>
            ) : (
              <>
                <ChannelContext channelId={slot.channelId} />

                <DirectionPicker channelId={slot.channelId} value={dirId} onChange={(id) => set({ directionId: id })} other={other} onOther={(t) => set({ other: t })} />

                <View onLayout={at('raw')}>
                  <Text style={styles.h2}>Raw idea</Text>
                  <VoiceField value={raw} onChangeText={setRaw} placeholder="Type or say your idea" minHeight={88} onFocus={() => scrollToY(pad('raw') - 12, 300)} />
                </View>
                <StrengthSlider value={strength} onChange={(n) => set({ strength: n })} disabled={!raw.trim()} />

                <Press style={[styles.draft, !!busy && { opacity: 0.6 }]} disabled={!!busy} onPress={draft} accessibilityLabel="Draft concepts with AI">
                  {busy === 'draft' ? <ActivityIndicator color={C.ink} /> : <SparkIcon size={18} />}
                  <Text style={styles.draftText}>{busy === 'draft' ? 'Drafting…' : versions.length ? 'Draft a new version' : 'Draft concepts'}</Text>
                </Press>

                <View onLayout={at('concepts')}>
                  {versions.length ? (
                    <>
                      <View style={styles.vbar}>
                        <Text style={styles.h2flat}>Concepts</Text>
                        <View style={styles.pager}>
                          <Press style={[styles.arrow, vi === 0 && { opacity: 0.3 }]} disabled={vi === 0} scale={0.9} onPress={() => setVi(vi - 1)} accessibilityLabel="Previous version">
                            <Chevron size={16} />
                          </Press>
                          <Text style={styles.vnum}>{vi + 1} of {versions.length}</Text>
                          <Press style={[styles.arrow, vi === versions.length - 1 && { opacity: 0.3 }]} disabled={vi === versions.length - 1} scale={0.9} onPress={() => setVi(vi + 1)} accessibilityLabel="Next version">
                            <Chevron size={16} dir="right" />
                          </Press>
                        </View>
                      </View>
                      <Text style={styles.vhint}>
                        {picked.length ? `${picked.length} picked${picked.length !== pickedHere ? `, ${pickedHere} in this version` : ''}. ` : ''}Tap to pick, hold to edit.
                      </Text>
                      <View style={{ gap: 8 }}>
                        {shown.map((c, i) => (
                          <ConceptCard key={i} c={c} on={picked.includes(key(vi, i))} onPress={() => toggle(i)} onLongPress={() => setEditing({ v: vi, i })} />
                        ))}
                        {busy && vi === versions.length - 1 ? (
                          <View style={styles.writing}>
                            <ActivityIndicator color={C.muted} />
                            <Text style={styles.writingText}>{shown.length ? 'Writing the next one…' : 'Writing concepts…'}</Text>
                          </View>
                        ) : null}
                      </View>

                      <View onLayout={at('chat')}>
                        <Text style={styles.h2}>Shape them with Kai</Text>
                        {/* A fixed-height panel: the chat scrolls inside it instead of stretching the page. */}
                        <View style={styles.chatBox}>
                          <ScrollView
                            ref={chatScroll}
                            style={styles.chatScroll}
                            contentContainerStyle={{ gap: 8, padding: 10 }}
                            nestedScrollEnabled
                            onContentSizeChange={() => chatScroll.current?.scrollToEnd({ animated: true })}
                          >
                            {chat.length ? (
                              chat.map((m, i) => (
                                <View key={i} style={[styles.bubble, m.role === 'you' ? styles.mine : styles.theirs]}>
                                  {m.role === 'kai' && !m.text && !m.error ? (
                                    <ActivityIndicator size="small" color={C.muted} />
                                  ) : (
                                    <Text style={[styles.bubbleText, m.role === 'you' && { color: '#fff' }, m.error && { color: '#B4232F' }]}>{m.error ? m.error : m.text.trim()}</Text>
                                  )}
                                </View>
                              ))
                            ) : (
                              <Text style={styles.chatHint}>Tell Kai what to change: hooks, titles, tone, merge or replace. Each change comes back as a new version above.</Text>
                            )}
                          </ScrollView>
                        </View>
                        <VoiceField
                          value={say}
                          onChangeText={setSay}
                          placeholder="e.g. combine 1 and 3, make 2 darker"
                          minHeight={56}
                          onFocus={() => scrollToY(pad('chat') + 200, 300)}
                          right={
                            <Press style={[styles.send, (!say.trim() || !!busy) && { opacity: 0.35 }]} disabled={!say.trim() || !!busy} onPress={refine} scale={0.9} accessibilityLabel="Send to Kai">
                              <Chevron size={18} color="#fff" dir="right" />
                            </Press>
                          }
                        />
                      </View>
                    </>
                  ) : null}
                </View>
              </>
            )}
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>
        </ScrollView>

        {!kb ? (
          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <Press style={[styles.create, !ready && { opacity: 0.35 }]} disabled={!ready} onPress={build} accessibilityLabel={buildLabel}>
              {building ? <ActivityIndicator color="#fff" /> : <Text style={styles.createText}>{buildLabel}</Text>}
            </Press>
          </View>
        ) : null}

        {/* Paper creases that show as the page crumples. */}
        <Animated.View pointerEvents="none" style={[styles.paper, { opacity: crumple.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 0.5, 1] }) }]}>
          <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
            <Path d="M0 30 L38 44 L62 18 L100 36 M8 100 L30 62 L58 74 L100 52 M38 44 L30 62 M62 18 L58 74 M0 70 L30 62" stroke="#C9CBD0" strokeWidth={0.9} fill="none" />
          </Svg>
        </Animated.View>
      </Animated.View>

      {editing && versions[editing.v]?.[editing.i] ? (
        <ConceptEditor
          concept={versions[editing.v][editing.i]}
          onClose={() => setEditing(null)}
          onSave={(c) => {
            const e = editing;
            set({ versions: versions.map((x, j) => (j === e.v ? x.map((y2, k) => (k === e.i ? c : y2)) : x)) });
            setEditing(null);
          }}
        />
      ) : null}
    </View>
  );
}

function ConceptCard({ c, on, onPress, onLongPress }: { c: Concept; on: boolean; onPress: () => void; onLongPress: () => void }) {
  return (
    <Press
      style={[styles.concept, on && styles.conceptOn]}
      scale={0.98}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      accessibilityHint="Hold to edit"
    >
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
      <Text style={styles.h2}>Direction</Text>
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
        <TextInput
          style={styles.otherInput}
          value={other}
          onChangeText={onOther}
          placeholder="How should this one be made?"
          placeholderTextColor={C.faint}
          multiline
          maxLength={1000}
        />
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
  channels: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 8, columnGap: 8, paddingHorizontal: 16, paddingTop: 2 },
  channel: { width: '22.9%', flexGrow: 1, paddingTop: 10, paddingBottom: 8, paddingHorizontal: 4, alignItems: 'center', gap: 6, borderRadius: 18, backgroundColor: C.card, borderWidth: 2, borderColor: 'transparent' },
  channelOn: { borderColor: C.ink },
  badge: { position: 'absolute', right: -5, bottom: -2, width: 20, height: 20, borderRadius: 10, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  channelName: { maxWidth: '100%', fontFamily: F.s, fontSize: 12, lineHeight: 16, color: C.ink },
  hint: { marginTop: 16, padding: 16, borderRadius: 20, backgroundColor: C.card },
  hintText: { fontFamily: F.r, fontSize: 15, lineHeight: 22, color: C.muted },
  h2: { marginTop: 20, marginBottom: 8, fontFamily: F.s, fontSize: 16, lineHeight: 20, color: C.ink },
  h2flat: { flex: 1, fontFamily: F.s, fontSize: 16, lineHeight: 20, color: C.ink },
  draft: { marginTop: 12, height: 48, borderRadius: 24, backgroundColor: C.card, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderColor: C.ink },
  draftText: { fontFamily: F.b, fontSize: 15, color: C.ink },
  vbar: { marginTop: 20, flexDirection: 'row', alignItems: 'center' },
  pager: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  arrow: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  vnum: { minWidth: 52, textAlign: 'center', fontFamily: F.s, fontSize: 13, color: C.ink },
  vhint: { marginTop: 4, marginBottom: 8, fontFamily: F.m, fontSize: 12, lineHeight: 16, color: C.muted },
  writing: { height: 56, borderRadius: 20, backgroundColor: C.card, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  writingText: { fontFamily: F.m, fontSize: 14, color: C.muted },
  concept: { flexDirection: 'row', gap: 12, padding: 14, borderRadius: 20, backgroundColor: C.card, borderWidth: 2, borderColor: 'transparent' },
  conceptOn: { borderColor: C.ink },
  cTitle: { fontFamily: F.b, fontSize: 16, lineHeight: 21, color: C.ink },
  cHook: { marginTop: 4, fontFamily: F.s, fontSize: 14, lineHeight: 20, color: C.ink2 },
  cBody: { marginTop: 4, fontFamily: F.r, fontSize: 14, lineHeight: 20, color: C.muted },
  cWhy: { marginTop: 8, fontFamily: F.m, fontSize: 13, lineHeight: 18, color: C.growInk },
  tick: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: C.empty, alignItems: 'center', justifyContent: 'center' },
  tickOn: { backgroundColor: C.ink, borderColor: C.ink },
  chatBox: { marginBottom: 8, borderRadius: 20, backgroundColor: C.card, overflow: 'hidden' },
  chatScroll: { maxHeight: 220 },
  chatHint: { padding: 4, fontFamily: F.r, fontSize: 14, lineHeight: 20, color: C.muted },
  bubble: { maxWidth: '86%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18 },
  mine: { alignSelf: 'flex-end', backgroundColor: C.ink, borderBottomRightRadius: 6 },
  theirs: { alignSelf: 'flex-start', backgroundColor: C.card, borderBottomLeftRadius: 6 },
  bubbleText: { fontFamily: F.r, fontSize: 15, lineHeight: 21, color: C.ink },
  send: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  dropdown: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18, backgroundColor: C.card },
  dirList: { marginTop: 6, padding: 6, borderRadius: 18, backgroundColor: C.card },
  dirRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12 },
  dirGroup: { marginTop: 8, marginBottom: 2, marginLeft: 10, fontFamily: F.s, fontSize: 12, lineHeight: 16, color: C.faint },
  dirName: { fontFamily: F.s, fontSize: 15, lineHeight: 20, color: C.ink },
  dirDefault: { fontFamily: F.m, fontSize: 12, color: C.growInk },
  dirSum: { marginTop: 1, fontFamily: F.r, fontSize: 13, lineHeight: 18, color: C.muted },
  otherInput: { marginTop: 8, minHeight: 64, borderRadius: 18, backgroundColor: C.card, padding: 14, fontFamily: F.r, fontSize: 15, lineHeight: 21, color: C.ink, textAlignVertical: 'top' },
  error: { marginTop: 16, fontFamily: F.m, fontSize: 14, lineHeight: 20, color: '#B4232F' },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 10, backgroundColor: C.bg },
  create: { height: 52, borderRadius: 26, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  createText: { fontFamily: F.b, fontSize: 16, color: '#fff' },
});
