import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import type { OrcaState } from '../../types';
import { orcaWaiting, orcaWorking } from '../../ui/orca';
import { Press } from '../../ui/Press';
import type { HeaderProps } from '../types';
import { beat, blinkOpacity, useBeat } from './clock';
import { Limits } from './Limits';
import { alpha, M, MONO, P } from './palette';

// The console's head: the title, a prompt line for Orca (`orca › 2 working · 1 waiting` and a blinking block
// cursor; tap for what Orca is doing), and the LIMITS pane.

function Cursor({ color }: { color: string }) {
  const st = useAnimatedStyle(() => ({ opacity: blinkOpacity(beat.value, 0) }));
  return <Animated.View style={[s.cursor, { backgroundColor: color }, st]} />;
}

/** ↵: the line takes a tap, like a command waiting for Return. */
function ReturnGlyph() {
  return (
    <Svg width={14} height={14} viewBox="0 0 14 14">
      <Path d="M11.5 2.5V8H3.5M6 5.5L3.5 8L6 10.5" stroke={P.faint} strokeWidth={1.4} fill="none" strokeLinecap="square" />
    </Svg>
  );
}

function Prompt({ orca, error, onPress }: { orca: OrcaState | null; error: string | null; onPress: () => void }) {
  const working = orca?.agents.filter(orcaWorking).length ?? 0;
  const waiting = orca?.agents.filter(orcaWaiting).length ?? 0;
  let tone: string;
  let body: React.ReactNode;
  let a11y: string;
  if (!orca) {
    tone = error ? P.red : P.faint;
    body = <Text style={{ color: error ? P.red : P.dim }}>{error ? 'can’t reach your PC' : 'asking your PC…'}</Text>;
    a11y = error ? 'Orca: can’t reach your PC. Tap for details' : 'Asking your PC about Orca. Tap for details';
  } else if (!orca.up) {
    tone = P.amber;
    body = <Text style={{ color: P.amber }}>isn’t running on your PC</Text>;
    a11y = 'Orca isn’t running on your PC. Tap for details';
  } else {
    tone = P.green;
    body = working || waiting ? (
      <>
        {working ? <><Text style={[s.num, { color: P.green }]}>{working}</Text> working</> : null}
        {working && waiting ? <Text style={s.sep}> · </Text> : null}
        {waiting ? <><Text style={[s.num, { color: P.amber }]}>{waiting}</Text> waiting</> : null}
      </>
    ) : 'ready';
    a11y = `Orca is running: ${working ? `${working} working` : 'nothing working'}${waiting ? `, ${waiting} waiting for you` : ''}. Tap for details`;
  }
  const up = !!orca?.up;
  return (
    <Press onPress={onPress} haptic accessibilityLabel={a11y}>
      {(pressed) => (
        <View style={[s.prompt, { borderColor: alpha(tone, 0.34) }, pressed && { backgroundColor: alpha(tone, 0.1) }]}>
          <View style={[s.led, { backgroundColor: tone }, up && { boxShadow: `0 0 8px ${tone}` }]} />
          <Text numberOfLines={1} style={s.line}>
            <Text style={[s.host, { color: up ? P.green : P.dim }]}>orca</Text>
            <Text style={s.sep}> › </Text>
            {body}
          </Text>
          <Cursor color={up ? P.green : tone === P.faint ? P.dim : tone} />
          <View style={s.fill} />
          <ReturnGlyph />
        </View>
      )}
    </Press>
  );
}

export function Header({ orca, orcaError, onOrcaPress }: HeaderProps) {
  useBeat();
  return (
    <View style={s.header}>
      <Text accessibilityRole="header" style={M.title}>Work</Text>
      <Prompt orca={orca} error={orca ? null : orcaError} onPress={onOrcaPress} />
      <Limits usage={orca?.usage ?? null} up={orca ? orca.up : null} unreachable={!orca && !!orcaError} />
    </View>
  );
}

const s = StyleSheet.create({
  header: { paddingBottom: 24, gap: 12 },
  prompt: {
    flexDirection: 'row', alignItems: 'center', height: 40, paddingHorizontal: 12, gap: 10,
    borderWidth: 1, borderRadius: 3, backgroundColor: 'rgba(6,11,9,0.7)',
  },
  led: { width: 7, height: 7, borderRadius: 4 },
  line: { flexShrink: 1, fontFamily: MONO, fontSize: 13, lineHeight: 18, color: P.soft },
  host: { fontWeight: '700' },
  sep: { color: P.faint },
  num: { fontWeight: '700' },
  cursor: { width: 8, height: 16, marginLeft: -6 },
  fill: { flex: 1 },
});
