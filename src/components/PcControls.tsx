import { BlurView } from 'expo-blur';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { lightTap } from '@/components/Glass';
import { MediaPanel } from '@/components/MediaRemote';
import { CameraPanel } from '@/components/PhoneCam';
import { AwayCard } from '@/components/AwayCard';
import { PowerPanel } from '@/components/PcPower';
import { Sym } from '@/components/Sym';
import { usePointer } from '@/lib/pointer';
import { C, F } from '@/theme';

// PC controls without opening the remote screen: hold the top bar's Remote PC button. Two tabs: the media remote and
// power, and the phone camera as the PC webcam. Media and power are also in the remote session's menu.
export type PcTab = 'media' | 'power' | 'camera';

export function PcControls({ tab, onTab, onClose }: { tab: PcTab | null; onTab: (t: PcTab) => void; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const pc = usePointer(tab === 'media');
  const [shown, setShown] = useState<PcTab>('media');
  const t = tab ?? shown;
  return (
    <Modal visible={!!tab} transparent animationType="slide" onRequestClose={onClose} onShow={() => { if (tab) setShown(tab); }}
      supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.4)' }]} onPress={onClose} accessibilityLabel="Close" />
      <View style={[s.sheet, { paddingBottom: insets.bottom + 16, maxHeight: height * 0.88 }]}>
        <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(12,13,18,0.72)' }]} />
        <View style={s.head}>
          <View style={s.tabs}>
            {(['media', 'camera', 'power'] as const).map((k) => (
              <Pressable key={k} accessibilityRole="tab" accessibilityState={{ selected: t === k }} onPress={() => { lightTap(); onTab(k); }}
                style={[s.tab, t === k && s.tabOn]}>
                <Text style={[s.tabText, t === k && { color: '#111' }]}>{k === 'media' ? 'Media' : k === 'camera' ? 'Camera' : 'Power'}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} onPress={() => { lightTap(); onClose(); }} style={s.close}>
            <Sym name="xmark" size={14} color="#fff" fallback={<Text style={s.tabText}>×</Text>} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: 4 }}>
          {t === 'media' ? <MediaPanel open={tab === 'media'} onKey={(k) => pc.key(k)} /> : t === 'camera' ? <CameraPanel open={tab === 'camera'} /> : <View style={{ gap: 14 }}><PowerPanel /><AwayCard open={tab === 'power'} /></View>}
        </ScrollView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 18, paddingTop: 14, gap: 14, overflow: 'hidden',
    borderTopLeftRadius: 28, borderTopRightRadius: 28, borderCurve: 'continuous',
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tabs: { flex: 1, flexDirection: 'row', gap: 6, padding: 4, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.08)' },
  tab: { flex: 1, height: 34, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  tabOn: { backgroundColor: C.text },
  tabText: { fontFamily: F.semibold, fontSize: 14, lineHeight: 18, color: C.text },
  close: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.1)' },
});
