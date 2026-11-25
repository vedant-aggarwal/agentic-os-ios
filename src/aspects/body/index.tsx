import { useCallback, useMemo, useState } from 'react';
import { invalidate, useCollection } from '@/lib/mod';
import { Icon, IconButton, TabbedPage, TabPanel, useAspect, useEntry, useOnReturn } from '@/aspects/kit';
import { B, useHome, type FullSession, type Part } from './api';
import { DietTab } from './diet/Diet';
import { LogMeal, TargetsSheet } from './diet/Log';
import { FaceTab } from './face/Face';
import { RoutinePlayer } from './face/Routine';
import { ScanFlow } from './face/Scan';
import { QuickSheet, WeighSheet } from './gym/Sheets';
import { emptyLive, liveFrom, type WorkoutDoc } from './gym/workout';
import { NavContext, TAB_OF, TABS, type BodyNav, type Detail, type Flow, type SheetKind, type Tab } from './nav';
import { TodayTab } from './today/Today';
import { DetailScreens } from './train/Detail';
import { LiveWorkout } from './train/Live';
import { TrainTab } from './train/Train';
import { DrillPlayer } from './voice/Drills';
import { SampleFlow } from './voice/Sample';
import { VoiceTab } from './voice/Voice';

// The Body page: training, food, face and voice in one place. Today answers what to do for the body now and whether
// it is working; Train is the gym (the session, the live workout, recovery, records and history); Diet, Face and
// Voice each have their own tab. Flows (the live workout, a scan, a routine, drills) open full screen on top.
export default function Body() {
  const a = useAspect();
  const home = useHome();
  const workouts = useCollection<WorkoutDoc>('body', 'workouts');
  const [tab, setTab] = useState<Tab>('today');
  const [flow, setFlow] = useState<Flow | null>(null);
  const [sheet, setSheet] = useState<SheetKind | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
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
  const openPart = useCallback((p: Part | null) => { setDetail(null); setTab(p ? TAB_OF[p] : 'today'); }, []);
  const openTab = useCallback((x: Tab) => { setDetail(null); setTab(x); }, []);

  // body/<part>: gym, diet, face, voice (body/looks is Face, the PM protocol's push). body/diet/meal opens the meal log,
  // body/gym/weigh the weigh in. A flow, sheet or detail that was open gives way to the link.
  useEntry((e) => {
    const [p, then] = e.parts;
    const part: Part | null = p === 'looks' ? 'face' : p === 'gym' || p === 'diet' || p === 'face' || p === 'voice' ? p : null;
    if (flow) closeFlow();
    setDetail(null);
    setSheet(part === 'diet' && then === 'meal' ? { kind: 'meal' } : part === 'gym' && then === 'weigh' ? { kind: 'weigh' } : null);
    setTab(part ? TAB_OF[part] : p === 'train' ? 'train' : 'today');
  });
  // back from another app or the lock screen: the day may have moved on
  useOnReturn(() => invalidate(`${B}/`));

  const nav = useMemo<BodyNav>(() => ({
    tab, openTab, openPart, flow, openFlow: setFlow, sheet, openSheet: setSheet, detail, openDetail: setDetail, startWorkout,
  }), [tab, openTab, openPart, flow, sheet, detail, startWorkout]);

  return (
    <NavContext value={nav}>
      <TabbedPage tabs={TABS} tab={tab} onTab={openTab} onRefresh={() => { invalidate(`${B}/`); void home.refresh(); }} refreshing={home.busy && !!home.data}
        right={tab === 'diet' ? <IconButton label="Log a meal" size={40} onPress={() => setSheet({ kind: 'meal' })}><Icon name="plus" size={18} /></IconButton> : undefined}
        footer={(
          <>
            <DetailScreens />
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
        <TabPanel active={tab === 'today'}><TodayTab read={home} /></TabPanel>
        <TabPanel active={tab === 'train'}><TrainTab active={tab === 'train'} /></TabPanel>
        <TabPanel active={tab === 'diet'}><DietTab active={tab === 'diet'} /></TabPanel>
        <TabPanel active={tab === 'face'}><FaceTab active={tab === 'face'} /></TabPanel>
        <TabPanel active={tab === 'voice'}><VoiceTab active={tab === 'voice'} /></TabPanel>
      </TabbedPage>
    </NavContext>
  );
}
