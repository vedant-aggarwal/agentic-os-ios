import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { addDays, Button, Chip, Field, Group, haptic, IconButton, Icon, Item, SegTabs, Sheet, shortDay, Skeleton, t, today, useAspect, weekday, weekStart } from '@/aspects/kit';
import { call, useGet } from '@/lib/mod';
import { C, type AspectKey } from '@/theme';
import { act, ASPECT_KEYS, ASPECT_LABEL, M, message, nextStart, NUMBER_WORDS, slotsPath } from './data';
import type { AddInit } from './nav';
import { Dot, s as ps } from './parts';
import type { Full, GoalDraft, Horizon, Ladder } from './types';

const HORIZONS = [
  { key: 'week', label: 'Week' }, { key: 'month', label: 'Month' }, { key: 'quarter', label: 'Quarter' }, { key: 'year', label: 'Year' },
] as const;
type H = (typeof HORIZONS)[number]['key'];
const RANK: Record<Horizon, number> = { week: 1, month: 2, quarter: 3, year: 4, decade: 5, life: 6 };
const MO = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** The period a goal lands in, said plainly: "23 to 29 Nov", "December", "Oct to Dec", "2027". */
function periodWord(h: H, day: string) {
  const [y, m] = day.split('-').map(Number);
  if (h === 'week') { const s = weekStart(day), e = addDays(s, 6); return s.slice(5, 7) === e.slice(5, 7) ? `${Number(s.slice(8))} to ${shortDay(e)}` : `${shortDay(s)} to ${shortDay(e)}`; }
  if (h === 'month') return `${MO[m - 1]}${y === Number(today().slice(0, 4)) ? '' : ` ${y}`}`;
  if (h === 'quarter') { const q = Math.floor((m - 1) / 3); return `${MO[q * 3].slice(0, 3)} to ${MO[q * 3 + 2].slice(0, 3)}${y === Number(today().slice(0, 4)) ? '' : ` ${y}`}`; }
  return String(y);
}

/**
 * Adding a goal: a rough line, when, which aspect, what it serves. Claude can tidy it into a goal with milestones;
 * it saves as written too. A full horizon asks which goal the new one replaces, or keeps it for the next period.
 */
export function AddGoal({ init, onClose, today: day }: { init: AddInit | null; onClose: () => void; today: string | null }) {
  const [shown, setShown] = useState<AddInit | null>(init);
  const [n, setN] = useState(0);
  if (init && init !== shown) { setShown(init); setN(n + 1); }
  return (
    <Sheet open={!!init} onClose={onClose}>
      {shown ? <Body key={n} init={shown} onClose={onClose} day={day ?? today()} /> : null}
    </Sheet>
  );
}

function Body({ init, onClose, day }: { init: AddInit; onClose: () => void; day: string }) {
  const a = useAspect();
  const [text, setText] = useState(init.text ?? '');
  const [h, setH] = useState<H>((init.horizon as H) ?? 'week');
  const [start, setStart] = useState<string | null>(init.start ?? null);
  const [aspects, setAspects] = useState<AspectKey[]>(init.aspects ?? []);
  const [parent, setParent] = useState<string | null>(init.parent ?? null);
  const [draft, setDraft] = useState<GoalDraft | null>(null);
  const [title, setTitle] = useState('');
  const [steps, setSteps] = useState<string[]>([]);
  const [fullAt, setFullAt] = useState<string | null>(null);
  const [replace, setReplace] = useState<string | null>(null);
  const [busy, setBusy] = useState<'draft' | 'save' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ladder = useGet<Ladder>(`${M}/ladder`);
  const full = useGet<Full>(fullAt);

  // on a Sunday a new week goal is for the week that starts tomorrow
  const auto = h === 'week' && weekday(day) === 0 ? addDays(day, 1) : null;
  const onDay = start ?? auto ?? day;
  const parents = (ladder.data ? [...ladder.data.far, ...ladder.data.rungs.flatMap((r) => r.goals)] : []).filter((g) => RANK[g.horizon] > RANK[h] && g.status === 'active');

  const runDraft = async () => {
    setBusy('draft'); setError(null);
    try {
      const d = await call<GoalDraft>(`${M}/draft`, { text: text.trim(), horizon: h, aspects, parent });
      setDraft(d); setTitle(d.title || text.trim()); setSteps(d.milestones ?? []);
      if (d.aspects?.length && !aspects.length) setAspects(d.aspects);
      if (d.parent && !parent && parents.some((p) => p.id === d.parent)) setParent(d.parent);
    } catch (e) {
      setError(`${message(e)} You can save it as written.`);
    } finally { setBusy(null); }
  };
  const save = async (extra: { replaces?: string; start?: string } = {}) => {
    setBusy('save'); setError(null);
    const s = extra.start ?? start ?? auto;
    try {
      await act('/goal', {
        title: (draft ? title : text).trim(), horizon: h, start: s, aspects, parent,
        measure: draft?.measure || null, milestones: draft ? steps.filter((x) => x.trim()) : [], draft: draft?.draft ?? null, ...extra,
      });
      haptic.success();
      a.notice(extra.start ? `Kept for ${periodWord(h, extra.start)}` : 'Goal added');
      onClose();
    } catch (e) {
      const path = slotsPath(e, h, s);
      if (path) { setFullAt(path); setReplace(null); } else setError(message(e));
    } finally { setBusy(null); }
  };

  if (fullAt) {
    const f = full.data;
    const laterStart = nextStart(h, onDay);
    const later = periodWord(h, laterStart);
    return (
      <View style={st.body}>
        <Text accessibilityRole="header" style={t.title3}>{f ? `${f.label} already holds ${NUMBER_WORDS[f.limit] ?? f.limit}` : 'That period is full'}</Text>
        <Text style={t.subhead}>Pick the goal this one replaces, or keep the new one for {later}.</Text>
        {!f ? (full.error ? <Text style={t.footnote}>{full.error}</Text> : <Skeleton height={120} radius={22} />) : (
          <Group inset={36}>
            {f.goals.map((g) => (
              <Item key={g.id} title={g.title} left={<Dot aspect={g.aspect as AspectKey} />} onPress={() => setReplace(g.id)}
                label={`${g.title}${replace === g.id ? ', chosen' : ''}`}
                sub={replace === g.id ? 'Replaced, kept on your record as let go' : ASPECT_LABEL[g.aspect as AspectKey] ?? 'Goal'}
                right={replace === g.id ? <Icon name="check" size={18} color={a.color} /> : undefined} />
            ))}
          </Group>
        )}
        {error ? <Text style={[t.footnote, st.err]}>{error}</Text> : null}
        <Button label="Replace it" kind="accent" onPress={() => void save({ replaces: replace! })} disabled={!replace} busy={busy === 'save'} />
        <Button label={`Keep it for ${later}`} kind="quiet" onPress={() => { setStart(laterStart); setFullAt(null); void save({ start: laterStart }); }} />
      </View>
    );
  }

  if (draft) {
    return (
      <View style={st.body}>
        <Text accessibilityRole="header" style={t.title3}>Here is a goal from that</Text>
        <Field label="Goal" value={title} onChangeText={setTitle} maxLength={300} />
        {draft.measure ? <Text style={t.subhead}>{`Done when ${draft.measure.replace(/^./, (c) => c.toLowerCase())}`}</Text> : null}
        <Text style={t.footnote}>Milestones</Text>
        {steps.map((m, i) => (
          <View key={i} style={st.step}>
            <View style={ps.flex}><Field value={m} onChangeText={(v) => setSteps((xs) => xs.map((x, j) => (j === i ? v : x)))} maxLength={200} /></View>
            <IconButton label={`Remove milestone ${i + 1}`} size={36} onPress={() => setSteps((xs) => xs.filter((_, j) => j !== i))}><Icon name="close" size={14} /></IconButton>
          </View>
        ))}
        {draft.note ? <Text style={t.footnote}>{draft.note}</Text> : null}
        {error ? <Text style={[t.footnote, st.err]}>{error}</Text> : null}
        <Button label="Save goal" kind="accent" onPress={() => void save()} busy={busy === 'save'} disabled={!title.trim()} />
        <Button label="Back to my words" kind="quiet" onPress={() => setDraft(null)} />
      </View>
    );
  }

  return (
    <View style={st.body}>
      <Text accessibilityRole="header" style={t.title3}>Add a goal</Text>
      <Field label="What has to happen?" value={text} onChangeText={setText} placeholder="In your own words" autoFocus maxLength={300} />
      <View style={st.group}>
        <Text style={t.footnote}>When</Text>
        <SegTabs tabs={HORIZONS} value={h} onChange={(k) => { setH(k); if (k !== init.horizon) setStart(null); setParent(null); }} />
        <Text style={[t.footnote, t.num]}>{`Goes in ${periodWord(h, onDay)}`}</Text>
      </View>
      <View style={st.group}>
        <Text style={t.footnote}>Sections it serves</Text>
        <View style={st.chips}>
          {ASPECT_KEYS.map((k) => (
            <Chip key={k} label={ASPECT_LABEL[k]} icon={<Dot aspect={k} />} selected={aspects.includes(k)}
              onPress={() => setAspects((xs) => (xs.includes(k) ? xs.filter((x) => x !== k) : [...xs, k].slice(-3)))} />
          ))}
        </View>
      </View>
      {parents.length ? (
        <View style={st.group}>
          <Text style={t.footnote}>What it serves</Text>
          <View style={st.chips}>
            {parents.map((p) => <Chip key={p.id} label={p.title.length > 34 ? `${p.title.slice(0, 32)}…` : p.title} icon={<Dot aspect={p.aspect} />} selected={parent === p.id} onPress={() => setParent(parent === p.id ? null : p.id)} />)}
          </View>
        </View>
      ) : null}
      {error ? <Text style={[t.footnote, st.err]}>{error}</Text> : null}
      <Button label="Save" kind="accent" onPress={() => void save()} busy={busy === 'save'} disabled={!text.trim() || !!busy} />
      <Button label="Draft it with Nora first" kind="quiet" onPress={() => void runDraft()} busy={busy === 'draft'} disabled={!text.trim() || !!busy} />
    </View>
  );
}

const st = StyleSheet.create({
  body: { gap: 16 },
  group: { gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  err: { color: C.danger },
});
