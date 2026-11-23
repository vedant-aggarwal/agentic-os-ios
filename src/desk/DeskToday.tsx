import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Backdrop } from '@/components/Backdrop';
import { Notice } from '@/components/Notice';
import { NowCard } from '@/components/NowCard';
import { SignIn } from '@/components/SignIn';
import { Hero } from '@/hero/Hero';
import { ASPECT_NAME, AspectContext, type AspectCtx } from '@/aspects/context';
import type { HostEntry } from '@/aspects/AspectHost';
import { LifeContext } from '@/aspects/_linked/life';
import { PAGES } from '@/aspects/registry';
import { sectionEntry, SECTION_TARGETS } from '@/lib/aspectLinks';
import { useBody } from '@/lib/body';
import { onLink, openLink } from '@/lib/links';
import { invalidate } from '@/lib/mod';
import { useToday } from '@/lib/useToday';
import { ChatBody } from '@/nora/NoraChat';
import { useNora } from '@/nora/state';
import { DayPlan } from '@/today/DayPlan';
import { ASPECT_COLOR, C, F, type AspectKey } from '@/theme';
import { desk, NORA_SIDE_MIN, NORA_W, SIDEBAR_W, useDesk } from './store';

const NO_INSETS = { top: 0, bottom: 0, left: 0, right: 0 };
/** Widest the day plan and an aspect page grow: past this a line of text is too long to read. */
const PAGE_MAX = 820;

/** Today on a desktop browser: the page in the middle, Nora's chat on the right. The sidebar is DeskFrame's. */
export default function DeskToday() {
  const { width, height } = useWindowDimensions();
  const t = useToday();
  const b = useBody(!!t.view);
  const d = useDesk();
  const ui = useNora();
  const [local, setLocal] = useState<string | null>(null);
  const [entry, setEntry] = useState<HostEntry | null>(null);
  const aspect = d.view === 'today' ? null : d.view;
  const { reload, toggle: toggleTask, clearNotice } = t;
  useEffect(() => { if (t.view) desk.setReach(t.view.reach); }, [t.view]);

  const toggle = useCallback(async (id: string) => { await toggleTask(id); invalidate('/mod/mission/'); invalidate('/mod/growth/'); }, [toggleTask]);
  const closeAspect = useCallback(() => { desk.open('today'); setEntry(null); void reload(); }, [reload]);
  const openAspect = useCallback((key: AspectKey) => { setEntry(null); desk.open(key); }, []);
  const doneEntry = useCallback((stamp: number) => setEntry((e) => (e?.stamp === stamp ? null : e)), []);
  const { addWater } = b;
  const water = useCallback(async () => { const e = await addWater(); if (e) setLocal(e); }, [addWater]);

  // Links into a section open that page and hand it the part, as on the phone; agenticos://today comes back here.
  useEffect(() => {
    const offs = SECTION_TARGETS.map((target) => onLink(target, (link) => {
      const e = sectionEntry(link);
      if (!e) return;
      desk.open(e.aspect);
      setEntry(e);
    }));
    offs.push(onLink('today', () => closeAspect()));
    return () => { for (const off of offs) off(); };
  }, [closeAspect]);

  // Back: Escape closes what a page has open on top, then the page itself.
  const backs = useRef<(() => void)[]>([]);
  const onBack = useCallback((handler: () => void) => {
    backs.current.push(handler);
    return () => { backs.current = backs.current.filter((h) => h !== handler); };
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !aspect) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const top = backs.current.at(-1);
      if (top) top(); else closeAspect();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [aspect, closeAspect]);

  if (t.state.status === 'loading') return <View style={s.screen} />;
  if (t.state.status === 'signedOut') return <SignIn onDone={t.reload} />;
  if (t.state.status === 'error' || !t.view) {
    return (
      <View style={[s.screen, s.center]}>
        <Text style={s.errTitle}>Today didn&apos;t load</Text>
        <Text style={s.errBody}>{t.state.status === 'error' ? t.state.message : ''}</Text>
        <Pressable accessibilityRole="button" onPress={t.reload} style={s.retry}><Text style={s.retryText}>Try again</Text></Pressable>
      </View>
    );
  }

  const v = t.view;
  const noraOpen = d.nora ?? width >= NORA_SIDE_MIN;
  const mainW = width - SIDEBAR_W - (noraOpen ? NORA_W : 0);
  const pageW = Math.min(mainW - 48, PAGE_MAX);
  const empty = !v.sections.length && !b.body;

  return (
    <View style={s.screen}>
      <Backdrop />
      <LifeContext value={{ sections: v.sections, areaAspects: t.state.life.areaAspects, toggle }}>
      <View style={[s.main, { width: mainW }]}>
        {aspect ? (
          <AspectPane key={aspect} aspect={aspect} width={pageW} height={height} entry={entry} onEntryDone={doneEntry}
            onClose={closeAspect} onOpen={openAspect} onNotice={setLocal} onBack={onBack} />
        ) : (
          <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator>
            <View style={[s.head, { width: pageW }]}>
              <View style={{ flex: 1 }}>
                <Text style={s.date}>{v.dateLabel}</Text>
                <Text style={s.title}>Today</Text>
              </View>
              <Pressable accessibilityRole="button" onPress={() => { t.refresh(); b.reload(); }}
                style={(st) => [s.ghost, (st as { hovered?: boolean }).hovered && s.ghostHover]}>
                <Text style={s.ghostText}>{t.refreshing ? 'Refreshing…' : 'Refresh'}</Text>
              </Pressable>
            </View>
            <View style={[s.heroCard, { width: pageW }]}>
              <Hero view={v} top={0} topBar={0} active={!aspect} width={pageW} />
            </View>
            <View style={[s.plan, { width: pageW }]}>
              <NowCard moment={v.moment} onDone={toggle} />
              <DayPlan sections={v.sections} body={b.body} onToggle={toggle} onOpen={openLink} onWater={water} />
              {empty ? <Text style={s.emptyText}>Nothing due today or carried over. Add tasks with agentos on the PC.</Text> : null}
            </View>
          </ScrollView>
        )}
        <Notice text={local ?? t.notice} bottom={24} onClear={() => { setLocal(null); clearNotice(); }} />
      </View>
      </LifeContext>
      {noraOpen ? (
        <View style={s.nora}>
          <ChatBody open mic={ui.mic} replyTo={ui.replyTo} onClose={() => desk.toggleNora(width >= NORA_SIDE_MIN)} />
        </View>
      ) : null}
    </View>
  );
}

/** An aspect page in the middle column, at a readable width, under the aspect's own light. */
function AspectPane({ aspect, width, height, entry, onEntryDone, onClose, onOpen, onNotice, onBack }: {
  aspect: AspectKey; width: number; height: number; entry: HostEntry | null; onEntryDone: (stamp: number) => void;
  onClose: () => void; onOpen: (k: AspectKey) => void; onNotice: (text: string) => void; onBack: AspectCtx['onBack'];
}) {
  const Page = PAGES[aspect];
  const color = ASPECT_COLOR[aspect];
  const ctx: AspectCtx = {
    aspect, color, open: true, close: onClose, insets: NO_INSETS, width, height, dock: 24,
    notice: onNotice, setImmersive: () => {}, openAspect: onOpen, onBack,
    entry: entry && entry.aspect === aspect ? entry : null, doneEntry: onEntryDone,
  };
  return (
    <View style={s.pane}>
      <View pointerEvents="none" style={[s.light, { backgroundImage: `radial-gradient(ellipse 60% 360px at 50% 0, ${color}33, ${color}0A 45%, transparent 80%)` } as object]} />
      <View style={{ width, flex: 1 }}>
        <AspectContext value={ctx}>
          <Suspense fallback={<View style={s.center}><ActivityIndicator color={color} /></View>}>
            <Page />
          </Suspense>
        </AspectContext>
      </View>
      <Text accessibilityElementsHidden style={s.hint}>{ASPECT_NAME[aspect]} · Esc for Today</Text>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, flexDirection: 'row', backgroundColor: C.scene },
  main: { height: '100%' },
  scroll: { alignItems: 'center', paddingTop: 32, paddingBottom: 64, gap: 24 },
  head: { flexDirection: 'row', alignItems: 'flex-end' },
  date: { fontFamily: F.medium, fontSize: 14, lineHeight: 20, color: C.muted },
  title: { fontFamily: F.semibold, fontSize: 32, lineHeight: 40, letterSpacing: -0.8, color: C.text },
  ghost: { height: 36, paddingHorizontal: 14, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.14)', justifyContent: 'center' },
  ghostHover: { backgroundColor: 'rgba(255,255,255,0.06)' },
  ghostText: { fontFamily: F.medium, fontSize: 14, color: C.textSoft },
  heroCard: { borderRadius: 24, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.08)', backgroundColor: C.bgTop },
  plan: { gap: 24 },
  pane: { flex: 1, alignItems: 'center' },
  light: { position: 'absolute', left: 0, right: 0, top: 0, height: 420 },
  hint: { position: 'absolute', right: 20, bottom: 14, fontFamily: F.regular, fontSize: 12, color: C.faint },
  nora: {
    width: NORA_W, height: '100%', backgroundColor: 'rgba(14,16,22,0.78)',
    borderLeftWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.08)',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  emptyText: { fontFamily: F.regular, fontSize: 16, lineHeight: 24, color: C.muted },
  errTitle: { fontFamily: F.semibold, fontSize: 24, lineHeight: 32, color: C.text },
  errBody: { fontFamily: F.regular, fontSize: 16, lineHeight: 24, color: C.muted, textAlign: 'center' },
  retry: { height: 48, paddingHorizontal: 24, borderRadius: 24, backgroundColor: C.text, alignItems: 'center', justifyContent: 'center' },
  retryText: { fontFamily: F.semibold, fontSize: 16, color: C.scene },
});
