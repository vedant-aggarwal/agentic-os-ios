import { memo, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, {
  cancelAnimation, Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming, ZoomIn,
} from 'react-native-reanimated';
import { Linked } from '@/components/Linked';
import { Sym } from '@/components/Sym';
import { C, F } from '@/theme';
import type { Engine, PermOption } from '../types';
import { Markdown } from './Markdown';
import { currentStep, ENGINE, type Ev, formOf, type Row, sameSig, type Step, stepsSummary } from './model';
import { ADD, ATTN, DEL, IcCheck, IcChevron, IcClose, LIVE, MONO, Press, useNow } from './ui';

// The thread's rows. Each is memoized on its row object, which model.ts keeps stable while its events don't change.

type R<K extends Row['kind']> = Extract<Row, { kind: K }>;

/** memo() comparer: the row's events and flags, plus any other props by reference. */
function same<P extends { row: Row }>(a: P, b: P) {
  if (!sameSig(a.row.sig, b.row.sig)) return false;
  for (const k in a) if (k !== 'row' && a[k] !== b[k]) return false;
  return true;
}

/** A breathing dot: an agent is working right now. A still dot under Reduced Motion. */
export function Pulse({ color = LIVE, size = 8 }: { color?: string; size?: number }) {
  const t = useSharedValue(0);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (reduce) return;
    t.set(withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, true));
    return () => cancelAnimation(t);
  }, [t, reduce]);
  const st = useAnimatedStyle(() => ({ opacity: 0.45 + 0.55 * (1 - t.value), transform: [{ scale: 1 + 0.3 * t.value }] }));
  return <Animated.View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }, st]} />;
}

// ---- his message ----
export const UserRow = memo(function UserRow({ row }: { row: R<'user'> }) {
  const { shown } = row;
  return (
    <View style={s.userWrap}>
      {shown.text ? <View style={s.user}><Text selectable style={s.userText}><Linked text={shown.text} /></Text></View> : null}
      {shown.tasks.map((t, i) => <Text key={i} style={s.from} numberOfLines={2}><Text style={s.fromLabel}>Task </Text>{t}</Text>)}
      {shown.idea ? <Text style={s.from} numberOfLines={2}><Text style={s.fromLabel}>Idea </Text>{shown.idea}</Text> : null}
    </View>
  );
}, same);

// ---- the answer ----
export const TextRow = memo(function TextRow({ row }: { row: R<'text'> }) {
  return <View style={s.answer}><Markdown text={row.ev.text} /></View>;
}, same);

// ---- tool steps, one group per turn ----
function ToolIcon({ status }: { status: Ev<'tool'>['status'] }) {
  if (status === 'in_progress') return <View style={s.stepIcon}><ActivityIndicator size="small" color={LIVE} style={s.spinner} /></View>;
  if (status === 'pending') return <View style={s.stepIcon}><View style={s.ring} /></View>;
  if (status === 'failed') return <View style={s.stepIcon}><Sym name="xmark" size={12} color={DEL} fallback={<IcClose size={12} color={DEL} />} /></View>;
  return <View style={s.stepIcon}><Sym name="checkmark" size={12} color={C.faint} fallback={<IcCheck size={12} color={C.faint} />} /></View>;
}

const OUT_LINES = 30;
function Output({ text }: { text: string }) {
  const [all, setAll] = useState(false);
  const lines = text.replace(/\s+$/, '').split('\n');
  const cut = !all && lines.length > OUT_LINES;
  const shown = cut ? lines.slice(-OUT_LINES).join('\n') : lines.join('\n');
  return (
    <View style={s.out}>
      {cut ? (
        <Press haptic={false} accessibilityLabel={`Show all ${lines.length} lines`} onPress={() => setAll(true)} style={s.outMore}>
          <Text style={s.outMoreText}>Show all {lines.length} lines</Text>
        </Press>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} alwaysBounceHorizontal={false}>
        <Text selectable style={s.outText}>{shown || 'No output'}</Text>
      </ScrollView>
    </View>
  );
}

function StepItem({ step, open, onToggle }: { step: Step; open: boolean; onToggle: () => void }) {
  if (step.type !== 'tool') {
    if (step.type === 'assistant') return <View style={s.narration}><Markdown text={step.text} tone="soft" /></View>;
    return (
      <Press haptic={false} accessibilityLabel={open ? 'Hide the thought' : 'Show the thought'} onPress={onToggle} style={s.step}>
        <View style={s.stepIcon}><View style={s.thoughtDot} /></View>
        <View style={s.stepBody}>
          <Text style={s.thoughtLabel}>Thinking</Text>
          <Text style={s.thoughtText} numberOfLines={open ? undefined : 2}>{step.text}</Text>
        </View>
      </Press>
    );
  }
  const has = !!step.output?.trim();
  return (
    <View>
      <Press haptic={false} disabled={!has} accessibilityLabel={step.title} accessibilityHint={has ? (open ? 'Hides the output' : 'Shows the output') : undefined}
        onPress={onToggle} style={s.step}>
        <ToolIcon status={step.status} />
        <Text style={[s.stepTitle, step.status === 'failed' && { color: DEL }]} numberOfLines={open ? undefined : 2}>{step.title}</Text>
        {has ? <View style={[s.stepChevron, open && s.chevronOpen]}><IcChevron size={12} color={C.faint} /></View> : null}
      </Press>
      {open && has ? <Output text={step.output!} /> : null}
    </View>
  );
}

export const StepsRow = memo(function StepsRow({ row, open, onToggle }: { row: R<'steps'>; open: boolean; onToggle: (key: string) => void }) {
  const now = useNow(row.live, 1000);
  const [shown, setShown] = useState<Set<string>>(() => new Set());
  const failed = row.steps.filter((x) => x.type === 'tool' && x.status === 'failed').length;
  const step = row.live ? currentStep(row.steps) : null;
  const summary = stepsSummary(row.steps, now, row.live);
  const toggleStep = (k: string) => setShown((set) => { const n = new Set(set); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  return (
    <View style={s.group}>
      <Press haptic={false} accessibilityLabel={`${ENGINE[row.engine]}, ${summary}`} accessibilityState={{ expanded: open }}
        onPress={() => onToggle(row.key)} style={s.groupHead}>
        <View style={s.stepIcon}>
          {row.live ? <Pulse /> : <Sym name="checkmark.circle" size={14} color={C.faint} fallback={<IcCheck size={13} color={C.faint} />} />}
        </View>
        <View style={s.stepBody}>
          <Text style={s.groupLine} numberOfLines={1}>
            <Text style={s.groupWho}>{ENGINE[row.engine]}</Text>
            <Text>{'  '}{summary}</Text>
            {failed ? <Text style={{ color: DEL }}>{'  '}{failed} failed</Text> : null}
          </Text>
          {step ? <Text style={s.groupNow} numberOfLines={1}>{step}</Text> : null}
        </View>
        <View style={[s.stepChevron, open && s.chevronOpen]}><IcChevron size={14} color={C.muted} /></View>
      </Press>
      {open ? (
        <View style={s.steps}>
          {row.steps.map((x) => {
            const k = x.type === 'tool' ? x.id || String(x.seq) : String(x.seq);
            return <StepItem key={`${x.type}${x.seq}`} step={x} open={shown.has(k)} onToggle={() => toggleStep(k)} />;
          })}
        </View>
      ) : null}
    </View>
  );
}, same);

// ---- plan ----
export const PlanRow = memo(function PlanRow({ row }: { row: R<'plan'> }) {
  const { entries } = row.ev;
  const done = entries.filter((e) => e.status === 'completed').length;
  return (
    <View style={s.card}>
      <View style={s.cardHead}>
        <Text style={s.cardTitle}>Plan</Text>
        <Text style={s.cardMeta}>{done} of {entries.length} done</Text>
      </View>
      <View style={s.planList}>
        {entries.map((e, i) => (
          <View key={i} style={s.planItem} accessibilityLabel={`${e.content}, ${e.status === 'completed' ? 'done' : e.status === 'in_progress' ? 'in progress' : 'not started'}`}>
            <View style={s.box}>
              {e.status === 'completed' ? (
                <Animated.View key="done" entering={ZoomIn.duration(200)} style={s.boxDone}><IcCheck size={11} color="#0B0C10" /></Animated.View>
              ) : e.status === 'in_progress' ? (
                <View style={[s.boxRing, { borderColor: LIVE }]}>{row.live ? <Pulse size={6} /> : null}</View>
              ) : <View style={s.boxRing} />}
            </View>
            <Text style={[s.planText, e.status === 'completed' && s.planDone, e.status === 'in_progress' && s.planNow]}><Linked text={e.content} /></Text>
          </View>
        ))}
      </View>
    </View>
  );
}, same);

// ---- permission ----
const WANTS: Record<string, string> = {
  execute: 'wants to run a command', command: 'wants to run a command', edit: 'wants to edit a file', delete: 'wants to delete a file',
  move: 'wants to move a file', read: 'wants to read a file', fetch: 'wants to open a link', search: 'wants to search',
  switch_mode: 'wants to change mode', plan: 'wants you to approve its plan',
};
const isAllow = (o: PermOption) => o.kind.startsWith('allow');
export type Answer = (requestId: string, optionId: string, answers?: Record<string, string>) => void;

export const PermissionRow = memo(function PermissionRow({ row, engine, busy, onAnswer }: {
  row: R<'permission'>; engine: Engine; busy: string | null; onAnswer: Answer;
}) {
  const { ev } = row;
  if (ev.kind === 'question') return <QuestionCard ev={ev} engine={engine} busy={busy} onAnswer={onAnswer} />;
  const deny = ev.options.find((o) => o.kind === 'reject_once') ?? ev.options.find((o) => !isAllow(o));
  const allow = ev.options.find((o) => o.kind === 'allow_once') ?? ev.options.find(isAllow);
  const extra = ev.options.filter((o) => o !== deny && o !== allow);
  const button = (o: PermOption, primary: boolean) => {
    const mine = busy === o.optionId;
    return (
      <Press key={o.optionId} disabled={!!busy} accessibilityLabel={o.name} onPress={() => onAnswer(ev.requestId, o.optionId)}
        style={[s.permBtn, primary ? s.permAllow : isAllow(o) ? s.permSoft : s.permDeny, !!busy && !mine && { opacity: 0.5 }]}>
        {mine ? <ActivityIndicator size="small" color={primary ? '#0B0C10' : C.text} />
          : <Text style={[s.permBtnText, primary && { color: '#0B0C10' }]} numberOfLines={1}>{o.name}</Text>}
      </Press>
    );
  };
  return (
    <View style={s.perm} accessibilityRole="alert">
      <Text style={s.permWho}>{ENGINE[engine]} {WANTS[ev.kind] ?? 'is asking'}</Text>
      <Text selectable style={ev.kind === 'execute' || ev.kind === 'command' ? s.permCmd : s.permTitle}>{ev.title}</Text>
      <View style={s.permRow}>
        {deny ? <View style={s.flex}>{button(deny, false)}</View> : null}
        {allow ? <View style={s.flex}>{button(allow, true)}</View> : null}
      </View>
      {extra.map((o) => button(o, false))}
    </View>
  );
}, same);

/**
 * The agent's questions (Claude's AskUserQuestion, Codex's request for input), answered right here: tap an option
 * (several when the question allows it) or type your own answer. The answers go back keyed by question; Skip lets the
 * agent carry on with its own judgement. A form page (ask_form) can't be drawn here, so it offers Skip only.
 */
function QuestionCard({ ev, engine, busy, onAnswer }: { ev: Ev<'permission'>; engine: Engine; busy: string | null; onAnswer: Answer }) {
  const form = formOf(ev);
  const [picks, setPicks] = useState<Record<number, string[]>>({});
  const [other, setOther] = useState<Record<number, string>>({});
  const submit = ev.options.find((o) => o.optionId === 'submit') ?? ev.options.find(isAllow);
  const skip = ev.options.find((o) => o.optionId === 'skip') ?? ev.options.find((o) => !isAllow(o));

  const answerOf = (i: number) => [...(picks[i] ?? []), (other[i] ?? '').trim()].filter(Boolean).join(', ');
  const answers: Record<string, string> = {};
  form.forEach((q, i) => { const a = answerOf(i); if (a) answers[q.question] = a; });
  const ready = Object.keys(answers).length > 0;

  const pick = (i: number, label: string, multi: boolean) => setPicks((p) => {
    const cur = p[i] ?? [];
    const on = cur.includes(label);
    return { ...p, [i]: multi ? (on ? cur.filter((x) => x !== label) : [...cur, label]) : on ? [] : [label] };
  });
  const btn = (o: PermOption, primary: boolean, disabled: boolean, onPress: () => void) => {
    const mine = busy === o.optionId;
    return (
      <Press key={o.optionId} disabled={!!busy || disabled} accessibilityLabel={o.name} accessibilityState={{ disabled: !!busy || disabled }} onPress={onPress}
        style={[s.permBtn, primary ? s.permAllow : s.permSoft, (disabled || (!!busy && !mine)) && { opacity: 0.4 }]}>
        {mine ? <ActivityIndicator size="small" color={primary ? '#0B0C10' : C.text} />
          : <Text style={[s.permBtnText, primary && { color: '#0B0C10' }]} numberOfLines={1}>{o.name}</Text>}
      </Press>
    );
  };

  return (
    <View style={s.perm} accessibilityRole="alert">
      <Text style={s.permWho}>{ENGINE[engine]} {form.length > 1 ? `has ${form.length} questions` : 'has a question'}</Text>
      {!form.length ? (
        <>
          <Text selectable style={s.permTitle}>{ev.title}</Text>
          <Text style={s.qNote}>This is a form page, which only opens on the PC. Skip it here and {ENGINE[engine]} carries on with its own judgement.</Text>
        </>
      ) : form.map((q, i) => (
        <View key={`${i}:${q.question}`} style={s.qBlock}>
          {q.header ? <Text style={s.qHeader}>{q.header}</Text> : null}
          <Text selectable style={s.permTitle}>{q.question}</Text>
          {q.multiSelect ? <Text style={s.qNote}>Pick any that fit.</Text> : null}
          {(q.options ?? []).map((o) => {
            const on = (picks[i] ?? []).includes(o.label);
            return (
              <Press key={o.label} haptic accessibilityRole={q.multiSelect ? 'checkbox' : 'radio'} accessibilityState={{ checked: on }}
                accessibilityLabel={o.description ? `${o.label}. ${o.description}` : o.label}
                onPress={() => pick(i, o.label, !!q.multiSelect)} style={[s.opt, on && s.optOn]}>
                <Text style={[s.optLabel, on && { color: '#0B0C10' }]}>{o.label}</Text>
                {o.description ? <Text style={[s.optDesc, on && { color: 'rgba(11,12,16,0.72)' }]}>{o.description}</Text> : null}
              </Press>
            );
          })}
          <TextInput value={other[i] ?? ''} onChangeText={(t) => setOther((x) => ({ ...x, [i]: t }))} multiline
            placeholder={q.options?.length ? 'Or type your own answer' : 'Type your answer'} placeholderTextColor={C.faint}
            keyboardAppearance="dark" style={s.qInput} accessibilityLabel={`Your answer to: ${q.question}`} />
        </View>
      ))}
      <View style={s.permRow}>
        {skip ? <View style={s.flex}>{btn(skip, false, false, () => onAnswer(ev.requestId, skip.optionId))}</View> : null}
        {submit && form.length ? <View style={s.flex}>{btn(submit, true, !ready, () => onAnswer(ev.requestId, submit.optionId, answers))}</View> : null}
      </View>
    </View>
  );
}

// ---- changes ----
const SHOW_FILES = 5;
const base = (p: string) => p.replace(/\\/g, '/').split('/').pop() ?? p;
const dir = (p: string) => { const n = p.replace(/\\/g, '/'); const i = n.lastIndexOf('/'); return i > 0 ? n.slice(0, i) : ''; };

export const ChangesRow = memo(function ChangesRow({ row, onOpen }: { row: R<'changes'>; onOpen: (turn: number, files: R<'changes'>['files'], index: number) => void }) {
  const [all, setAll] = useState(false);
  const { files } = row;
  const add = files.reduce((a, f) => a + f.add, 0), del = files.reduce((a, f) => a + f.del, 0);
  const list = all ? files : files.slice(0, SHOW_FILES);
  return (
    <View style={s.card}>
      <Press haptic={false} accessibilityLabel={`Changed ${files.length} files. Review the diff`} onPress={() => onOpen(row.turn, files, 0)} style={s.changesHead}>
        <Text style={[s.cardTitle, s.flex]}>Changed {files.length} {files.length === 1 ? 'file' : 'files'}</Text>
        <Text style={[s.count, { color: ADD }]}>+{add}</Text>
        <Text style={[s.count, { color: DEL }]}>−{del}</Text>
        <IcChevron size={14} color={C.muted} />
      </Press>
      <View style={s.files}>
        {list.map((f, i) => (
          <Press key={f.path} haptic={false} accessibilityLabel={`${f.path}, ${f.add} added, ${f.del} removed`} onPress={() => onOpen(row.turn, files, i)} style={s.fileRow}>
            <View style={s.flex}>
              <Text style={s.fileName} numberOfLines={1}>{base(f.path)}</Text>
              {dir(f.path) ? <Text style={s.fileDir} numberOfLines={1} ellipsizeMode="head">{dir(f.path)}</Text> : null}
            </View>
            <Text style={[s.count, { color: ADD }]}>+{f.add}</Text>
            <Text style={[s.count, { color: DEL }]}>−{f.del}</Text>
          </Press>
        ))}
      </View>
      {files.length > SHOW_FILES && !all ? (
        <Press haptic={false} accessibilityLabel={`Show all ${files.length} files`} onPress={() => setAll(true)} style={s.moreFiles}>
          <Text style={s.moreText}>Show all {files.length} files</Text>
        </Press>
      ) : null}
    </View>
  );
}, same);

// ---- status and errors ----
export const NoteRow = memo(function NoteRow({ row }: { row: R<'note'> }) {
  return <Text selectable style={[s.note, row.bad && { color: DEL }]}>{row.text}</Text>;
}, same);

const s = StyleSheet.create({
  flex: { flex: 1 },
  userWrap: { alignItems: 'flex-end', gap: 4, paddingLeft: 48 },
  user: { backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: 20, borderCurve: 'continuous', paddingHorizontal: 16, paddingVertical: 12 },
  userText: { fontFamily: F.regular, fontSize: 16, lineHeight: 24, color: C.text },
  from: { fontFamily: F.medium, fontSize: 12, lineHeight: 16, color: C.muted, textAlign: 'right' },
  fromLabel: { color: C.faint },
  answer: { paddingRight: 8 },

  group: { gap: 4 },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  groupLine: { fontFamily: F.medium, fontSize: 14, lineHeight: 20, color: C.muted },
  groupWho: { fontFamily: F.semibold, color: C.textSoft },
  groupNow: { fontFamily: F.regular, fontSize: 12, lineHeight: 16, color: C.muted },
  steps: { gap: 4, paddingBottom: 4 },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 4, minHeight: 32 },
  stepIcon: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  spinner: { transform: [{ scale: 0.7 }] },
  ring: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: C.faint },
  stepBody: { flex: 1, gap: 2 },
  stepTitle: { flex: 1, fontFamily: F.regular, fontSize: 14, lineHeight: 20, color: C.textSoft },
  stepChevron: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  chevronOpen: { transform: [{ rotate: '90deg' }] },
  thoughtDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.faint },
  thoughtLabel: { fontFamily: F.medium, fontSize: 12, lineHeight: 16, color: C.faint },
  thoughtText: { fontFamily: F.regular, fontSize: 14, lineHeight: 20, color: C.muted },
  narration: { paddingLeft: 28, paddingVertical: 4 },
  out: {
    marginLeft: 28, marginBottom: 4, borderRadius: 12, borderCurve: 'continuous', backgroundColor: 'rgba(0,0,0,0.28)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.10)', paddingVertical: 8, paddingHorizontal: 12, gap: 8,
  },
  outText: { fontFamily: MONO, fontSize: 12, lineHeight: 18, color: C.textSoft },
  outMore: { alignSelf: 'flex-start', minHeight: 24, justifyContent: 'center' },
  outMoreText: { fontFamily: F.medium, fontSize: 12, lineHeight: 16, color: C.muted },

  card: {
    borderRadius: 16, borderCurve: 'continuous', backgroundColor: 'rgba(255,255,255,0.05)', padding: 16, gap: 12,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.12)',
  },
  cardHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  cardTitle: { fontFamily: F.semibold, fontSize: 14, lineHeight: 20, color: C.text },
  cardMeta: { fontFamily: F.medium, fontSize: 12, lineHeight: 16, color: C.faint },
  planList: { gap: 8 },
  planItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  box: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  boxDone: { width: 18, height: 18, borderRadius: 9, backgroundColor: ADD, alignItems: 'center', justifyContent: 'center' },
  boxRing: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.24)', alignItems: 'center', justifyContent: 'center' },
  planText: { flex: 1, fontFamily: F.regular, fontSize: 14, lineHeight: 20, color: C.textSoft },
  planDone: { color: C.faint },
  planNow: { fontFamily: F.medium, color: C.text },

  perm: {
    borderRadius: 20, borderCurve: 'continuous', padding: 16, gap: 12, backgroundColor: 'rgba(255,181,71,0.08)',
    borderWidth: 1, borderColor: 'rgba(255,181,71,0.40)', boxShadow: `0 0 24px rgba(255,181,71,0.14)`,
  },
  permWho: { fontFamily: F.medium, fontSize: 14, lineHeight: 20, color: ATTN },
  permTitle: { fontFamily: F.semibold, fontSize: 16, lineHeight: 24, color: C.text },
  permCmd: { fontFamily: MONO, fontSize: 14, lineHeight: 20, color: C.text },
  permRow: { flexDirection: 'row', gap: 8 },
  permBtn: { height: 48, borderRadius: 12, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  permAllow: { backgroundColor: C.text },
  permSoft: { backgroundColor: 'rgba(255,255,255,0.10)' },
  permDeny: { backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(248,113,113,0.5)' },
  permBtnText: { fontFamily: F.semibold, fontSize: 16, lineHeight: 24, color: C.text },
  qBlock: { gap: 8 },
  qHeader: { fontFamily: F.medium, fontSize: 12, lineHeight: 16, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.6 },
  qNote: { fontFamily: F.regular, fontSize: 14, lineHeight: 20, color: C.muted },
  opt: {
    borderRadius: 12, borderCurve: 'continuous', paddingHorizontal: 12, paddingVertical: 10, gap: 2, minHeight: 44, justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.14)',
  },
  optOn: { backgroundColor: C.text, borderColor: C.text },
  optLabel: { fontFamily: F.semibold, fontSize: 15, lineHeight: 22, color: C.text },
  optDesc: { fontFamily: F.regular, fontSize: 13, lineHeight: 18, color: C.muted },
  qInput: {
    fontFamily: F.regular, fontSize: 16, lineHeight: 22, color: C.text, minHeight: 44, maxHeight: 120, borderRadius: 12, borderCurve: 'continuous',
    paddingHorizontal: 12, paddingTop: 10, paddingBottom: 10, backgroundColor: 'rgba(0,0,0,0.24)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.14)',
  },

  changesHead: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 24 },
  count: { fontFamily: MONO, fontSize: 12, lineHeight: 16 },
  files: { gap: 4 },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  fileName: { fontFamily: F.medium, fontSize: 14, lineHeight: 20, color: C.text },
  fileDir: { fontFamily: F.regular, fontSize: 12, lineHeight: 16, color: C.faint },
  moreFiles: { minHeight: 32, justifyContent: 'center' },
  moreText: { fontFamily: F.medium, fontSize: 14, lineHeight: 20, color: C.muted },

  note: { fontFamily: F.medium, fontSize: 12, lineHeight: 16, color: C.faint, paddingVertical: 4 },
});
