// "Across your life": the part of every section home that ties it to the rest of the app. Today's tasks for the
// section (tick them here and Today follows), the goals that serve it (open them in Mission, or set one), and what
// the other sections know that bears on this one. Each line opens its source.
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ASPECT_NAME, Bar, Block, Card, CheckRing, Divider, Press, Skeleton, SP, t, useAspect } from '@/aspects/kit';
import { openLink } from '@/lib/links';
import { useGet } from '@/lib/mod';
import { ASPECT_COLOR, type AspectKey } from '@/theme';
import { useLife } from './life';
import { NEEDS, signalsFor, type BodyToday, type MindDay, type Mood, type MoneySummary, type Person, type SoulSummary } from './signals';

type Goal = { id: string; title: string; horizon: string; label?: string; area: string | null; aspects?: AspectKey[] | null; status: string; progress: number };

const MAX_TASKS = 5;

/** The goals that serve a section: tagged with it, or filed under an area that belongs to it. */
export function goalsFor(goals: Goal[], aspect: AspectKey, areaAspects: Record<string, AspectKey[]>) {
  return goals.filter((g) => g.status === 'active' && (g.aspects?.includes(aspect) || (g.area != null && areaAspects[g.area]?.includes(aspect))));
}

/** `goals={false}` on a home that already lists the goals serving it (Mission, Family). */
export function Linked({ goals: withGoals = true }: { goals?: boolean }) {
  const a = useAspect();
  const life = useLife();
  const key = a.aspect;
  const need = NEEDS[key];
  const on = a.open;
  // each read is the same cached request the section that owns it makes, so nothing is fetched twice
  const goals = useGet<{ goals: Goal[] }>(on && withGoals ? '/goals' : null);
  const body = useGet<BodyToday>(on && need.includes('body') ? '/mod/body/today' : null);
  const soul = useGet<SoulSummary>(on && need.includes('soul') ? '/mod/soul/summary' : null);
  const mind = useGet<MindDay>(on && need.includes('mind') ? '/mod/mind/day' : null);
  const money = useGet<MoneySummary>(on && need.includes('money') ? '/mod/money/summary' : null);
  const people = useGet<{ people: Person[] }>(on && need.includes('people') ? '/mod/people/' : null);
  const moods = useGet<{ items: Mood[] }>(on && need.includes('moods') ? '/mod/soul/moods' : null);

  const section = life?.sections.find((s) => s.key === key) ?? null;
  const rows = section ? [...section.rows, ...section.carried].filter((r, i, all) => all.findIndex((x) => x.id === r.id) === i) : [];
  const open = rows.filter((r) => !r.done);
  const shown = [...open, ...rows.filter((r) => r.done)].slice(0, MAX_TASKS);
  const mine = useMemo(() => goalsFor(goals.data?.goals ?? [], key, life?.areaAspects ?? {}), [goals.data, key, life?.areaAspects]);
  const signals = useMemo(() => signalsFor(key, {
    body: body.data ?? undefined, soul: soul.data ?? undefined, mind: mind.data ?? undefined, money: money.data ?? undefined,
    people: people.data?.people, moods: moods.data?.items,
  }), [key, body.data, soul.data, mind.data, money.data, people.data, moods.data]);

  if (!life && !withGoals && !signals.length) return null;
  const name = ASPECT_NAME[key];

  return (
    <View style={s.wrap}>
      {life ? (
        <Block title="Today's tasks" action={rows.length > MAX_TASKS ? `All ${rows.length}` : undefined} onAction={() => openLink('agenticos://today')}>
          <Card style={s.list}>
            {shown.length ? shown.map((r, i) => (
              <View key={r.id}>
                {i ? <Divider /> : null}
                <Press label={`${r.done ? 'Undo' : 'Done'}: ${r.title}`} role="checkbox" state={{ checked: r.done }} onPress={() => life.toggle(r.id)} feel="tick" style={s.task}>
                  <CheckRing done={r.done} color={a.color} />
                  <View style={s.flex}>
                    <Text style={[t.callout, r.done && s.done]} numberOfLines={2}>{r.title}</Text>
                    {r.sub ? <Text style={t.footnote} numberOfLines={1}>{r.sub}</Text> : null}
                  </View>
                  {r.right ? <Text style={[t.footnote, t.num]}>{r.right}</Text> : null}
                </Press>
              </View>
            )) : (
              <Text style={[t.footnote, s.pad]}>{`No ${name} tasks today. Tasks filed under an area that belongs to ${name} show up here.`}</Text>
            )}
          </Card>
        </Block>
      ) : null}

      {withGoals ? (
      <Block title="Goals" action="Set one" onAction={() => openLink(`agenticos://mission/add?aspect=${key}`)}>
        {mine.length ? (
          <Card style={s.list}>
            {mine.slice(0, 4).map((g, i) => (
              <View key={g.id}>
                {i ? <Divider /> : null}
                <Press label={`${g.title}, ${Math.round(g.progress)} percent. Open in Mission`} onPress={() => openLink(`agenticos://mission/goal/${encodeURIComponent(g.id)}`)} style={s.goal}>
                  <View style={s.between}>
                    <Text style={[t.callout, s.flex]} numberOfLines={2}>{g.title}</Text>
                    <Text style={[t.footnote, t.num]}>{g.label ?? ''}</Text>
                  </View>
                  <Bar progress={g.progress / 100} color={a.color} height={6} />
                </Press>
              </View>
            ))}
          </Card>
        ) : (
          goals.data || goals.error
            ? <Card><Text style={t.footnote}>{goals.error ? "Goals didn't load." : `No goal serves ${name} yet. Set one in Mission and it shows here.`}</Text></Card>
            : <Skeleton height={64} radius={24} />
        )}
      </Block>
      ) : null}

      {signals.length ? (
        <Block title="From your other sections">
          <Card style={s.list}>
            {signals.map((x, i) => (
              <View key={x.key}>
                {i ? <Divider /> : null}
                <Press label={`${x.text}. Open ${ASPECT_NAME[x.from]}`} role="link" onPress={() => openLink(x.link)} style={s.signal}>
                  <View style={[s.dot, { backgroundColor: ASPECT_COLOR[x.from] }]} />
                  <Text style={[t.callout, s.flex]} numberOfLines={2}>{x.text}</Text>
                  <Text style={t.footnote}>{ASPECT_NAME[x.from]}</Text>
                </Press>
              </View>
            ))}
          </Card>
        </Block>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: SP[24] },
  list: { paddingVertical: SP[4] },
  task: { flexDirection: 'row', alignItems: 'center', gap: SP[12], minHeight: 48, paddingVertical: SP[8] },
  goal: { gap: SP[8], paddingVertical: SP[12] },
  signal: { flexDirection: 'row', alignItems: 'center', gap: SP[12], minHeight: 48, paddingVertical: SP[8] },
  dot: { width: 8, height: 8, borderRadius: 4 },
  between: { flexDirection: 'row', alignItems: 'center', gap: SP[12] },
  flex: { flex: 1 },
  done: { opacity: 0.5, textDecorationLine: 'line-through' },
  pad: { paddingVertical: SP[12] },
});
