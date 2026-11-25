import { useCallback, useMemo, useRef, useState } from 'react';
import { TabbedPage, TabPanel, useAspect, useEntry, useOnReturn } from '@/aspects/kit';
import { invalidate, useGet } from '@/lib/mod';
import { LearnTab } from './Courses';
import { NavContext, TABS, type MindNav, type Tab } from './nav';
import { ReadTab, SittingSheet } from './Read';
import { RecallScreen } from './Recall';
import { ReviewScreen } from './Review';
import { DrillScreen, SpeakTab } from './Speak';
import { StageFlow, VoiceKeySheet, type StageRun } from './Stage';
import { TakeFlow, type Run } from './Take';
import { TodayTab } from './Today';
import type { HomeView, StageSpec, TakeSpec } from './types';
import { usePoll } from './ui';

// The Mind page: learn it, then say it. Today is the next step of that loop and the week; Read is the books, the
// lines that stuck and the questions made from them; Learn is the course; Speak is impromptu on camera, drills and
// scores. A take, a video, recall, a drill, a review and the end of a reading sitting open on top.

const HOME = '/mod/mind/home';

export default function Mind() {
  const a = useAspect();
  const home = useGet<HomeView>(a.open ? HOME : null);
  const [tab, setTab] = useState<Tab>('today');
  const [recall, setRecall] = useState(false);
  const [drill, setDrill] = useState<string | null>(null);
  const [review, setReview] = useState<string | null>(null);
  const [sitting, setSitting] = useState<string | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [stage, setStage] = useState<StageRun | null>(null);
  const [keyOpen, setKeyOpen] = useState(false);
  const n = useRef(0);
  const take = useCallback((spec: TakeSpec, steps?: string[]) => { n.current += 1; setRun({ spec, n: n.current, steps }); }, []);
  const film = useCallback((spec: StageSpec) => { n.current += 1; setStage({ spec, n: n.current }); }, []);
  const openKey = useCallback(() => setKeyOpen(true), []);
  const openRecall = useCallback(() => setRecall(true), []);

  // a take being written down or reviewed shows its score on Today when it lands
  usePoll(() => { void home.refresh(); }, 4000, a.open && tab === 'today' && !!home.data?.pending.length);
  // back from a lesson in the browser, or a tick on Today: the day may have moved on
  useOnReturn(() => invalidate('/mod/mind/'));
  // mind/<part>: read, courses, speak (or impromptu), recall, drill/<id>, review/<id>. mind/checkin (the evening push)
  // lands on Today.
  useEntry((e) => {
    const [p, id] = e.parts;
    setRecall(p === 'recall');
    setDrill(p === 'drill' && id ? id : null);
    setReview(p === 'review' && id ? id : null);
    setSitting(null);
    setTab(p === 'read' || p === 'recall' ? 'read' : p === 'courses' || p === 'learn' ? 'learn' : p === 'speak' || p === 'drill' || p === 'impromptu' || p === 'stage' ? 'speak' : 'today');
  });

  const nav = useMemo<MindNav>(() => ({
    tab, openTab: setTab, take, stage: film, openKey, openRecall, openDrill: setDrill, openReview: setReview, logSitting: setSitting,
  }), [tab, take, film, openKey, openRecall]);

  return (
    <NavContext value={nav}>
      <TabbedPage tabs={TABS} tab={tab} onTab={setTab} onRefresh={() => { invalidate('/mod/mind/'); void home.refresh(); }} refreshing={home.busy && !!home.data}
        footer={(
          <>
            <SittingSheet bookId={sitting} onClose={() => setSitting(null)} onSay={take} />
            <RecallScreen open={recall} onClose={() => setRecall(false)} />
            <DrillScreen id={drill} onClose={() => setDrill(null)} onStart={take} />
            <ReviewScreen id={review} onClose={() => setReview(null)} onAgain={take} onStage={film} />
            <TakeFlow run={run} onClose={() => setRun(null)} />
            <StageFlow run={stage} onClose={() => setStage(null)} onDone={(id) => { setStage(null); setTab('speak'); setReview(id); }}
              onVoice={(spec) => { setStage(null); take(spec); }} />
            <VoiceKeySheet open={keyOpen} onClose={() => setKeyOpen(false)} />
          </>
        )}>
        <TabPanel active={tab === 'today'}><TodayTab read={home} /></TabPanel>
        <TabPanel active={tab === 'read'}><ReadTab active={tab === 'read'} /></TabPanel>
        <TabPanel active={tab === 'learn'}><LearnTab active={tab === 'learn'} /></TabPanel>
        <TabPanel active={tab === 'speak'}><SpeakTab active={tab === 'speak'} /></TabPanel>
      </TabbedPage>
    </NavContext>
  );
}
