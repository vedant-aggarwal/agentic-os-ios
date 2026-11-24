import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Avatar, CheckRing, Glyph, IconButton, Press, R, SURF, t, tint, useAspect } from '@/aspects/kit';
import { C, F } from '@/theme';
import { monthShort, photoSource } from './data';
import type { Cand, MomentBrief } from './types';

// Family's own small parts. Icons: an SF Symbol on the phone, the path (24 grid) on the web preview.
export const GLYPH = {
  swap: ['arrow.triangle.2.circlepath', 'M4.5 10a8 8 0 0 1 14-3.5M19.5 14a8 8 0 0 1-14 3.5M19 3v4h-4M5 21v-4h4'],
  gift: ['gift', 'M4 11h16v9H4zM3 7h18v4H3zM12 7v13M12 7C10.5 4 7 4 7 6s3 1 5 1zM12 7c1.5-3 5-3 5-1s-3 1-5 1z'],
  quote: ['quote.bubble', 'M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8l-4 3v-3H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z'],
  personPlus: ['person.badge.plus', 'M10 11a4 4 0 1 0 0-8a4 4 0 0 0 0 8zM3 21a7 7 0 0 1 14 0M19 8v6M16 11h6'],
  photo: ['photo', 'M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM3 16l5-5 4 4 3-3 6 6M15.5 9.5h.01'],
  line: ['text.alignleft', 'M5 7h14M5 12h14M5 17h9'],
  sparkle: ['sparkles', 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z'],
  heart: ['heart', 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z'],
} as const;
export function G({ name, size = 18, color = C.text }: { name: keyof typeof GLYPH; size?: number; color?: string }) {
  const [sf, d] = GLYPH[name];
  return <Glyph sf={sf as never} d={d} size={size} color={color} />;
}

/** A person: their latest photo with you, else their initial on the page's colour. */
export function Face({ name, photo, size = 44 }: { name: string; photo?: string | null; size?: number }) {
  return <Avatar name={name} size={size} source={photo ? photoSource(photo) : null} />;
}
/** Older name for a face without a photo. */
export const Monogram = ({ name, size = 44 }: { name: string; size?: number }) => <Face name={name} size={size} />;

/** A tick on its own, beside a row that opens something else: 44 points to tap. */
export function CheckButton({ done, label, onPress }: { done: boolean; label: string; onPress: () => void }) {
  return (
    <Press label={label} onPress={onPress} role="checkbox" state={{ checked: done }} feel={done ? 'light' : 'medium'} hitSlop={4} style={s.checkBtn} scale={0.9}>
      <CheckRing done={done} size={28} />
    </Press>
  );
}

/** A whole row that ticks: a step to get ready, a thing they mentioned. */
export function CheckRow({ title, sub, done, onPress, onLongPress, label }: {
  title: string; sub?: string | null; done: boolean; onPress: () => void; onLongPress?: () => void; label?: string;
}) {
  return (
    <Press label={label ?? `${title}. ${done ? 'Done, tap to undo' : 'Tap when done'}`} onPress={onPress} onLongPress={onLongPress} role="checkbox" state={{ checked: done }}
      feel={done ? 'light' : 'medium'} style={s.checkRow} scale={0.99}>
      <CheckRing done={done} />
      <View style={s.thingText}>
        <Text numberOfLines={2} style={[t.callout, done && { color: C.muted }]}>{title}</Text>
        {sub ? <Text numberOfLines={2} style={t.footnote}>{sub}</Text> : null}
      </View>
    </Press>
  );
}

/** A memory photo kept on the PC. */
export function Photo({ id, style, thumb = true, label }: { id: string; style?: StyleProp<ViewStyle>; thumb?: boolean; label?: string }) {
  return (
    <View style={[s.photoBox, style]}>
      <Image source={photoSource(id, thumb)} style={StyleSheet.absoluteFill} contentFit="cover" transition={160}
        accessibilityLabel={label ?? 'Photo'} accessibilityIgnoresInvertColors />
    </View>
  );
}

/** A day as a small calendar leaf: the date, the month under it. */
export function DateTile({ day, live = false }: { day: string; live?: boolean }) {
  const { color } = useAspect();
  return (
    <View style={[s.tile, live && { backgroundColor: tint(color, 0.14) }]} accessibilityElementsHidden importantForAccessibility="no">
      <Text style={[t.headline, t.num, s.tileDay, live && { color }]}>{Number(day.slice(8, 10))}</Text>
      <Text style={[t.micro, s.tileMonth]}>{monthShort(day)}</Text>
    </View>
  );
}

/**
 * This week's one small thing: a tick, the thing, and a swap. Done, it stays in full colour (a moment, not a chore
 * crossed off) and the line under it says so.
 */
export function ThingRow({ pick, done, onToggle, onSwap, sub }: {
  pick: Cand | null; done: { title: string | null } | null; onToggle: () => void; onSwap?: () => void; sub?: string | null;
}) {
  const { color } = useAspect();
  if (!pick && !done) return null;
  const title = done ? done.title ?? pick?.done_title ?? '' : pick!.title;
  return (
    <View style={s.thing}>
      <Press label={done ? `Done: ${title}. Tap to undo` : `Mark done: ${title}`} onPress={onToggle} feel={done ? 'light' : 'medium'}
        role="checkbox" state={{ checked: !!done }} wrap={s.thingHit} style={s.thingPress} scale={0.98}>
        <CheckRing done={!!done} />
        <View style={s.thingText}>
          <Text numberOfLines={2} style={t.callout}>{title}</Text>
          {done ? <Text style={[t.footnote, { color }]}>Done this week</Text> : sub ? <Text numberOfLines={2} style={t.footnote}>{sub}</Text> : null}
        </View>
      </Press>
      {!done && onSwap ? (
        <IconButton label="Another idea" onPress={onSwap} size={40} plain><G name="swap" size={18} color={C.muted} /></IconButton>
      ) : null}
    </View>
  );
}

/** Where a suggestion came from, in a few words, under it. */
/** Where an idea came from. Short on the home card; Nora's reason in full on the person's screen. */
export function whyOf(c: Cand | null, short = false): string | null {
  if (!c) return null;
  if (c.from === 'nora') return c.why && !short ? c.why : 'An idea from Nora';
  if (c.from === 'idea') return 'One of your ideas';
  if (c.from === 'rhythm') return 'Your usual';
  if (c.from === 'own') return 'Your own';
  return null;
}

/** A memory in a strip: the photo, or the line on a quiet card, with its day under it. */
export function MemoryTile({ m, width, onPress, caption }: { m: MomentBrief; width: number; onPress: () => void; caption: string }) {
  const h = Math.round(width * 1.25);
  const label = `${m.note ?? m.title ?? 'A memory'}, ${caption}`;
  return (
    <Press label={label} onPress={onPress} wrap={{ width }} style={s.memTile} scale={0.97}>
      {m.photo ? <Photo id={m.photo} style={{ width, height: h, borderRadius: R.row }} /> : (
        <View style={[s.memText, { width, height: h }]}>
          <Text numberOfLines={6} style={[t.subhead, { color: C.textSoft }]}>{m.note ?? m.title}</Text>
        </View>
      )}
      <View style={s.memCap}>
        {m.photo && (m.note || m.title) ? <Text numberOfLines={2} style={[t.footnote, { color: C.textSoft }]}>{m.note ?? m.title}</Text> : null}
        <Text numberOfLines={1} style={t.micro}>{caption}</Text>
      </View>
    </Press>
  );
}

/** A quiet line with an icon that does one thing ("Add a photo"). */
export function LinkRow({ icon, label, onPress, color }: { icon: ReactNode; label: string; onPress: () => void; color?: string }) {
  return (
    <Press label={label} onPress={onPress} style={s.link} hitSlop={4}>
      {icon}
      <Text style={[t.subhead, color ? { color } : { color: C.textSoft }]}>{label}</Text>
    </Press>
  );
}

const s = StyleSheet.create({
  checkBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 16, paddingVertical: 10 },
  photoBox: { overflow: 'hidden', backgroundColor: SURF.card },
  tile: { width: 44, height: 48, borderRadius: R.chip, borderCurve: 'continuous', backgroundColor: SURF.raised, alignItems: 'center', justifyContent: 'center' },
  tileDay: { fontSize: 18, lineHeight: 20, fontFamily: F.semibold },
  tileMonth: { color: C.muted },
  thing: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  thingHit: { flex: 1 },
  thingPress: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 8 },
  thingText: { flex: 1, minWidth: 0, gap: 2 },
  memTile: { gap: 8 },
  memText: { borderRadius: R.tile, borderCurve: 'continuous', backgroundColor: SURF.group, padding: 16, justifyContent: 'flex-end', borderWidth: StyleSheet.hairlineWidth, borderColor: SURF.hair },
  memCap: { gap: 2 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
});
