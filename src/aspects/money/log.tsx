import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { C, F } from '@/theme';
import { Chip, haptic, Icon, IconButton, Press, R, rupees, SP, SURF, t, useAspect } from '@/aspects/kit';
import { act, logAgain, logLine, useTx, type TxDoc } from './data';
import type { Home } from './types';
import { CategorySheet, ChipRow } from './ui';

/**
 * The one line log: "20 for chai" becomes a spend, the category guessed on the PC (where he filed that place last
 * time wins). His repeated spends sit under it as chips that log in one tap. The spend just logged shows its category
 * as a chip to fix in one tap, and can be undone.
 */
export function LogLine({ home, autoFocus = false }: { home: Home; autoFocus?: boolean }) {
  const a = useAspect();
  const tx = useTx();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<TxDoc | null>(null);
  const [picking, setPicking] = useState(false);
  const cats = home.spend.cats;
  const catName = (id?: string | null) => (id === 'bills' ? 'Bills' : cats.find((c) => c.id === id)?.name ?? 'Other');

  const send = async (p: ReturnType<typeof logLine>) => {
    setBusy(true);
    const r = await act(p, a.notice, "Couldn't log that");
    setBusy(false);
    if (!r) return;
    haptic.medium();
    setText('');
    setLast(r.item);
  };
  const submit = () => {
    const v = text.trim();
    if (!v || busy) return;
    if (!/\d/.test(v)) { a.notice('Start with the amount, like 20 for chai'); return; }
    void send(logLine(v));
  };
  const fix = async (category: string) => {
    if (!last) return;
    const next = { ...last, category };
    setLast(next);
    await act(tx.put(next), a.notice);
  };
  const undo = async () => {
    if (!last) return;
    const id = last.id;
    setLast(null);
    await act(tx.remove(id), a.notice, "Couldn't undo that");
  };

  return (
    <View style={s.wrap}>
      <View style={s.field}>
        <TextInput accessibilityLabel="Log a spend in one line" value={text} onChangeText={setText} placeholder="20 for chai"
          placeholderTextColor={C.faint} selectionColor={a.color} keyboardAppearance="dark" returnKeyType="done" autoFocus={autoFocus}
          onSubmitEditing={submit} blurOnSubmit={false} maxLength={120} style={s.input} />
        <IconButton label="Log it" size={36} onPress={submit} disabled={!text.trim() || busy}>
          <Icon name="arrowUp" size={16} color={text.trim() ? C.text : C.faint} />
        </IconButton>
      </View>
      {last ? (
        <View style={s.done} accessibilityLiveRegion="polite">
          <Text style={[t.small, s.doneText]} numberOfLines={2}>
            <Text style={[t.strong, t.num]}>{rupees(last.amount)}</Text>{last.merchant ? ` for ${last.merchant}` : ''}
          </Text>
          <Chip label={catName(last.category)} selected onPress={() => setPicking(true)} />
          <Press label="Undo the last spend" onPress={undo} hitSlop={12}>
            <Text style={[t.label, { color: a.color }]}>Undo</Text>
          </Press>
        </View>
      ) : null}
      {home.spend.repeats.length ? (
        <ChipRow>
          {home.spend.repeats.map((r) => (
            <Chip key={`${r.merchant}:${r.amount}`} label={`${rupees(r.amount)} ${r.merchant}`} onPress={() => { if (!busy) void send(logAgain(r)); }} />
          ))}
        </ChipRow>
      ) : null}
      <CategorySheet open={picking} onClose={() => setPicking(false)} cats={cats} value={last?.category ?? null} onPick={(id) => void fix(id)} title="What was it?" />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: SP[12] },
  field: {
    minHeight: 52, borderRadius: R.row, borderCurve: 'continuous', paddingLeft: SP[16], paddingRight: SP[8], flexDirection: 'row', alignItems: 'center', gap: SP[8],
    backgroundColor: SURF.card, borderWidth: StyleSheet.hairlineWidth, borderColor: SURF.line,
  },
  input: { flex: 1, minWidth: 0, minHeight: 24, padding: 0, fontFamily: F.regular, fontSize: 16, lineHeight: 24, color: C.text, outlineWidth: 0 },
  done: { flexDirection: 'row', alignItems: 'center', gap: SP[12] },
  doneText: { flex: 1, minWidth: 0 },
});
