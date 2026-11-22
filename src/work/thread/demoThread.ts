import type { JobEvent, JobFull } from '../types';

// Dev only (web build with `?demo`): a job thread on sample data, with a little life so the stream path is exercised.
// The running check finishes, the plan ticks, the permission waits for him; Allow runs the tests and streams the answer.

const ago = (sec: number) => new Date(Date.now() - sec * 1000).toISOString();
const now = () => new Date().toISOString();

const ANSWER_1 = `## Sorted by priority

Today's groups now sort by **priority first**, then by due time. Carried tasks stay at the bottom.

- The comparator lives in \`buildView\` in \`src/lib/today.ts\`
- Tasks with no priority sort after P3
- \`TaskRow\` shows the priority dot only for P1

\`\`\`ts
const byPriority = (a: Task, b: Task) =>
  (a.priority ?? 9) - (b.priority ?? 9) || (a.due ?? '').localeCompare(b.due ?? '');
\`\`\`

Typecheck is clean.`;

const ANSWER_2 = `Timed tasks now come first, then the priority order from before. I added **today.test.ts** with three cases: timed before untimed, priority inside a time slot, and carried tasks last.

All three pass. Nothing else changed.`;

export function demoJob(id: string): JobFull {
  return {
    id, title: 'Priority sort on Today', engine: 'claude', status: 'running', project: 'agentic-os',
    folder: 'C:\\Users\\VEDANT\\agentic-os-mobile', updatedAt: ago(4), step: 'Running npx tsc --noEmit',
    changes: { files: 3, add: 24, del: 9 }, error: null, perm: 'ask', model: 'claude-opus-5-5',
    createdAt: ago(900), finishedAt: null, tasks: ['t12'], idea: null,
  };
}

export function demoEvents(): JobEvent[] {
  return [
    { seq: 1, type: 'user', at: ago(900), text: "Sort Today's tasks by priority, then by due time. Keep carried tasks at the bottom." },
    { seq: 2, type: 'thought', at: ago(896), text: 'Today builds its groups in src/lib/today.ts. I should find where the rows are ordered before touching the UI.' },
    { seq: 3, type: 'tool', id: 'c1', at: ago(890), title: 'Read src/lib/today.ts', kind: 'read', status: 'completed', locations: ['src/lib/today.ts'],
      output: 'export function buildView(p: TodayPayload): View {\n  const groups = groupByArea(p.tasks);\n  return { groups, carried: carriedGroup(p.tasks) };\n}' },
    { seq: 4, type: 'tool', id: 'c2', at: ago(870), title: 'Search for "groupByArea"', kind: 'search', status: 'completed', output: 'src/lib/today.ts:41\nsrc/lib/today.ts:88' },
    { seq: 5, type: 'assistant', at: ago(860), text: 'The groups come from `groupByArea`. I will sort inside it so every group gets the same order.' },
    { seq: 6, type: 'tool', id: 'c3', at: ago(840), title: 'Edit src/lib/today.ts', kind: 'edit', status: 'completed', locations: ['src/lib/today.ts'] },
    { seq: 7, type: 'tool', id: 'c4', at: ago(820), title: 'Edit src/components/TaskRow.tsx', kind: 'edit', status: 'completed', locations: ['src/components/TaskRow.tsx'] },
    { seq: 8, type: 'tool', id: 'c5', at: ago(790), title: 'Run npx tsc --noEmit', kind: 'execute', status: 'completed', output: '(no output)' },
    { seq: 9, type: 'assistant', at: ago(780), text: ANSWER_1 },
    { seq: 10, type: 'changes', turn: 1, at: ago(779), files: [{ path: 'src/lib/today.ts', add: 18, del: 6 }, { path: 'src/components/TaskRow.tsx', add: 4, del: 1 }] },
    { seq: 11, type: 'user', at: ago(240), text: 'Also put tasks with a time slot first, and add a test for the sort.' },
    { seq: 12, type: 'plan', at: ago(236), entries: [
      { content: 'Read how scheduled tasks are stored', status: 'completed' },
      { content: 'Sort timed tasks first', status: 'completed' },
      { content: 'Add a test for the sort', status: 'in_progress' },
      { content: 'Run the tests', status: 'pending' },
    ] },
    { seq: 13, type: 'tool', id: 'c6', at: ago(230), title: 'Read src/lib/useToday.ts', kind: 'read', status: 'completed', locations: ['src/lib/useToday.ts'] },
    { seq: 14, type: 'tool', id: 'c7', at: ago(200), title: 'Edit src/lib/today.ts', kind: 'edit', status: 'completed', locations: ['src/lib/today.ts'] },
    { seq: 15, type: 'assistant', at: ago(190), text: 'Timed tasks come first now. Writing the test next.' },
    { seq: 16, type: 'tool', id: 'c8', at: ago(150), title: 'Write src/lib/today.test.ts', kind: 'edit', status: 'completed', locations: ['src/lib/today.test.ts'] },
    { seq: 17, type: 'tool', id: 'c9', at: ago(20), title: 'Run npx tsc --noEmit', kind: 'execute', status: 'in_progress', output: '' },
    { seq: 18, type: 'permission', at: ago(8), requestId: 'r1', title: 'bun test src/lib/today.test.ts', kind: 'execute', options: [
      { optionId: 'allow', name: 'Allow', kind: 'allow_once' },
      { optionId: 'always', name: 'Always allow bun test', kind: 'allow_always' },
      { optionId: 'deny', name: 'Deny', kind: 'reject_once' },
    ] },
  ];
}

const PATCHES: Record<string, string> = {
  'src/lib/today.ts': `diff --git a/src/lib/today.ts b/src/lib/today.ts
--- a/src/lib/today.ts
+++ b/src/lib/today.ts
@@ -38,9 +38,21 @@ export function buildView(p: TodayPayload): View {
 function groupByArea(tasks: Task[]): Group[] {
   const map = new Map<string, Task[]>();
   for (const t of tasks) map.set(t.area, [...(map.get(t.area) ?? []), t]);
-  return [...map].map(([key, rows]) => ({ key, rows }));
+  return [...map].map(([key, rows]) => ({ key, rows: [...rows].sort(byOrder) }));
 }
+
+/** Timed tasks first (by start), then priority, then due time. Carried tasks are grouped elsewhere. */
+export const byOrder = (a: Task, b: Task) =>
+  Number(!!b.scheduled) - Number(!!a.scheduled)
+  || (a.scheduled?.start ?? '').localeCompare(b.scheduled?.start ?? '')
+  || (a.priority ?? 9) - (b.priority ?? 9)
+  || (a.due ?? '').localeCompare(b.due ?? '');
`,
  'src/components/TaskRow.tsx': `diff --git a/src/components/TaskRow.tsx b/src/components/TaskRow.tsx
--- a/src/components/TaskRow.tsx
+++ b/src/components/TaskRow.tsx
@@ -21,7 +21,10 @@ export function TaskRow({ task, onToggle }: Props) {
       <Check on={task.status === 'done'} />
-      <Text style={s.title}>{task.title}</Text>
+      <Text style={s.title} numberOfLines={2}>{task.title}</Text>
+      {task.priority === 1 ? <View style={s.p1} accessibilityLabel="Priority 1" /> : null}
     </Pressable>
   );
 }
`,
  'src/lib/today.test.ts': `diff --git a/src/lib/today.test.ts b/src/lib/today.test.ts
new file mode 100644
--- /dev/null
+++ b/src/lib/today.test.ts
@@ -0,0 +1,12 @@
+import { expect, test } from 'bun:test';
+import { byOrder } from './today';
+
+test('timed tasks come before untimed ones', () => {
+  const rows = [task({ id: 'a' }), task({ id: 'b', scheduled: { start: '09:00', end: '10:00' } })];
+  expect(rows.sort(byOrder).map((t) => t.id)).toEqual(['b', 'a']);
+});
+
+test('priority orders tasks inside the same slot', () => {
+  const rows = [task({ id: 'a', priority: 3 }), task({ id: 'b', priority: 1 })];
+  expect(rows.sort(byOrder).map((t) => t.id)).toEqual(['b', 'a']);
+});
`,
};

export function demoPatch(path: string): string {
  return PATCHES[path] ?? '';
}

type Emit = (job: Partial<JobFull> | null, evs: JobEvent[]) => void;
export type DemoRun = {
  stop: () => void;
  permission: (requestId: string, optionId: string) => void;
  prompt: (text: string) => void;
  control: (what: 'cancel' | 'stop' | 'done') => void;
  revert: (turn: number) => void;
};

/** One demo run per open thread; the thread's actions reach it through here. */
export const demoRuns = new Map<string, DemoRun>();

export function startDemo(id: string, emit: Emit): DemoRun {
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let seq = demoEvents().length;
  let turn = 2;
  let running = true;
  const later = (ms: number, fn: () => void) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); };
  const clear = () => { timers.forEach(clearTimeout); timers.clear(); };

  // Streams `text` into one assistant event, a few words per tick, like the server's 80 ms coalescing.
  const stream = (text: string, done: () => void) => {
    const s = ++seq, at = now(), words = text.split(/(\s+)/);
    let i = 0;
    const tick = () => {
      i = Math.min(words.length, i + 6);
      emit(null, [{ seq: s, type: 'assistant', at, text: words.slice(0, i).join('') }]);
      if (i < words.length) later(80, tick); else done();
    };
    tick();
  };
  const finishTurn = (files: { path: string; add: number; del: number }[]) => {
    if (files.length) emit(null, [{ seq: ++seq, type: 'changes', turn, at: now(), files }]);
    running = false;
    emit({ status: 'idle', step: null, updatedAt: now() }, []);
  };

  // the typecheck that is running when the page opens
  later(1400, () => emit(null, [{ seq: 17, type: 'tool', id: 'c9', at: now(), title: 'Run npx tsc --noEmit', kind: 'execute', status: 'in_progress', output: 'Checking 214 files' }]));
  later(2600, () => {
    emit({ status: 'needs_input', step: 'Wants to run bun test', updatedAt: now() }, [
      { seq: 17, type: 'tool', id: 'c9', at: now(), title: 'Run npx tsc --noEmit', kind: 'execute', status: 'completed', output: 'Checking 214 files\nNo errors' },
    ]);
  });

  const run: DemoRun = {
    stop: clear,
    permission(requestId, optionId) {
      emit(null, [{ ...(demoEvents()[17] as Extract<JobEvent, { type: 'permission' }>), requestId, decided: optionId }]);
      if (optionId === 'deny') {
        emit({ status: 'running', updatedAt: now() }, []);
        later(600, () => stream('Okay, I will not run the tests. The test file is written; run `bun test src/lib` when you want to check it.', () => finishTurn([
          { path: 'src/lib/today.ts', add: 2, del: 1 }, { path: 'src/lib/today.test.ts', add: 12, del: 0 },
        ])));
        return;
      }
      emit({ status: 'running', step: 'Running bun test', updatedAt: now() }, [
        { seq: ++seq, type: 'tool', id: 'c10', at: now(), title: 'Run bun test src/lib/today.test.ts', kind: 'execute', status: 'in_progress', output: '' },
      ]);
      const tool = seq;
      later(1500, () => emit(null, [{ seq: tool, type: 'tool', id: 'c10', at: now(), title: 'Run bun test src/lib/today.test.ts', kind: 'execute', status: 'completed', output: 'bun test v1.3.4\n\nsrc/lib/today.test.ts:\n✓ timed tasks come before untimed ones\n✓ priority orders tasks inside the same slot\n✓ carried tasks stay last\n\n 3 pass\n 0 fail' }]));
      later(1700, () => emit(null, [{ seq: 12, type: 'plan', at: now(), entries: [
        { content: 'Read how scheduled tasks are stored', status: 'completed' },
        { content: 'Sort timed tasks first', status: 'completed' },
        { content: 'Add a test for the sort', status: 'completed' },
        { content: 'Run the tests', status: 'completed' },
      ] }]));
      later(2100, () => stream(ANSWER_2, () => finishTurn([
        { path: 'src/lib/today.ts', add: 2, del: 1 }, { path: 'src/lib/today.test.ts', add: 12, del: 0 },
      ])));
    },
    prompt(text) {
      turn += 1;
      running = true;
      emit({ status: 'running', step: 'Thinking', updatedAt: now() }, [{ seq: ++seq, type: 'user', at: now(), text }]);
      later(700, () => emit(null, [{ seq: ++seq, type: 'tool', id: `d${seq}`, at: now(), title: 'Read src/lib/today.ts', kind: 'read', status: 'completed' }]));
      later(1500, () => stream('This is the demo thread, so nothing ran on your PC. On the real server the reply streams in here as it is written.', () => finishTurn([])));
    },
    control(what) {
      clear();
      if (what === 'done') { running = false; emit({ status: 'done', finishedAt: now(), updatedAt: now() }, [{ seq: ++seq, type: 'status', status: 'done', at: now() }]); return; }
      if (!running) return;
      running = false;
      emit({ status: 'idle', step: null, updatedAt: now() }, [{ seq: ++seq, type: 'status', status: 'idle', text: 'Cancelled', at: now() }]);
    },
    revert(t) {
      emit(null, [{ seq: ++seq, type: 'status', status: 'idle', at: now(), text: `Files put back to before turn ${t}: 2 restored, 1 removed.` }]);
    },
  };
  demoRuns.set(id, run);
  return run;
}
