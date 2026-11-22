import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { api, ApiError } from '@/lib/api';
import { C, F } from '@/theme';

// Away screen (server/pc-away.ts): the PC goes black when this phone leaves the room and comes back when it returns.
// Typing the passcode on the PC's keyboard unlocks it. The live signal helps check that the PC can see the phone.
type Away = {
  settings: { enabled: boolean; near: number; awaySeconds: number };
  state: 'unknown' | 'near' | 'away'; rssi: number | null; seenAgo: number | null; locked: boolean;
};
const tap = () => { if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {}); };

function line(a: Away) {
  const sig = a.rssi != null ? `${a.rssi} dBm` : 'not in range';
  if (a.locked) return `PC is black · phone ${sig}`;
  if (a.state === 'near') return `Phone is near · ${sig}`;
  if (a.state === 'away') return `Phone is away · ${sig}`;
  return `Waiting to see this phone near the PC · ${sig}`;
}

export function AwayCard({ open }: { open: boolean }) {
  const [a, setA] = useState<Away | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!open) return;
    let live = true;
    const load = () => api<Away>('/pc/away').then((x) => { if (live) setA(x); }).catch(() => {});
    const first = setTimeout(load, 0);
    const id = setInterval(load, 3000);
    return () => { live = false; clearTimeout(first); clearInterval(id); };
  }, [open]);

  const post = async (body: object) => {
    try { setA(await api<Away>('/pc/away', { method: 'POST', body })); setErr(''); }
    catch (e) { setErr(e instanceof ApiError ? e.message : "Couldn't reach your PC."); }
  };

  return (
    <View style={s.card}>
      <View style={s.row}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={s.title}>Black screen when I leave</Text>
          <Text style={s.sub}>{a ? line(a) : 'Checking…'}</Text>
        </View>
        <Switch value={a?.settings.enabled ?? false} disabled={!a} onValueChange={(v) => { tap(); post({ enabled: v }); }}
          trackColor={{ true: '#3DDC97' }} />
      </View>
      <Text style={s.hint}>Type your passcode on the PC to unlock it. Your phone can still use the PC while it is black.</Text>
      <Pressable accessibilityRole="button" onPress={() => { tap(); post({ lockNow: true }); }} style={s.chip}>
        <Text style={s.chipText}>Black out now</Text>
      </Pressable>
      {err ? <Text style={[s.hint, { color: C.danger }]}>{err}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: { gap: 10, padding: 14, borderRadius: 20, borderCurve: 'continuous', backgroundColor: 'rgba(255,255,255,0.06)' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontFamily: F.semibold, fontSize: 15, lineHeight: 20, color: C.text },
  sub: { fontFamily: F.regular, fontSize: 13, lineHeight: 18, color: C.muted },
  hint: { fontFamily: F.regular, fontSize: 12, lineHeight: 16, color: C.faint },
  chip: { alignSelf: 'flex-start', paddingHorizontal: 14, height: 34, borderRadius: 17, justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.1)' },
  chipText: { fontFamily: F.semibold, fontSize: 13, lineHeight: 18, color: C.text },
});
