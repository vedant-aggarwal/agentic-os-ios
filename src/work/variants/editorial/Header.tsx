import { useEffect } from 'react';
import { type StyleProp, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { F } from '@/theme';
import type { OrcaState, ProviderUsage } from '../../types';
import { orcaWaiting, orcaWorking } from '../../ui/orca';
import { Press } from '../../ui/Press';
import type { HeaderProps } from '../types';
import {
  ACCENT, dateline, display, EASE, INK, INK_FAINT, INK_GHOST, INK_SOFT, level, LIVE, pctOf, resetWhen, RULE, useFaces, WARN,
} from './ink';

// The cover: WORK set heavy and tight with the dateline beside it, a heavy rule, Orca as the strapline, then the
// limits as huge light figures over fine progress rules, Claude and Codex in two columns of a Swiss grid. The
// 5-hour and model-only windows sit under them as a smaller second row. The rules draw in once when the figures
// first show; nothing else moves.

const MAST = 64;
const FIG = 96;
const FIG_WIDE = 82; // "100" still fits half a phone
const MINOR = 28;

export function Header({ orca, orcaError, onOrcaPress }: HeaderProps) {
  const face = useFaces();
  return (
    <View style={s.head}>
      <Masthead heavy={face.heavy} />
      <Strapline orca={orca} error={orcaError} onPress={onOrcaPress} />
      <Limits orca={orca} error={orcaError} light={face.light} />
    </View>
  );
}

function Masthead({ heavy }: { heavy: string }) {
  const { day, date } = dateline();
  return (
    <View>
      <View style={s.mastRow}>
        <Text accessibilityRole="header" accessibilityLabel="Work" maxFontSizeMultiplier={1} style={[s.mast, { fontFamily: heavy }]}>
          WORK<Text style={s.stop}>.</Text>
        </Text>
        <View style={s.dateline} accessible accessibilityLabel={`${day} ${date}`}>
          <Text maxFontSizeMultiplier={1.2} style={[s.caps, s.capsTrim]}>{day}</Text>
          <Text maxFontSizeMultiplier={1.2} style={[s.caps, s.capsTrim, s.capsSoft]}>{date}</Text>
        </View>
      </View>
      <View style={s.heavyRule} />
    </View>
  );
}

type Part = { text: string; color: string };

function straplineOf(orca: OrcaState | null, error: string | null): { mark: string; lead: string; parts: Part[] } {
  if (!orca) return { mark: error ? WARN : INK_GHOST, lead: error ? 'Can’t reach your PC' : 'Asking your PC about Orca', parts: [] };
  if (!orca.up) return { mark: WARN, lead: 'Orca isn’t running on your PC', parts: [] };
  const working = orca.agents.filter(orcaWorking).length;
  const waiting = orca.agents.filter(orcaWaiting).length;
  const parts: Part[] = [];
  if (working) parts.push({ text: `${working} working`, color: INK_SOFT });
  if (waiting) parts.push({ text: `${waiting} waiting`, color: WARN });
  if (!parts.length) parts.push({ text: 'idle', color: INK_FAINT });
  return { mark: waiting ? WARN : working ? LIVE : INK_FAINT, lead: 'Orca is running', parts };
}

/** Orca as a caption line under the masthead: is it there, and how many agents work and wait. */
function Strapline({ orca, error, onPress }: { orca: OrcaState | null; error: string | null; onPress: () => void }) {
  const line = straplineOf(orca, error);
  const parts = line.parts;
  const label = `${line.lead}${parts.length ? `: ${parts.map((p) => p.text).join(', ')}` : ''}. Tap for details`;
  return (
    <Press onPress={onPress} haptic hitSlop={6} accessibilityLabel={label} style={s.strap}>
      {(pressed) => (
        <View style={[s.strapRow, pressed && s.strapPressed]}>
          <View style={[s.mark, { backgroundColor: line.mark }]} />
          <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={s.strapText}>
            <Text style={s.strapLead}>{line.lead}</Text>
            {parts.map((p) => (
              <Text key={p.text}>
                <Text style={s.strapDot}>{'  ·  '}</Text>
                <Text style={{ color: p.color }}>{p.text}</Text>
              </Text>
            ))}
          </Text>
        </View>
      )}
    </Press>
  );
}

function Limits({ orca, error, light }: { orca: OrcaState | null; error: string | null; light: string }) {
  const usage = orca?.usage ?? null;
  if (!usage) {
    if (orca?.up === false || (!orca && error)) {
      return (
        <View style={s.limits}>
          <Text style={s.caps}>Claude · Codex</Text>
          <Text maxFontSizeMultiplier={1.3} style={[s.quote, { fontFamily: light }]}>Usage shows while Orca is open on your PC.</Text>
        </View>
      );
    }
    return (
      <View style={[s.limits, s.grid]} accessible accessibilityLabel="Loading usage">
        <Skeleton name="Claude" />
        <View style={s.gridRule} />
        <Skeleton name="Codex" />
      </View>
    );
  }
  return (
    <View style={[s.limits, s.grid]}>
      <Column name="Claude" u={usage.claude} light={light} />
      <View style={s.gridRule} />
      <Column name="Codex" u={usage.codex} light={light} />
    </View>
  );
}

function Column({ name, u, light }: { name: string; u: ProviderUsage | null; light: string }) {
  const main = u?.weekly ?? u?.session ?? null;
  if (!u || u.status !== 'ok' || !main) {
    const why = u && u.status !== 'ok' ? 'Not signed in on the PC' : 'Not available';
    return (
      <View style={s.col} accessible accessibilityLabel={`${name} usage: ${why}`}>
        <Label name={name} />
        <Text maxFontSizeMultiplier={1.3} style={[s.none, { fontFamily: light }]}>{why}</Text>
      </View>
    );
  }
  const pct = pctOf(main);
  const tone = level(pct);
  const when = resetWhen(main);
  const minors = [
    ...(u.session && u.weekly ? [{ label: '5-hour', w: u.session }] : []),
    ...u.extra.map((e) => ({ label: e.label, w: e.window })),
  ].map((m) => {
    const r = resetWhen(m.w);
    return { label: m.label, pct: pctOf(m.w), reset: r && r !== when ? r : null };
  });
  const said = minors.map((m) => `${m.label} ${m.pct}%${m.reset ? `, resets ${m.reset}` : ''}`).join('. ');
  const a11y = `${name}: ${pct}% of the ${u.weekly ? 'week' : '5 hours'} used${when ? `, resets ${when}` : ''}${said ? `. ${said}` : ''}`;
  return (
    <View style={s.col} accessible accessibilityLabel={a11y}>
      <Label name={name} window={u.weekly ? 'Week' : '5 hours'} />
      <Figure value={pct} size={pct >= 100 ? FIG_WIDE : FIG} sign={26} color={tone ?? INK} light={light} style={s.figMain} />
      <Rule pct={pct} color={tone ?? ACCENT} />
      <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={s.caption}>
        {when ? <><Text style={s.captionLead}>Resets </Text>{when}</> : u.weekly ? 'This week' : 'Next 5 hours'}
      </Text>
      {minors.length ? (
        <View style={s.minors}>
          {minors.map((m) => (
            <View key={m.label} style={s.minor}>
              <Text numberOfLines={1} maxFontSizeMultiplier={1.2} style={[s.caps, s.capsFaint]}>{m.label}</Text>
              <Figure value={m.pct} size={MINOR} sign={12} color={level(m.pct) ?? INK} light={light} style={s.figMinor} />
              <Rule pct={m.pct} color={level(m.pct) ?? ACCENT} thin />
              {m.reset ? <Text numberOfLines={1} maxFontSizeMultiplier={1.2} style={s.minorReset}>{m.reset}</Text> : null}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Label({ name, window }: { name: string; window?: string }) {
  return (
    <View style={s.label}>
      <Text maxFontSizeMultiplier={1.2} style={s.caps}>{name}</Text>
      {window ? <Text maxFontSizeMultiplier={1.2} style={[s.caps, s.capsFaint]}>{window}</Text> : null}
    </View>
  );
}

/** A figure with a superior per-cent sign, both trimmed to their ink so their tops line up. */
function Figure({ value, size, sign, color, light, style }: {
  value: number; size: number; sign: number; color: string; light: string; style: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[s.figRow, style]}>
      <Text maxFontSizeMultiplier={1} style={[s.fig, display(size), { fontFamily: light, color, letterSpacing: -0.045 * size }]}>{value}</Text>
      <Text maxFontSizeMultiplier={1} style={[s.fig, display(sign), { fontFamily: light, color, marginLeft: size * 0.04 }]}>%</Text>
    </View>
  );
}

/** A fine rule under a figure: a hairline track and the used share drawn over it, drawn in once on first show. */
function Rule({ pct, color, thin = false }: { pct: number; color: string; thin?: boolean }) {
  const reduce = useReducedMotion();
  const t = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    t.set(reduce ? 1 : withTiming(1, { duration: 900, easing: EASE }));
  }, [reduce, t]);
  const grow = useAnimatedStyle(() => ({ transform: [{ scaleX: t.value }] }));
  return (
    <View style={[s.rule, thin && s.ruleThin]}>
      <View style={s.track} />
      <Animated.View style={[s.fill, thin && s.fillThin, { width: `${Math.max(1.5, pct)}%`, backgroundColor: color }, grow]} />
    </View>
  );
}

function Skeleton({ name }: { name: string }) {
  return (
    <View style={s.col}>
      <Label name={name} window="Week" />
      <View style={s.ghostFig} />
      <View style={s.rule}><View style={s.track} /></View>
      <View style={s.ghostLine} />
    </View>
  );
}

const CAPS = 10.5;
const CAPS_LH = Math.ceil(CAPS * 1.3);
const capsBase = (CAPS_LH - 1.3 * CAPS) / 2 + 1.005 * CAPS;

const s = StyleSheet.create({
  head: { paddingBottom: 22 },

  mastRow: { flexDirection: 'row', alignItems: 'stretch', justifyContent: 'space-between', gap: 12 },
  mast: { ...display(MAST), color: INK, letterSpacing: -0.05 * MAST },
  stop: { color: ACCENT },
  dateline: { alignItems: 'flex-end', justifyContent: 'space-between' },
  caps: {
    fontFamily: F.semibold, fontSize: CAPS, lineHeight: CAPS_LH, letterSpacing: 1.6, textTransform: 'uppercase', color: INK,
    fontVariant: ['tabular-nums'],
  },
  // trimmed to the capitals, so the dateline spans exactly the masthead's cap height
  capsTrim: { marginTop: -(capsBase - 0.71 * CAPS), marginBottom: -(CAPS_LH - capsBase) },
  capsSoft: { color: INK_SOFT },
  capsFaint: { color: INK_FAINT },
  heavyRule: { height: 3, backgroundColor: INK, marginTop: 12 },

  strap: { alignSelf: 'stretch' },
  strapRow: {
    flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: RULE,
  },
  strapPressed: { opacity: 0.6 },
  mark: { width: 7, height: 7 },
  strapText: { flexShrink: 1, fontFamily: F.regular, fontSize: 12.5, lineHeight: 17, color: INK_SOFT, fontVariant: ['tabular-nums'] },
  strapLead: { fontFamily: F.medium, color: INK },
  strapDot: { color: INK_GHOST },

  limits: { marginTop: 16, gap: 10 },
  grid: { flexDirection: 'row', gap: 0 },
  gridRule: { width: StyleSheet.hairlineWidth, backgroundColor: RULE, marginHorizontal: 14 },
  col: { flex: 1, minWidth: 0 },
  label: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },

  figRow: { flexDirection: 'row', alignItems: 'flex-start' },
  figMain: { marginTop: 12 },
  figMinor: { marginTop: 8 },
  fig: { fontVariant: ['tabular-nums'] },

  rule: { height: 2, marginTop: 12, justifyContent: 'flex-end' },
  ruleThin: { height: 1.5, marginTop: 8 },
  track: { position: 'absolute', left: 0, right: 0, bottom: 0, height: StyleSheet.hairlineWidth, backgroundColor: RULE },
  fill: { height: 2, transformOrigin: 'left center' },
  fillThin: { height: 1.5 },

  caption: { marginTop: 9, fontFamily: F.regular, fontSize: 12, lineHeight: 16, color: INK_FAINT, fontVariant: ['tabular-nums'] },
  captionLead: { fontFamily: F.medium, color: INK_SOFT },

  minors: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 14, marginTop: 16 },
  minor: { width: '44%', minWidth: 60 },
  minorReset: { marginTop: 6, fontFamily: F.regular, fontSize: 11, lineHeight: 15, color: INK_FAINT, fontVariant: ['tabular-nums'] },

  none: { marginTop: 14, fontSize: 21, lineHeight: 28, letterSpacing: -0.4, color: INK_SOFT },
  quote: { fontSize: 24, lineHeight: 32, letterSpacing: -0.5, color: INK_SOFT, maxWidth: 320 },

  ghostFig: { marginTop: 12, width: 106, height: 70, backgroundColor: 'rgba(245,243,238,0.05)' },
  ghostLine: { marginTop: 11, width: 96, height: 10, backgroundColor: 'rgba(245,243,238,0.05)' },
});
