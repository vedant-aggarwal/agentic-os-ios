import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { Press, TabbedPage, TabPanel, tint, useAspect, useEntry, useOnReturn } from '@/aspects/kit';
import { collection, invalidate } from '@/lib/mod';
import { F } from '@/theme';
import { CleanTab } from './Clean';
import { rememberKit, useCleanNow, useOutbox, type Entry } from './data';
import { Editor, type Seed } from './Editor';
import { JournalTab } from './Journal';
import { Moment } from './Moment';
import { NavContext, TABS, type SoulNav, type Tab } from './nav';
import { Gl, PrivacyCover } from './parts';
import { PracticeTab, SitRoom } from './Practice';
import { Slip } from './Slip';
import { TodayTab } from './Today';

// The Soul page: the inner life, kept quiet. Today is a mood in one tap and the practice for the hour; Practice is
// the breath and the sit; Journal is tonight's entry and the ones before, shown only by day; Clean is the day count
// with everything around it. The rough moment is in the header of every tab (Clean holds it in its lead). Outside
// Clean the count is only "Day N".

/** Everything Soul reads, fetched again: pull to refresh, and coming back to the page. */
function reload() {
  invalidate('/mod/soul/');
  for (const [m, c] of [['growth', 'journal'], ['soul', 'sits'], ['soul', 'moods'], ['soul', 'plans'], ['soul', 'urges'], ['soul', 'clean'], ['soul', 'settings']] as const) {
    collection(m, c).refresh().catch(() => {});
  }
}

export default function Soul() {
  const a = useAspect();
  const now = useCleanNow();
  const waiting = useOutbox(a.open); // sends what waited on the phone; never runs while the page is closed
  const [tab, setTab] = useState<Tab>('today');
  const [moment, setMoment] = useState(false);
  const [slip, setSlip] = useState<{ open: boolean; from: { key: string; steps: string[] } | null }>({ open: false, from: null });
  const [editor, setEditor] = useState<{ open: boolean; entry: Entry | null; seed: Seed | null }>({ open: false, entry: null, seed: null });
  const [sit, setSit] = useState({ open: false, mins: 5 });

  // soul/<part>: clean (also soul/blocker, the lock question's push: the plans for risky hours are there), journal,
  // write (a new entry), meditate (Practice), moment (the rough moment).
  useEntry((e) => {
    const p = e.parts[0];
    setTab(p === 'clean' || p === 'blocker' ? 'clean' : p === 'journal' || p === 'write' ? 'journal' : p === 'meditate' ? 'practice' : 'today');
    setMoment(p === 'moment');
    if (p === 'write') setEditor({ open: true, entry: null, seed: {} });
  });
  // back from another app or the lock screen: the day may have rolled, a log may have landed from the PC
  useOnReturn(reload);

  const d = now.data;
  useEffect(() => { rememberKit(d); }, [d]); // the rough moment works from what this phone kept
  const base = useMemo(() => (d ? { reasons: d.reasons, actions: d.actions, plans: d.setup ? d.plans : [] } : null), [d]);

  const nav = useMemo<SoulNav>(() => ({
    tab,
    openTab: setTab,
    moment: () => setMoment(true),
    slip: () => setSlip({ open: true, from: null }),
    write: (seed) => setEditor({ open: true, entry: null, seed }),
    openEntry: (entry) => setEditor({ open: true, entry, seed: null }),
    sit: (mins) => setSit({ open: true, mins }),
  }), [tab]);

  return (
    <NavContext value={nav}>
      <TabbedPage tabs={TABS} tab={tab} onTab={setTab} onRefresh={reload} refreshing={false}
        right={tab !== 'clean' || !d?.setup ? <RoughButton onPress={() => setMoment(true)} /> : undefined}
        footer={(
          <>
            <SitRoom open={sit.open} mins={sit.mins} onClose={() => setSit((x) => ({ ...x, open: false }))} />
            <Editor open={editor.open} entry={editor.entry} seed={editor.seed} onClose={() => setEditor((x) => ({ ...x, open: false }))} />
            <Moment open={moment} base={base} onClose={() => setMoment(false)}
              onSlip={(key, steps) => { setMoment(false); setSlip({ open: true, from: { key, steps } }); }} />
            <Slip open={slip.open} state={d && d.setup ? d : null} from={slip.from} onClose={() => setSlip((x) => ({ ...x, open: false }))} />
            <PrivacyCover />
          </>
        )}>
        <TabPanel active={tab === 'today'}><TodayTab waiting={waiting} /></TabPanel>
        <TabPanel active={tab === 'practice'}><PracticeTab /></TabPanel>
        <TabPanel active={tab === 'journal'}><JournalTab /></TabPanel>
        <TabPanel active={tab === 'clean'}><CleanTab active={tab === 'clean'} /></TabPanel>
      </TabbedPage>
    </NavContext>
  );
}

/**
 * The rough moment in the header, one tap from the top of any tab: tinted, never filled, so each tab keeps its own
 * one lit action, and in the flow, so it never covers what he is reading.
 */
function RoughButton({ onPress }: { onPress: () => void }) {
  const { color } = useAspect();
  return (
    <Press label="Rough moment" onPress={onPress} feel="medium" hitSlop={4}
      style={[s.rough, { backgroundColor: tint(color, 0.14), borderColor: tint(color, 0.4) }]}>
      <Gl k="wind" size={16} color={color} />
      <Text style={[s.roughText, { color }]}>Rough moment</Text>
    </Press>
  );
}

const s = StyleSheet.create({
  rough: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 14, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, borderCurve: 'continuous' },
  roughText: { fontFamily: F.semibold, fontSize: 14, lineHeight: 20 },
});
