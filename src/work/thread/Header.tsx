import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Glass } from '@/components/Glass';
import { Sym } from '@/components/Sym';
import { C, F } from '@/theme';
import type { JobFull } from '../types';
import { busyStatus } from './Composer';
import { statusPhrase } from './model';
import { Pulse } from './rows';
import { ATTN, IcBack, IcMore, IcStop, LIVE, Press } from './ui';

// The thread's bar, in the top bar's glass: back, the title with what the agent is doing, Stop while a turn runs, and
// the menu. Content scrolls under it.

export const BAR_H = 52;
export const BAR_GAP = 6;

const tone = (s: JobFull['status'] | undefined) =>
  s === 'running' || s === 'starting' ? LIVE : s === 'needs_input' ? ATTN : s === 'failed' ? C.danger : C.muted;

export function Header({ top, job, offline, onStop, onMenu }: {
  top: number; job: JobFull | null; offline: boolean; onStop: () => void; onMenu: () => void;
}) {
  const router = useRouter();
  const back = () => { if (router.canGoBack()) router.back(); else router.replace('/'); };
  const busy = busyStatus(job?.status);
  const phrase = offline ? 'Offline. Showing the saved copy.' : job ? statusPhrase(job) : 'Loading';
  return (
    <View pointerEvents="box-none" style={[s.row, { top: top + BAR_GAP }]}>
      <Press accessibilityLabel="Back" onPress={back} style={s.round} scale={0.92}>
        <Glass radius={BAR_H / 2} />
        <View><Sym name="chevron.left" size={18} color={C.text} fallback={<IcBack size={18} />} /></View>
      </Press>
      <View style={[s.pill, busy && s.pillStop]}>
        <Glass radius={BAR_H / 2} />
        {job?.status === 'running' || job?.status === 'starting' ? <Pulse /> : job?.status === 'needs_input' ? <View style={s.attn} /> : null}
        <View style={s.titles}>
          <Text style={s.title} numberOfLines={1} accessibilityRole="header">{job?.title || 'Job'}</Text>
          <Text style={[s.phrase, { color: offline ? C.muted : tone(job?.status) }]} numberOfLines={1}>{phrase}</Text>
        </View>
        {busy ? (
          <Press accessibilityLabel="Stop the turn" onPress={onStop} style={s.stop}>
            <Sym name="stop.fill" size={12} color="#fff" fallback={<IcStop size={11} />} />
            <Text style={s.stopText}>Stop</Text>
          </Press>
        ) : null}
      </View>
      <Press accessibilityLabel="More" disabled={!job} onPress={onMenu} style={s.round} scale={0.92}>
        <Glass radius={BAR_H / 2} />
        <View><Sym name="ellipsis" size={18} color={C.text} fallback={<IcMore size={18} />} /></View>
      </Press>
    </View>
  );
}

const s = StyleSheet.create({
  row: { position: 'absolute', left: 16, right: 16, height: BAR_H, flexDirection: 'row', gap: 8 },
  round: {
    width: BAR_H, height: BAR_H, borderRadius: BAR_H / 2, alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 12px 28px rgba(0,0,0,0.4)',
  },
  pill: {
    flex: 1, height: BAR_H, borderRadius: BAR_H / 2, flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingLeft: 16, paddingRight: 16, boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
  },
  pillStop: { paddingRight: 8 },
  attn: { width: 8, height: 8, borderRadius: 4, backgroundColor: ATTN, boxShadow: `0 0 8px ${ATTN}` },
  titles: { flex: 1, minWidth: 0 },
  title: { fontFamily: F.semibold, fontSize: 16, lineHeight: 20, color: C.text },
  phrase: { fontFamily: F.medium, fontSize: 12, lineHeight: 16 },
  stop: { height: 36, paddingHorizontal: 12, borderRadius: 18, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#E5484D' },
  stopText: { fontFamily: F.semibold, fontSize: 14, lineHeight: 20, color: '#fff' },
});
