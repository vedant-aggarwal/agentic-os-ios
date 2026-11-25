import { StyleSheet, Text, View } from 'react-native';
import { t } from '@/aspects/kit';
import { C } from '@/theme';
import { NORA_TEXT } from './parts';

// What was said on a line call, turn by turn: the caller, Nora, and him once he took over. The same look as the
// transcript on Nora's own call screen (src/nora/call/LiveTranscript.tsx): a small name over each turn, Nora's in her
// rose. A turn still being spoken is dimmer and settles to full strength once it's over.

export type TurnLine = { id?: string; who: 'caller' | 'nora' | 'you'; text: string; final?: boolean };

/** The caller's name over their turns: the first word of the name Nora has ("Raju"), else "Caller". */
export const callerShort = (name: string | null) => name?.trim().split(/\s+/)[0] || 'Caller';

export function Turns({ lines, caller }: { lines: TurnLine[]; caller: string }) {
  return <View style={s.list}>{lines.map((l, i) => <Turn key={l.id ?? i} l={l} caller={caller} />)}</View>;
}

function Turn({ l, caller }: { l: TurnLine; caller: string }) {
  const who = l.who === 'nora' ? 'Nora' : l.who === 'you' ? 'You' : caller;
  return (
    <View style={s.line} accessible accessibilityLabel={`${who}: ${l.text}`}>
      <Text style={[t.caption, s.who, l.who === 'nora' ? { color: NORA_TEXT } : l.who === 'you' ? { color: C.text } : null]}>{who}</Text>
      <Text style={[t.body, l.who !== 'caller' && { color: C.text }, l.final === false && s.partial]}>{l.text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  list: { gap: 14 },
  line: { gap: 2 },
  who: { textTransform: 'uppercase', letterSpacing: 0.6 },
  partial: { opacity: 0.6 },
});
