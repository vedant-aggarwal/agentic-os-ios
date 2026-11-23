import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Backdrop } from '@/components/Backdrop';
import { Glass } from '@/components/Glass';
import { Smiley } from '@/components/Smiley';
import { gaze, gazeTouch } from '@/lib/gaze';
import { heartBurst, pet, petDrive, petReact, type PetFace, rubEnd, rubMove, rubStart } from '@/lib/pet';
import { C, F } from '@/theme';

// Dev page for the mood pet (`/?demo&petlab` or `/petlab?demo` in the web preview): the logger's big pet and the top
// bar's small one side by side, with every input the app gives it. URL: sad=0..1, drive=1 val=-1..1 nrg=-1..1 (the logger's grid point),
// think=1, worry=1, face=<reaction>, rub=1 (a rub when it opens), size=<big pet's pt>. The mouse is the finger.
const FACES: PetFace[] = ['happy', 'excited', 'calm', 'proud', 'concerned', 'sad', 'tired', 'angry'];
const CORNERS: [string, number, number][] = [['neutral', 0, 0], ['joyful, wired', 1, 1], ['calm, content', 0.8, -0.8], ['angry, wired', -1, 1], ['drained, sad', -1, -1]];
const Q = Platform.OS === 'web' && typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
const num = (k: string, d: number) => (Q.has(k) && Number.isFinite(Number(Q.get(k))) ? Number(Q.get(k)) : d);

function autoRub() {
  rubStart();
  let i = 0;
  const t = setInterval(() => {
    i++;
    rubMove(6 * Math.cos(i * 0.45), 1.5 * Math.sin(i * 0.9), 26 + 13 * Math.sin(i * 0.45), 22 + 4 * Math.cos(i * 0.9));
    if (i > 70) { clearInterval(t); rubEnd(); }
  }, 30);
}

function Chip({ label, on, onPress }: { label: string; on?: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[s.chip, on && s.chipOn]}>
      <Text style={[s.chipText, on && s.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

function SmallPet({ sad }: { sad: number }) {
  const rub = usePanGesture({
    minDistance: 3,
    runOnJS: true,
    onActivate: () => rubStart(),
    onUpdate: (e) => rubMove(e.changeX ?? 0, e.changeY ?? 0, e.x, e.y),
    onDeactivate: () => rubEnd(),
    onFinalize: () => rubEnd(),
  });
  return (
    <GestureDetector gesture={rub}>
      <View style={s.round}>
        <Glass radius={26} />
        <Smiley size={30} sadness={sad} always />
      </View>
    </GestureDetector>
  );
}

export function PetLab() {
  const insets = useSafeAreaInsets();
  const [sad, setSad] = useState(num('sad', 0));
  const [corner, setCorner] = useState<string | null>(Q.has('drive') ? 'url' : null);
  const [think, setThink] = useState(num('think', 0) > 0);
  const [worry, setWorry] = useState(num('worry', 0) > 0);
  const big = num('size', 200);

  useEffect(() => {
    if (Q.has('drive')) { petDrive(true); pet.val.set(num('val', 0)); pet.nrg.set(num('nrg', 0)); }
    const face = Q.get('face') as PetFace | null;
    const t1 = face && FACES.includes(face) ? setTimeout(() => petReact(face), 800) : null;
    const t2 = Q.has('rub') ? setTimeout(autoRub, 800) : null;
    return () => { if (t1) clearTimeout(t1); if (t2) clearTimeout(t2); petDrive(false); };
  }, []);
  useEffect(() => { pet.think.set(think ? 1 : 0); }, [think]);
  useEffect(() => { pet.worry.set(worry ? 1 : 0); }, [worry]);

  const pickCorner = (name: string, v: number, e: number) => {
    if (corner === name) { setCorner(null); petDrive(false); return; }
    setCorner(name); petDrive(true); pet.val.set(v); pet.nrg.set(e);
  };
  // on the web the mouse is the finger
  const hover = Platform.OS === 'web' ? {
    onPointerMove: (e: { nativeEvent: { pageX: number; pageY: number } }) => gaze.set({ x: e.nativeEvent.pageX, y: e.nativeEvent.pageY, active: true, at: Date.now() }),
    onPointerLeave: () => gaze.set({ ...gaze.get(), active: false, at: Date.now() }),
  } : {};

  if (!__DEV__) return null;
  return (
    <View style={s.screen} {...gazeTouch} {...hover}>
      <Backdrop />
      <ScrollView contentContainerStyle={[s.body, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 40 }]}>
        <Text style={s.title}>Pet lab</Text>
        <Text style={s.line}>Move the mouse to be the finger. Drag across the small button to rub it.</Text>
        <View style={s.stage}>
          <View style={{ width: big, height: big, marginTop: big * 0.85 }}><Smiley size={big} sadness={sad} always /></View>
          <View style={s.bar}><SmallPet sad={sad} /></View>
        </View>
        <Text style={s.label}>Sadness (hours without a mood)</Text>
        <View style={s.row}>{[0, 0.3, 0.6, 1].map((v) => <Chip key={v} label={String(v)} on={sad === v} onPress={() => setSad(v)} />)}</View>
        <Text style={s.label}>Logger grid point</Text>
        <View style={s.row}>{CORNERS.map(([n, v, e]) => <Chip key={n} label={n} on={corner === n} onPress={() => pickCorner(n, v, e)} />)}</View>
        <Text style={s.label}>Reactions</Text>
        <View style={s.row}>{FACES.map((f) => <Chip key={f} label={f} onPress={() => petReact(f)} />)}</View>
        <Text style={s.label}>More</Text>
        <View style={s.row}>
          <Chip label="thinking" on={think} onPress={() => setThink(!think)} />
          <Chip label="worried" on={worry} onPress={() => setWorry(!worry)} />
          <Chip label="hearts" onPress={() => heartBurst(4)} />
          <Chip label="rub it" onPress={autoRub} />
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.scene },
  body: { paddingHorizontal: 16, gap: 8 },
  title: { fontFamily: F.semibold, fontSize: 20, lineHeight: 28, color: C.text },
  line: { fontFamily: F.regular, fontSize: 14, lineHeight: 20, color: C.muted },
  stage: { alignItems: 'center', gap: 28, paddingVertical: 12 },
  bar: { width: 120, height: 92, alignItems: 'center', justifyContent: 'flex-end' },
  round: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', boxShadow: '0 12px 28px rgba(0,0,0,0.4)' },
  label: { fontFamily: F.medium, fontSize: 13, lineHeight: 18, color: C.muted, marginTop: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, height: 32, borderRadius: 16, justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  chipOn: { backgroundColor: '#FFE7B0' },
  chipText: { fontFamily: F.medium, fontSize: 13, color: C.text },
  chipTextOn: { color: '#1A1408' },
});
