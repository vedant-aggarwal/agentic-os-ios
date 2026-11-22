import { useCallback, useMemo, useState } from 'react';
import { invalidate, useCollection } from '@/lib/mod';
import { Page, useAspect, useEntry } from '@/aspects/kit';
import { B, PART_NAME, useHome, type FullSession, type Part } from './api';
import { DietScreen } from './diet/Diet';
import { LogMeal, TargetsSheet } from './diet/Log';
import { FaceScreen } from './face/Face';
import { RoutinePlayer } from './face/Routine';
import { ScanFlow } from './face/Scan';
import { GymScreen } from './gym/Gym';
import { LiveWorkout } from './gym/Live';
import { QuickSheet, WeighSheet } from './gym/Sheets';
import { emptyLive, liveFrom, type WorkoutDoc } from './gym/workout';
import { Home } from './Home';
import { NavContext, type BodyNav, type Flow, type SheetKind } from './nav';
import { DrillPlayer } from './voice/Drills';
import { SampleFlow } from './voice/Sample';
import { VoiceScreen } from './voice/Voice';
import { Linked } from '@/aspects/_linked/Linked';

// The Body page: how he looks and presents himself, in four parts (Gym, Diet, Face, Voice). Home answers one
// question, what to do for the body today and whether it is working; each part opens on top of it.
export default function Body() {
  const a = useAspect();
  const home = useHome();
  const workouts = useCollection<WorkoutDoc>('body', 'workouts');
  const [part, setPart] = useState<Part | null>(null);
  const [flow, setFlow] = useState<Flow | null>(null);
  const [sheet, setSheet] = useState<SheetKind | null>(null);
  const { notice } = a;
  const { items, put } = workouts;

  const startWorkout = useCallback(async (session: FullSession | null) => {
    const live = (items ?? []).find((w) => w.status === 'live');
    if (live) { setFlow({ kind: 'live' }); return; }
    const existing = session ? (items ?? []).find((w) => w.id === session.id) ?? null : null;
    try {
      await put(session ? liveFrom(session, existing) : emptyLive());
      invalidate(`${B}/`);
      setFlow({ kind: 'live' });
    } catch (e) {
      notice(`Couldn't start: ${(e as Error).message}`);
    }
  }, [items, put, notice]);

  const closeFlow = useCallback(() => { setFlow(null); invalidate(`${B}/`); }, []);

  // body/<part>: gym, diet, face, voice (body/looks is Face, the PM protocol's push). body/diet/meal opens the meal log
  // on Diet, body/gym/weigh the weight. A full-screen flow or sheet that was open gives way to the link.
  useEntry((e) => {
    const [p, then] = e.parts;
    const want = p === 'looks' ? 'face' : (Object.keys(PART_NAME) as Part[]).find((k) => k === p) ?? null;
    if (flow) closeFlow();
    setSheet(want === 'diet' && then === 'meal' ? { kind: 'meal' } : want === 'gym' && then === 'weigh' ? { kind: 'weigh' } : null);
    setPart(want);
  });
  const nav = useMemo<BodyNav>(() => ({ part, openPart: setPart, flow, openFlow: setFlow, sheet, openSheet: setSheet, startWorkout }), [part, flow, sheet, startWorkout]);

  return (
    <NavContext value={nav}>
      <Page onRefresh={() => { void home.refresh(); }} refreshing={home.busy && !!home.data}
        footer={(
          <>
            <GymScreen open={part === 'gym'} onClose={() => setPart(null)} title={PART_NAME.gym} />
            <DietScreen open={part === 'diet'} onClose={() => setPart(null)} title={PART_NAME.diet} />
            <FaceScreen open={part === 'face'} onClose={() => setPart(null)} title={PART_NAME.face} />
            <VoiceScreen open={part === 'voice'} onClose={() => setPart(null)} title={PART_NAME.voice} />
            <LiveWorkout open={flow?.kind === 'live'} onClose={closeFlow} />
            <ScanFlow open={flow?.kind === 'scan'} onClose={closeFlow} />
            <RoutinePlayer open={flow?.kind === 'routine'} when={flow?.kind === 'routine' ? flow.when : 'am'} onClose={closeFlow} />
            <DrillPlayer open={flow?.kind === 'drills'} onClose={closeFlow} />
            <SampleFlow open={flow?.kind === 'sample'} onClose={closeFlow} />
            <LogMeal open={sheet?.kind === 'meal'} onClose={() => setSheet(null)} />
            <QuickSheet open={sheet?.kind === 'quick'} quick={sheet?.kind === 'quick' ? sheet.quick : 'boxing'} onClose={() => setSheet(null)} />
            <WeighSheet open={sheet?.kind === 'weigh'} onClose={() => setSheet(null)} />
            <TargetsSheet open={sheet?.kind === 'targets'} onClose={() => setSheet(null)} />
          </>
        )}>
        <Home read={home} />
        {home.data ? <Linked /> : null}
      </Page>
    </NavContext>
  );
}
