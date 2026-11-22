import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, type ListRenderItem, Platform, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Glass } from '@/components/Glass';
import { Sym } from '@/components/Sym';
import { C, F } from '@/theme';
import type { Engine, JobFull } from '../types';
import type { ChangeFile, Row } from './model';
import { ChangesRow, NoteRow, PermissionRow, PlanRow, StepsRow, TextRow, UserRow } from './rows';
import { IcDown, Press } from './ui';

// The thread, newest at the bottom. An inverted FlatList: only visible rows render, it opens at the latest message,
// and maintainVisibleContentPosition keeps what he is reading still while new text streams in below. Near the bottom
// it follows the stream; scrolled up, a button brings him back.

type Props = {
  rows: Row[];
  job: JobFull | null;
  top: number; // room for the header at the visual top
  bottom: number; // room for the reply box, which floats over the list
  more: boolean;
  older: 'idle' | 'loading' | 'error';
  onOlder: () => void;
  permBusy: string | null;
  onAnswer: (requestId: string, optionId: string) => void;
  onOpenDiff: (turn: number, files: ChangeFile[], index: number) => void;
};

const AWAY = 320; // scrolled this far up from the latest, the jump button shows

const shortPath = (p: string | null) => (p ? p.replace(/^[A-Za-z]:\\Users\\[^\\]+/, '~') : null);
const clock = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const same = d.toDateString() === new Date().toDateString();
  const t = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return same ? t : `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })}, ${t}`;
};

function Top({ job, more, older, onOlder }: { job: JobFull | null; more: boolean; older: Props['older']; onOlder: () => void }) {
  if (more) {
    if (older === 'loading') return <View style={s.top}><ActivityIndicator size="small" color={C.faint} /></View>;
    return (
      <Press haptic={false} accessibilityLabel="Load earlier messages" onPress={onOlder} style={s.top}>
        <Text style={s.topText}>{older === 'error' ? "Earlier messages didn't load. Tap to try again." : 'Earlier messages'}</Text>
      </Press>
    );
  }
  if (!job) return <View style={s.top} />;
  const where = shortPath(job.folder);
  return (
    <View style={s.top}>
      <Text style={s.topText}>Started {clock(job.createdAt)}</Text>
      {where ? <Text style={s.topText} numberOfLines={1} ellipsizeMode="head">{where}</Text> : null}
    </View>
  );
}

export function ThreadList({ rows, job, top, bottom, more, older, onOlder, permBusy, onAnswer, onOpenDiff }: Props) {
  const list = useRef<FlatList<Row>>(null);
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [away, setAway] = useState(false);
  const data = useMemo(() => [...rows].reverse(), [rows]);
  const engine: Engine = job?.engine ?? 'claude';

  const toggle = useCallback((key: string) => {
    setOpen((set) => { const n = new Set(set); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  }, []);

  const render = useCallback<ListRenderItem<Row>>(({ item }) => {
    switch (item.kind) {
      case 'user': return <UserRow row={item} />;
      case 'text': return <TextRow row={item} />;
      case 'steps': return <StepsRow row={item} open={open.has(item.key)} onToggle={toggle} />;
      case 'plan': return <PlanRow row={item} />;
      case 'permission': return <PermissionRow row={item} engine={engine} busy={permBusy} onAnswer={onAnswer} />;
      case 'changes': return <ChangesRow row={item} onOpen={onOpenDiff} />;
      case 'note': return <NoteRow row={item} />;
    }
  }, [open, toggle, engine, permBusy, onAnswer, onOpenDiff]);

  return (
    <View style={s.wrap}>
      <FlatList
        ref={list}
        inverted
        data={data}
        keyExtractor={(r) => r.key}
        renderItem={render}
        extraData={open}
        ItemSeparatorComponent={Gap}
        ListFooterComponent={<Top job={job} more={more} older={older} onOlder={onOlder} />}
        contentContainerStyle={[s.content, { paddingBottom: top, paddingTop: bottom + 16 }]}
        onEndReached={() => { if (more && older === 'idle') onOlder(); }}
        onEndReachedThreshold={0.6}
        maintainVisibleContentPosition={{ minIndexForVisible: 0, autoscrollToTopThreshold: 120 }}
        initialNumToRender={12}
        maxToRenderPerBatch={8}
        windowSize={11}
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={100}
        onScroll={(e) => { const a = e.nativeEvent.contentOffset.y > AWAY; if (a !== away) setAway(a); }}
      />
      {away ? (
        <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)} style={[s.jumpWrap, { bottom: bottom + 12 }]}>
          <Press accessibilityLabel="Jump to the latest" onPress={() => list.current?.scrollToOffset({ offset: 0, animated: true })} style={s.jump}>
            <Glass radius={22} />
            <View><Sym name="arrow.down" size={16} color={C.text} fallback={<IcDown size={16} color={C.text} />} /></View>
          </Press>
        </Animated.View>
      ) : null}
    </View>
  );
}

const Gap = () => <View style={s.gap} />;

const s = StyleSheet.create({
  wrap: { flex: 1 },
  content: { paddingHorizontal: 16 },
  gap: { height: 16 },
  top: { minHeight: 48, alignItems: 'center', justifyContent: 'center', gap: 2, paddingBottom: 16 },
  topText: { fontFamily: F.medium, fontSize: 12, lineHeight: 16, color: C.faint, textAlign: 'center' },
  jumpWrap: { position: 'absolute', right: 16 },
  jump: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' },
});
