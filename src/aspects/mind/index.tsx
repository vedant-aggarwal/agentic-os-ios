import { useCallback, useMemo, useRef, useState } from 'react';
import { TabbedPage, TabPanel, useAspect, useEntry, useOnReturn } from '@/aspects/kit';
import { invalidate, useGet } from '@/lib/mod';
import { LearnTab } from './Courses';
import { NavContext, TABS, type MindNav, type Tab } from './nav';
import { ReadTab, SittingSheet } from './Read';
import { RecallScreen } from './Recall';
import { ReviewScreen } from './Review';
import { DrillScreen, SpeakTab } from './Speak';
import { TakeFlow, type Run } from './Take';
import { TodayTab } from './Today';
import type { HomeView, TakeSpec } from './types';
import { usePoll } from './ui';

// The Mind page: learn it, then say it. Today is the next step of that loop and the week; Read is the books, the
// lines that stuck and the questions made from them; Learn is the course; Speak is topics, drills and scores. A take,
// recall, a drill, a review and the end of a reading sitting open on top.

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
  const n = useRef(0);
  const take = useCallback((spec: TakeSpec, steps?: string[]) => { n.current += 1; setRun({ spec, n: n.current, steps }); }, []);
  const openRecall = useCallback(() => setRecall(true), []);

  // a take being written down or reviewed shows its score on Today when it lands
  usePoll(() => { void home.refresh(); }, 4000, a.open && tab === 'today' && !!home.data?.pending.length);
  // back from a lesson in the browser, or a tick on Today: the day may have moved on
  useOnReturn(() => invalidate('/mod/mind/'));
  // mind/<part>: read, courses, speak, recall, drill/<id>, review/<id>. mind/checkin (the evening push) lands on Today.
  useEntry((e) => {
    const [p, id] = e.parts;
    setRecall(p === 'recall');
    setDrill(p === 'drill' && id ? id : null);
    setReview(p === 'review' && id ? id : null);
    setSitting(null);
    setTab(p === 'read' || p === 'recall' ? 'read' : p === 'courses' || p === 'learn' ? 'learn' : p === 'speak' || p === 'drill' ? 'speak' : 'today');
  });

  const nav = useMemo<MindNav>(() => ({
    tab, openTab: setTab, take, openRecall, openDrill: setDrill, openReview: setReview, logSitting: setSitting,
  }), [tab, take, openRecall]);

  return (
    <NavContext value={nav}>
      <TabbedPage tabs={TABS} tab={tab} onTab={setTab} onRefresh={() => { invalidate('/mod/mind/'); void home.refresh(); }} refreshing={home.busy && !!home.data}
        footer={(
          <>
            <SittingSheet bookId={sitting} onClose={() => setSitting(null)} onSay={take} />
            <RecallScreen open={recall} onClose={() => setRecall(false)} />
            <DrillScreen id={drill} onClose={() => setDrill(null)} onStart={take} />
            <ReviewScreen id={review} onClose={() => setReview(null)} onAgain={take} />
            <TakeFlow run={run} onClose={() => setRun(null)} />
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
