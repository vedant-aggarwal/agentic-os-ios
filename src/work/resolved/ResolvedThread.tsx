import { type ComponentRef, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Backdrop } from '@/components/Backdrop';
import { EdgeBlur } from '@/components/EdgeBlur';
import { Glass } from '@/components/Glass';
import { Notice } from '@/components/Notice';
import { Sym } from '@/components/Sym';
import { DEMO } from '@/lib/demo';
import { C, F } from '@/theme';
import { workApi } from '../api';
import { demoResolvedRead } from '../demo';
import { useFanProjects, useResolvedItem, useWorkNotice, work } from '../store';
import { Markdown } from '../thread/Markdown';
import { MenuInfo, MenuItem, PopMenu } from '../thread/Overlay';
import { copyText, IcMore, Press } from '../thread/ui';
import type { ResolvedItem, ResolvedTurn } from '../types';
import { ago } from '../ui/format';
import { BackIcon, JobIcon } from '../ui/icons';
import { goBack } from '../ui/nav';
import { resolvedLine } from '../ui/resolved';
import { continueResolved } from '../ui/useResolveFlow';
import { LIVE } from '../ui/tokens';

// A resolved session: the chat the PC saved when he swiped it away, oldest first, read only. Tool calls show as one
// quiet line per run. The button at the bottom (and the hold menu on the list) carries it on in a new job.

const BAR = 56;
const shortPath = (p: string | null) => (p ? p.replace(/^[A-Za-z]:[\\/]Users[\\/][^\\/]+/, '~') : null);

export function ResolvedThread({ id }: { id: string }) {
  const insets = useSafeAreaInsets();
  const listed = useResolvedItem(id);
  const projects = useFanProjects();
  const notice = useWorkNotice();
  const [read, setRead] = useState<{ item: ResolvedItem; turns: ResolvedTurn[] } | null>(DEMO ? demoResolvedRead(id) : null);
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);

  useEffect(() => {
    if (DEMO) return;
    let alive = true;
    workApi.resolvedRead(id).then((r) => { if (alive) { setRead(r); setError(null); } }).catch((e) => { if (alive) setError((e as Error).message); });
    return () => { alive = false; };
  }, [id]);
  useEffect(() => { if (read?.turns.length) setTimeout(() => scroll.current?.scrollToEnd({ animated: false }), 0); }, [read]);

  const item = listed ?? read?.item ?? null;
  const where = item?.project ? projects?.find((p) => p.slug === item.project)?.name ?? item.project : null;
  const copy = (text: string, what: string) => {
    setMenu(false);
    copyText(text).then((ok) => work.notify(ok ? `${what} copied.` : `This build can’t copy. ${what}: ${text}`));
  };

  return (
    <View style={s.screen}>
      <Backdrop />
      <ScrollView ref={scroll} style={s.flex} contentContainerStyle={[s.body, { paddingTop: insets.top + BAR + 24, paddingBottom: insets.bottom + 120 }]}>
        {item ? (
          <View style={s.head}>
            <Text style={s.headLine}>{[resolvedLine(item), where].filter(Boolean).join(' · ')}</Text>
            <Text style={s.headLine}>{`Resolved ${ago(item.resolvedAt)} ago${item.closed ? '' : ' · its tab stayed open on the PC'}`}</Text>
            {item.continuedIn.length ? <Text style={[s.headLine, { color: LIVE }]}>{`Carried on ${ago(item.continuedIn[0].at)} ago`}</Text> : null}
          </View>
        ) : null}
        {error ? <Text style={s.error}>{error}</Text> : null}
        {!read && !error ? <ActivityIndicator color={C.muted} style={{ marginTop: 40 }} /> : null}
        {read?.turns.map((t, i) => <Turn key={i} t={t} />)}
        {read && !read.turns.length ? <Text style={s.quiet}>The PC saved no turns for this one.</Text> : null}
      </ScrollView>

      <View style={[s.bottom, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View pointerEvents="none" style={s.noticeAnchor}>
          <Notice text={notice} bottom={8} onClear={work.clearNotice} />
        </View>
        <Press accessibilityLabel="Continue working on this" disabled={!item} onPress={() => item && continueResolved(item)} style={s.go}>
          <JobIcon size={16} color={C.scene} />
          <Text style={s.goText}>Continue working on this</Text>
        </Press>
      </View>

      <EdgeBlur edge="top" height={insets.top + BAR + 28} strength={30} curve={2} />
      <View style={[s.bar, { top: insets.top + 6 }]}>
        <Press accessibilityLabel="Back" onPress={goBack} style={s.round}>
          <Glass radius={22} />
          <View><BackIcon /></View>
        </Press>
        <View style={s.titleBox}>
          <Text numberOfLines={1} style={s.title}>{item?.title ?? 'Resolved'}</Text>
          <Text numberOfLines={1} style={s.sub}>{item ? `Resolved · ${shortPath(item.folder) ?? 'no folder'}` : 'Loading…'}</Text>
        </View>
        <Press accessibilityLabel="More" disabled={!item} onPress={() => setMenu(true)} style={s.round}>
          <Glass radius={22} />
          <View><Sym name="ellipsis" size={18} color={C.text} fallback={<IcMore size={18} />} /></View>
        </Press>
      </View>

      {menu && item ? (
        <PopMenu top={insets.top + BAR + 2} onClose={() => setMenu(false)}>
          <MenuInfo title={item.title} sub={shortPath(item.folder)} />
          {item.sessionId ? <MenuItem label="Copy session ID" sub={item.sessionId} onPress={() => copy(item.sessionId!, 'Session ID')} /> : null}
          <MenuItem label="Copy saved chat path" sub="For a session on the PC" onPress={() => copy(item.chatFile, 'Path')} />
        </PopMenu>
      ) : null}
    </View>
  );
}

function Turn({ t }: { t: ResolvedTurn }) {
  if (t.role === 'tool') return <Text style={s.tool} numberOfLines={2}>{t.text}</Text>;
  if (t.role === 'note') return <Text style={s.note}>{t.text}</Text>;
  if (t.role === 'user') {
    return (
      <View style={s.userWrap}>
        <View style={s.user}><Text style={s.userText}>{t.text}</Text></View>
      </View>
    );
  }
  return <View style={s.assistant}><Markdown text={t.text} /></View>;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.scene },
  flex: { flex: 1 },
  body: { paddingHorizontal: 16, gap: 10 },
  head: { gap: 2, paddingBottom: 8 },
  headLine: { fontFamily: F.medium, fontSize: 12, lineHeight: 16, color: C.faint },
  bar: { position: 'absolute', left: 16, right: 16, height: BAR - 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  titleBox: { flex: 1, minWidth: 0 },
  title: { fontFamily: F.semibold, fontSize: 17, lineHeight: 22, color: C.text },
  sub: { fontFamily: F.medium, fontSize: 12, lineHeight: 16, color: C.faint },
  quiet: { fontFamily: F.regular, fontSize: 15, lineHeight: 22, color: C.muted },
  error: { fontFamily: F.medium, fontSize: 14, lineHeight: 20, color: C.danger },
  tool: { fontFamily: F.medium, fontSize: 12, lineHeight: 16, color: C.faint, paddingLeft: 4 },
  note: { fontFamily: F.regular, fontSize: 13, lineHeight: 18, color: C.muted, paddingLeft: 10, borderLeftWidth: 2, borderLeftColor: 'rgba(255,255,255,0.15)' },
  userWrap: { alignItems: 'flex-end' },
  user: { maxWidth: '86%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18, borderBottomRightRadius: 6, backgroundColor: 'rgba(255,255,255,0.1)' },
  userText: { fontFamily: F.regular, fontSize: 15, lineHeight: 22, color: C.text },
  assistant: { paddingRight: 8 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 8 },
  noticeAnchor: { position: 'absolute', left: 0, right: 0, bottom: '100%', height: 0, alignItems: 'center' },
  go: { height: 52, borderRadius: 26, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: C.text, boxShadow: '0 12px 32px rgba(0,0,0,0.45)' },
  goText: { fontFamily: F.semibold, fontSize: 16, lineHeight: 22, color: C.scene },
});
