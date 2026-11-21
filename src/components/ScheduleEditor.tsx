import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Press } from './Press';
import { act, clock, type Channel } from '@/lib/api';
import { C, F } from '@/theme';

export const ZONES = [
  { id: 'America/New_York', short: 'ET', name: 'US East' },
  { id: 'America/Chicago', short: 'CT', name: 'US Central' },
  { id: 'America/Los_Angeles', short: 'PT', name: 'US West' },
  { id: 'Europe/London', short: 'UK', name: 'London' },
  { id: 'Asia/Kolkata', short: 'IST', name: 'India' },
];
export const zoneShort = (tz?: string) => ZONES.find((z) => z.id === tz)?.short || tz || '';
export const timeLabel = (t: string) => clock(Number(t.slice(0, 2)), Number(t.slice(3, 5)));

// Every half hour from 6 am to 11:30 pm.
const TIMES = Array.from({ length: 36 }, (_, i) => {
  const m = 360 + i * 30;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${m % 60 ? '30' : '00'}`;
});

/** Pick a channel's daily posting times and the time zone they are in. Saved on the PC (app/data). */
export function ScheduleEditor({ ch, onClose, onSaved }: { ch: Channel; onClose: () => void; onSaved: () => void }) {
  const insets = useSafeAreaInsets();
  const [tz, setTz] = useState(ch.slots?.timezone && ZONES.some((z) => z.id === ch.slots?.timezone) ? ch.slots.timezone : 'Asia/Kolkata');
  const [times, setTimes] = useState<string[]>([...(ch.slots?.times || [])]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (t: string) => setTimes((x) => (x.includes(t) ? x.filter((y) => y !== t) : x.length >= 6 ? x : [...x, t].sort()));
  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await act('schedule.set', { channelId: ch.id, times, timezone: tz });
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={styles.head}>
          <Press style={styles.btn} onPress={onClose} accessibilityLabel="Cancel">
            <Text style={styles.btnText}>Cancel</Text>
          </Press>
          <Text style={styles.title}>Posting schedule</Text>
          <Press style={[styles.btn, styles.save]} onPress={save} disabled={saving} accessibilityLabel="Save schedule">
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={[styles.btnText, { color: '#fff' }]}>Save</Text>}
          </Press>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }}>
          <Text style={styles.label}>Time zone of the audience</Text>
          <View style={styles.wrap}>
            {ZONES.map((z) => (
              <Press key={z.id} style={[styles.chip, tz === z.id && styles.chipOn]} scale={0.95} onPress={() => setTz(z.id)} accessibilityRole="radio" accessibilityState={{ selected: tz === z.id }} accessibilityLabel={z.name}>
                <Text style={[styles.chipText, tz === z.id && { color: '#fff' }]}>{z.name}</Text>
              </Press>
            ))}
          </View>
          <Text style={[styles.label, { marginTop: 12 }]}>
            Posts a day: {times.length || 'none'}
            {times.length ? `  ·  ${times.map(timeLabel).join(', ')} ${zoneShort(tz)}` : ''}
          </Text>
          <View style={styles.wrap}>
            {TIMES.map((t) => {
              const on = times.includes(t);
              return (
                <Press key={t} style={[styles.time, on && styles.chipOn]} scale={0.95} onPress={() => toggle(t)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={timeLabel(t)}>
                  <Text style={[styles.chipText, on && { color: '#fff' }]}>{timeLabel(t)}</Text>
                </Press>
              );
            })}
          </View>
          <Text style={styles.hint}>Tap the times to post each day, up to six. Clear them all and save to remove the schedule.</Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(20,20,20,0.4)' },
  sheet: { maxHeight: '86%', backgroundColor: C.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 14 },
  title: { flex: 1, textAlign: 'center', fontFamily: F.b, fontSize: 17, color: C.ink },
  btn: { height: 36, minWidth: 64, paddingHorizontal: 14, borderRadius: 18, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  save: { backgroundColor: C.ink },
  btnText: { fontFamily: F.s, fontSize: 14, color: C.ink },
  label: { fontFamily: F.s, fontSize: 14, lineHeight: 20, color: C.ink },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: C.card, justifyContent: 'center' },
  time: { width: '22.5%', height: 38, borderRadius: 12, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: C.ink },
  chipText: { fontFamily: F.s, fontSize: 13, color: C.ink },
  hint: { marginTop: 8, fontFamily: F.r, fontSize: 13, lineHeight: 18, color: C.muted },
  error: { marginTop: 8, fontFamily: F.m, fontSize: 14, color: '#B4232F' },
});
