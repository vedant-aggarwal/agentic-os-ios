import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Block, Button, Field, Group, haptic, Item, Sheet, Skeleton, t, undoable, useAspect } from '@/aspects/kit';
import { invalidate, useGet } from '@/lib/mod';
import { act, dueWords, M, message } from './data';
import type { GoalDetail } from './types';

/** An open task as `GET /tasks?status=open` sends it, as far as tying reads it. */
type OpenTask = { id: string; title: string; status: string; area: string | null; project: string | null; goal: string | null; due: string | null };
const TASKS = '/tasks?status=open';
const SHOWN = 30;

/**
 * Tie a task he already has to a goal, so the goal's next step is real work on Today. Tasks in the goal's projects
 * come first, then its area, then the rest; one tied to another goal moves here (Undo puts it back). He can also
 * write a new step, which lands on Today tied to the goal.
 */
export function TieSheet({ goal, onClose }: { goal: string | null; onClose: () => void }) {
  const a = useAspect();
  const tasks = useGet<{ tasks: OpenTask[] }>(goal ? TASKS : null);
  const detail = useGet<GoalDetail>(goal ? `${M}/goal/${goal}` : null);
  const [find, setFind] = useState('');
  const [step, setStep] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [was, setWas] = useState(goal);
  if (goal !== was) { setWas(goal); setFind(''); setStep(''); }

  const d = detail.data?.goal.id === goal ? detail.data : null;
  const list = useMemo(() => {
    if (!tasks.data || !goal) return [];
    const projects = new Set((d?.projects ?? []).map((p) => p.slug));
    const area = d?.goal.area ?? null;
    const rank = (x: OpenTask) => (x.project && projects.has(x.project) ? 0 : area && x.area === area ? 1 : !x.goal ? 2 : 3);
    const q = find.trim().toLowerCase();
    return tasks.data.tasks
      .filter((x) => x.goal !== goal && (!q || x.title.toLowerCase().includes(q)))
      .map((x, i) => ({ x, r: rank(x), i }))
      .sort((p, q2) => p.r - q2.r || p.i - q2.i)
      .map((p) => p.x);
  }, [tasks.data, d, goal, find]);

  const tie = async (x: OpenTask) => {
    if (!goal || busy) return;
    setBusy(x.id);
    try {
      await act(`/goal/${goal}/task`, { task: x.id });
      invalidate('/tasks');
      haptic.medium();
      const before = x.goal;
      undoable(`Tied: ${x.title}`, async () => {
        await act(`/goal/${before ?? goal}/task`, before ? { task: x.id } : { task: x.id, on: false });
        invalidate('/tasks');
      });
      onClose();
    } catch (e) { a.notice(message(e)); } finally { setBusy(null); }
  };
  const add = async () => {
    const title = step.trim();
    if (!goal || !title || busy) return;
    setBusy('new');
    try {
      await act(`/goal/${goal}/task`, { title });
      invalidate('/tasks');
      haptic.light();
      a.notice('Added to Today, tied to this goal');
      onClose();
    } catch (e) { a.notice(message(e)); } finally { setBusy(null); }
  };

  const sub = (x: OpenTask) => [
    x.goal ? 'Serves another goal, tying moves it here' : null,
    (x.project ?? x.area)?.replace(/[-_]+/g, ' ') ?? null,
    x.due ? `due ${dueWords(x.due)}` : null,
  ].filter(Boolean).join(', ').replace(/^./, (c) => c.toUpperCase()) || null;

  return (
    <Sheet open={!!goal} onClose={onClose} title="Tie a task to it">
      <Text style={t.subhead}>{d ? `The next step for ${d.goal.title}. Write a new one, or pick one of your tasks.` : 'Write a new next step, or pick one of your tasks.'}</Text>
      <View style={st.new}>
        <Field label="A new next step" value={step} onChangeText={setStep} placeholder="The smallest thing that moves it" onSubmit={() => void add()} maxLength={300} />
        {step.trim() ? <Button label="Add it to Today" kind="accent" small busy={busy === 'new'} onPress={() => void add()} wrap={st.left} /> : null}
      </View>
      <Block title="Your open tasks" sub="Ones in its projects and area come first">
        {!tasks.data ? (tasks.error ? <Text style={t.footnote}>{tasks.error}</Text> : <Skeleton height={160} radius={22} />) : (
          <>
            {tasks.data.tasks.length > 8 ? <Field value={find} onChangeText={setFind} placeholder="Find a task" maxLength={100} /> : null}
            {list.length ? (
              <Group>
                {list.slice(0, SHOWN).map((x) => (
                  <Item key={x.id} title={x.title} sub={busy === x.id ? 'Tying it' : sub(x)} label={`Tie ${x.title}`} onPress={() => void tie(x)}
                    action={<Button label="Tie" kind="soft" small busy={busy === x.id} onPress={() => void tie(x)} />} />
                ))}
              </Group>
            ) : <Text style={t.footnote}>{find.trim() ? 'No open task by that name.' : 'No open tasks to tie. Write a new step above.'}</Text>}
            {list.length > SHOWN ? <Text style={t.footnote}>{`${list.length - SHOWN} more. Find one by name.`}</Text> : null}
          </>
        )}
      </Block>
    </Sheet>
  );
}

const st = StyleSheet.create({
  new: { gap: 8 },
  left: { alignSelf: 'flex-start' },
});
