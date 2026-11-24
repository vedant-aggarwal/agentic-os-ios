import { type ReactNode, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut, Keyframe } from 'react-native-reanimated';
import { Glass } from '@/components/Glass';
import { Sym } from '@/components/Sym';
import { C, F } from '@/theme';
import type { JobFull } from '../types';
import { ENGINE } from './model';
import { BAR_GAP, BAR_H } from './Header';
import { IcBack, IcChevron, Press } from './ui';

// The thread's menu (grows from the menu button) and the confirm card for things that can't be undone from the phone.

const EASE = Easing.bezier(0.23, 1, 0.32, 1);
const menuIn = new Keyframe({
  0: { opacity: 0, transform: [{ scale: 0.94 }] },
  100: { opacity: 1, transform: [{ scale: 1 }], easing: EASE },
}).duration(200);
const cardIn = new Keyframe({
  0: { opacity: 0, transform: [{ scale: 0.96 }] },
  100: { opacity: 1, transform: [{ scale: 1 }], easing: EASE },
}).duration(200);

export type TurnChoice = { turn: number; files: number; prompt: string };

const shortPath = (p: string | null) => (p ? p.replace(/^[A-Za-z]:\\Users\\[^\\]+/, '~') : null);

function Item({ label, sub, onPress, disabled, chevron, danger }: {
  label: string; sub?: string | null; onPress: () => void; disabled?: boolean; chevron?: boolean; danger?: boolean;
}) {
  return (
    <Press haptic={false} accessibilityLabel={label} accessibilityHint={sub ?? undefined} disabled={disabled} onPress={onPress}
      style={[s.item, disabled && s.off]}>
      <View style={s.flex}>
        <Text style={[s.itemText, danger && { color: C.danger }]} numberOfLines={1}>{label}</Text>
        {sub ? <Text style={s.itemSub} numberOfLines={1}>{sub}</Text> : null}
      </View>
      {chevron ? <IcChevron size={13} color={C.faint} /> : null}
    </Press>
  );
}

export { Item as MenuItem };

/** A small menu that grows from the bar's right button, for pages other than a job's. Tap outside to close. */
export function PopMenu({ top, onClose, children }: { top: number; onClose: () => void; children: ReactNode }) {
  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)} style={StyleSheet.absoluteFill}>
        <Pressable accessibilityLabel="Close the menu" style={[StyleSheet.absoluteFill, s.scrimLight]} onPress={onClose} />
      </Animated.View>
      <Animated.View entering={menuIn} exiting={FadeOut.duration(120)} style={[s.menu, { top }]}>
        <Glass radius={20} />
        {children}
      </Animated.View>
    </View>
  );
}

/** The menu's first lines (what it is, where) and the rule under them. */
export function MenuInfo({ title, sub }: { title: string; sub?: string | null }) {
  return (
    <>
      <View style={s.info}>
        <Text style={s.infoTitle} numberOfLines={1}>{title}</Text>
        {sub ? <Text style={s.itemSub} numberOfLines={1} ellipsizeMode="head">{sub}</Text> : null}
      </View>
      <View style={s.rule} />
    </>
  );
}

export function MenuHint({ children }: { children: string }) {
  return <Text style={s.hint}>{children}</Text>;
}

export function JobMenu({ top, job, turns, hasAnswer, busy, onClose, onCopy, onRevert, onDone }: {
  top: number; job: JobFull; turns: TurnChoice[]; hasAnswer: boolean; busy: boolean;
  onClose: () => void; onCopy: () => void; onRevert: (t: TurnChoice) => void; onDone: () => void;
}) {
  const [page, setPage] = useState<'main' | 'turns'>('main');
  const where = shortPath(job.folder);
  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)} style={StyleSheet.absoluteFill}>
        <Pressable accessibilityLabel="Close the menu" style={[StyleSheet.absoluteFill, s.scrimLight]} onPress={onClose} />
      </Animated.View>
      <Animated.View entering={menuIn} exiting={FadeOut.duration(120)} style={[s.menu, { top: top + BAR_GAP + BAR_H + 8 }]}>
        <Glass radius={20} />
        {page === 'main' ? (
          <>
            <View style={s.info}>
              <Text style={s.infoTitle} numberOfLines={1}>{ENGINE[job.engine]}{job.model ? ` ${job.model}` : ''}</Text>
              {where ? <Text style={s.itemSub} numberOfLines={1} ellipsizeMode="head">{where}</Text> : null}
            </View>
            <View style={s.rule} />
            <Item label="Copy last answer" disabled={!hasAnswer} onPress={onCopy} />
            <Item label="Revert to a turn" chevron disabled={!turns.length}
              sub={!turns.length ? 'No turn changed files yet' : busy ? 'Stop the turn first' : null}
              onPress={() => setPage('turns')} />
            <Item label="Mark done" disabled={job.status === 'done'} onPress={onDone} />
          </>
        ) : (
          <>
            <Press haptic={false} accessibilityLabel="Back to the menu" onPress={() => setPage('main')} style={s.item}>
              <Sym name="chevron.left" size={13} color={C.muted} fallback={<IcBack size={13} color={C.muted} />} />
              <Text style={[s.itemText, s.flex]}>Revert to a turn</Text>
            </Press>
            <View style={s.rule} />
            {turns.map((t) => (
              <Item key={t.turn} label={`Before turn ${t.turn}`} disabled={busy}
                sub={`${t.files} ${t.files === 1 ? 'file' : 'files'}${t.prompt ? `, from "${t.prompt.replace(/\s+/g, ' ').slice(0, 60)}"` : ''}`}
                onPress={() => onRevert(t)} />
            ))}
            {busy ? <Text style={s.hint}>Stop the turn first. Files can only go back while the agent is idle.</Text> : null}
          </>
        )}
      </Animated.View>
    </View>
  );
}

/** alt: a third choice, drawn as the main button above the row. working: a line with a spinner replaces the buttons. */
export function Confirm({ title, body, action, danger, alt, working, onCancel, onConfirm }: {
  title: string; body: string; action: string; danger?: boolean; alt?: { label: string; onPress: () => void }; working?: string;
  onCancel: () => void; onConfirm: () => void;
}) {
  return (
    <View style={[StyleSheet.absoluteFill, s.center]} accessibilityViewIsModal>
      <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)} style={StyleSheet.absoluteFill}>
        <Pressable accessibilityLabel="Cancel" style={[StyleSheet.absoluteFill, s.scrim]} onPress={onCancel} />
      </Animated.View>
      <Animated.View entering={cardIn} exiting={FadeOut.duration(120)} style={s.card} accessibilityRole="alert">
        <Text style={s.cardTitle}>{title}</Text>
        <Text style={s.cardBody}>{body}</Text>
        {working ? (
          <View style={s.working} accessibilityLiveRegion="polite">
            <ActivityIndicator color={C.text} />
            <Text style={s.cardBody}>{working}</Text>
          </View>
        ) : (
          <>
            {alt ? (
              <Press accessibilityLabel={alt.label} onPress={alt.onPress} style={[s.btn, s.btnMain, { marginTop: 12 }]}>
                <Text style={[s.btnText, { color: '#0B0C10' }]}>{alt.label}</Text>
              </Press>
            ) : null}
            <View style={[s.cardRow, alt && { marginTop: 0 }]}>
              <Press accessibilityLabel="Cancel" onPress={onCancel} outer={s.flex} style={[s.btn, s.btnSoft]}><Text style={s.btnText}>Cancel</Text></Press>
              <Press accessibilityLabel={action} onPress={onConfirm} outer={s.flex} style={[s.btn, alt ? s.btnSoft : danger ? s.btnDanger : s.btnMain]}>
                <Text style={[s.btnText, !danger && !alt && { color: '#0B0C10' }]}>{action}</Text>
              </Press>
            </View>
          </>
        )}
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  scrimLight: { backgroundColor: 'rgba(0,0,0,0.25)' },
  scrim: { backgroundColor: 'rgba(0,0,0,0.5)' },
  menu: {
    position: 'absolute', right: 16, width: 280, borderRadius: 20, paddingVertical: 8, transformOrigin: 'top right',
    boxShadow: '0 16px 40px rgba(0,0,0,0.5)',
  },
  info: { paddingHorizontal: 16, paddingVertical: 8, gap: 2 },
  infoTitle: { fontFamily: F.semibold, fontSize: 14, lineHeight: 20, color: C.text },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.12)', marginVertical: 4 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingHorizontal: 16, paddingVertical: 4 },
  off: { opacity: 0.4 },
  itemText: { fontFamily: F.medium, fontSize: 16, lineHeight: 24, color: C.text },
  itemSub: { fontFamily: F.regular, fontSize: 12, lineHeight: 16, color: C.faint },
  hint: { fontFamily: F.regular, fontSize: 12, lineHeight: 16, color: C.muted, paddingHorizontal: 16, paddingVertical: 8 },
  center: { alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: {
    width: '100%', maxWidth: 360, borderRadius: 24, borderCurve: 'continuous', padding: 24, gap: 12, backgroundColor: '#1E2027',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.14)', boxShadow: '0 24px 48px rgba(0,0,0,0.5)',
  },
  cardTitle: { fontFamily: F.semibold, fontSize: 18, lineHeight: 28, color: C.text },
  cardBody: { fontFamily: F.regular, fontSize: 14, lineHeight: 20, color: C.muted },
  cardRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  working: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, marginTop: 12 },
  btn: { height: 48, borderRadius: 12, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
  btnSoft: { backgroundColor: 'rgba(255,255,255,0.08)' },
  btnMain: { backgroundColor: C.text },
  btnDanger: { backgroundColor: '#E5484D' },
  btnText: { fontFamily: F.semibold, fontSize: 16, lineHeight: 24, color: C.text },
});
