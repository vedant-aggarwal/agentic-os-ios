import { requireOptionalNativeModule } from 'expo';
import type { ReactNode } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { C } from '@/theme';
import { Avatar as Face, CheckRing, Icon, Press, SURF, t, tint, useAspect } from '@/aspects/kit';
import { firstName, initial, type Person, type Stage } from './data';

type Clip = typeof import('expo-clipboard');
type Picker = typeof import('expo-image-picker');
/* eslint-disable @typescript-eslint/no-require-imports */
const clip: Clip | null = requireOptionalNativeModule('ExpoClipboard') ? require('expo-clipboard') : null;
// the web preview has a picker of its own; the phone needs the native module, which the current build includes
const picker: Picker | null = requireOptionalNativeModule('ExponentImagePicker') || Platform.OS === 'web' ? require('expo-image-picker') : null;
/* eslint-enable @typescript-eslint/no-require-imports */

/** Put a line on the clipboard. False when there is no clipboard to reach. */
export async function copy(text: string): Promise<boolean> {
  try {
    if (clip) { await clip.setStringAsync(text); return true; }
    if (typeof navigator !== 'undefined' && navigator.clipboard) { await navigator.clipboard.writeText(text); return true; }
  } catch {}
  return false;
}

/** One photo from the library, or null when he backs out (or there is no picker on this build). */
export async function pickPhoto(): Promise<{ uri: string; type: string } | null> {
  if (!picker) return null;
  const r = await picker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7, exif: false, allowsEditing: false });
  if (r.canceled || !r.assets?.[0]) return null;
  const a = r.assets[0];
  return { uri: a.uri, type: a.mimeType ?? 'image/jpeg' };
}
export const canPickPhoto = !!picker;

/** A person's initials in a circle. Friends carry the page's colour; people he is getting to know stay neutral. */
export function Avatar({ person, stage, size = 40, ring }: { person: Person; stage: Stage; size?: number; ring?: string }) {
  const face = <Face name={person.name || initial(person)} size={size} color={stage === 'friend' ? undefined : C.textSoft} />;
  if (!ring) return face;
  return <View style={[s.ring, { borderRadius: size / 2 + 2, borderColor: ring }]}>{face}</View>;
}

/** A whole row that ticks: an idea done, a step ready. */
export function CheckRow({ title, sub, done, onPress, label }: { title: string; sub?: string | null; done: boolean; onPress: () => void; label?: string }) {
  return (
    <Press label={label ?? `${title}. ${done ? 'Done, tap to undo' : 'Tap when done'}`} onPress={onPress} role="checkbox" state={{ checked: done }}
      feel={done ? 'light' : 'medium'} style={s.check} scale={0.99}>
      <CheckRing done={done} />
      <View style={s.checkText}>
        <Text numberOfLines={2} style={[t.callout, done && { color: C.muted }]}>{title}</Text>
        {sub ? <Text numberOfLines={2} style={t.footnote}>{sub}</Text> : null}
      </View>
    </Press>
  );
}

/** A row's small round icon. */
export function Ico({ children }: { children: ReactNode }) {
  return <View style={s.ico}>{children}</View>;
}

const STOPS: { key: Stage; label: string }[] = [
  { key: 'met', label: 'Met' },
  { key: 'again', label: 'Met again' },
  { key: 'friend', label: 'Friends' },
];

/**
 * The path every new person walks: met, met again, friend. Each person sits at the stop they have reached, so
 * "is my circle growing?" reads as people moving right. A person's own tap opens them; a stop's label opens the list.
 */
export function PathTrack({ groups, onPerson, onAdd, onStop }: {
  groups: Record<Stage, Person[]>; onPerson: (p: Person) => void; onAdd: () => void; onStop?: (stage: Stage) => void;
}) {
  const { color } = useAspect();
  return (
    <View style={s.track} accessibilityRole="summary"
      accessibilityLabel={STOPS.map((x) => `${x.label}: ${groups[x.key].length ? groups[x.key].map(firstName).join(', ') : 'nobody yet'}`).join('. ')}>
      <View style={s.line} />
      {STOPS.map((stop) => {
        const list = groups[stop.key];
        const shown = list.slice(0, list.length > 3 ? 2 : 3);
        const more = list.length - shown.length;
        const friend = stop.key === 'friend';
        return (
          <View key={stop.key} style={s.stop}>
            <View style={s.cluster}>
              {shown.map((p, i) => (
                <Press key={p.id} label={`${p.name}, ${stop.label.toLowerCase()}`} onPress={() => onPerson(p)} scale={0.92} hitSlop={2}
                  wrap={i ? s.overlap : undefined}>
                  <Avatar person={p} stage={stop.key} size={36} ring={C.scene} />
                </Press>
              ))}
              {more > 0 && onStop ? (
                <Press label={`${more} more, ${stop.label.toLowerCase()}`} onPress={() => onStop(stop.key)} scale={0.92} wrap={s.overlap}>
                  <View style={s.more}><Text style={[t.footnote, t.num, { color: C.textSoft }]}>{`+${more}`}</Text></View>
                </Press>
              ) : more > 0 ? (
                <View style={[s.more, s.overlap]} accessibilityLabel={`${more} more`}><Text style={[t.footnote, t.num, { color: C.textSoft }]}>{`+${more}`}</Text></View>
              ) : null}
              {!list.length && stop.key === 'met' ? (
                <Press label="Add someone you just met" onPress={onAdd} scale={0.92}>
                  <View style={s.add}><Svg width={36} height={36} style={StyleSheet.absoluteFill}>
                    <Circle cx={18} cy={18} r={17} stroke={tint(color, 0.6)} strokeWidth={1.25} strokeDasharray="3 4" fill="none" />
                  </Svg><Icon name="plus" size={16} color={color} /></View>
                </Press>
              ) : null}
              {!list.length && stop.key !== 'met' ? (
                <View style={s.add}><Svg width={36} height={36} style={StyleSheet.absoluteFill}>
                  <Circle cx={18} cy={18} r={17} stroke={SURF.line} strokeWidth={1.25} strokeDasharray="3 4" fill="none" />
                </Svg></View>
              ) : null}
            </View>
            <View style={[s.node, friend ? { backgroundColor: color, borderColor: color } : null]} />
            {onStop ? (
              <Press label={`${stop.label}, see everyone`} onPress={() => onStop(stop.key)} feel="tick" hitSlop={8} style={s.stopLabel}>
                <Text numberOfLines={1} style={[t.footnote, friend && { color: C.textSoft }]}>{stop.label}</Text>
              </Press>
            ) : (
              <View style={s.stopLabel}><Text numberOfLines={1} style={[t.footnote, friend && { color: C.textSoft }]}>{stop.label}</Text></View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  ring: { borderWidth: 2 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 16, paddingVertical: 10 },
  checkText: { flex: 1, minWidth: 0, gap: 2 },
  ico: { width: 36, height: 36, borderRadius: 18, backgroundColor: SURF.raised, alignItems: 'center', justifyContent: 'center' },
  track: { flexDirection: 'row', paddingTop: 4 },
  // the rail runs between the first and last node (the centres of the outer thirds)
  line: { position: 'absolute', left: '16.67%', right: '16.67%', top: 4 + 40 + 12 + 4, height: 1, backgroundColor: SURF.line },
  stop: { flex: 1, alignItems: 'center' },
  cluster: { height: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  overlap: { marginLeft: -8 },
  more: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: C.scene, backgroundColor: SURF.raised, alignItems: 'center', justifyContent: 'center' },
  add: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  node: { marginTop: 12, width: 9, height: 9, borderRadius: 5, backgroundColor: C.scene, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.32)' },
  stopLabel: { minHeight: 32, justifyContent: 'center', paddingHorizontal: 4 },
});
