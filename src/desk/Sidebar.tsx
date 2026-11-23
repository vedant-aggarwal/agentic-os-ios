import { router, usePathname } from 'expo-router';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Account, Home, Nora, Work } from '@/components/Icons';
import { signOut } from '@/lib/api';
import { ASPECT_COLOR, C, F, FAMILY_ASPECTS, FAMILY_LABEL, type AspectKey, type FamilyKey } from '@/theme';
import { ASPECT_NAME } from '@/aspects/context';
import { desk, NORA_SIDE_MIN, SIDEBAR_W, useDesk } from './store';

const FAMILIES: FamilyKey[] = ['self', 'work', 'people'];

/** The desktop sidebar: Today, the nine aspects in their three families, Projects, then Nora and the account. */
export function Sidebar({ width }: { width: number }) {
  const d = useDesk();
  const path = usePathname();
  const onToday = path === '/' || path === '';
  const go = (view: 'today' | AspectKey) => {
    desk.open(view);
    if (!onToday) router.navigate('/');
  };
  const noraOpen = d.nora ?? width >= NORA_SIDE_MIN;
  return (
    <View style={s.bar}>
      <View style={s.brand}>
        <Image source={require('../../assets/images/logo-128.png')} style={s.mark} accessibilityLabel="Agentic OS logo" />
        <Text style={s.brandText}>Agentic OS</Text>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.list} showsVerticalScrollIndicator={false}>
        <Item label="Today" active={onToday && d.view === 'today'} onPress={() => go('today')} icon={<Home size={18} color={C.textSoft} />} />
        <Item label="Projects" active={path.startsWith('/work')} onPress={() => router.navigate('/work')} icon={<Work size={18} color={C.textSoft} />} />
        {FAMILIES.map((f) => (
          <View key={f} style={s.group}>
            <Text style={s.groupLabel}>{FAMILY_LABEL[f]}</Text>
            {FAMILY_ASPECTS[f].map((a) => {
              const r = d.reach[a];
              return (
                <Item key={a} label={ASPECT_NAME[a]} active={onToday && d.view === a} onPress={() => go(a)}
                  icon={<View style={[s.dot, { backgroundColor: ASPECT_COLOR[a] }]} />}
                  right={r?.total ? `${r.done}/${r.total}` : undefined} />
              );
            })}
          </View>
        ))}
      </ScrollView>
      <View style={s.foot}>
        {onToday ? (
          <Item label={noraOpen ? 'Hide Nora' : 'Nora'} active={false} onPress={() => desk.toggleNora(width >= NORA_SIDE_MIN)}
            icon={<Nora size={18} color={C.textSoft} />} />
        ) : null}
        {d.signedIn ? (
          <Item label="Sign out" active={false} onPress={async () => { await signOut(); location.reload(); }}
            icon={<Account size={18} color={C.faint} />} />
        ) : null}
      </View>
    </View>
  );
}

function Item({ label, active, onPress, icon, right }: {
  label: string; active: boolean; onPress: () => void; icon: React.ReactNode; right?: string;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress}
      style={(st) => [s.item, (st as { hovered?: boolean }).hovered && s.hover, active && s.active]}>
      <View style={s.icon}>{icon}</View>
      <Text numberOfLines={1} style={[s.label, active && { color: C.text }]}>{label}</Text>
      {right ? <Text style={s.right}>{right}</Text> : null}
    </Pressable>
  );
}

const s = StyleSheet.create({
  bar: {
    width: SIDEBAR_W, height: '100%', backgroundColor: 'rgba(10,12,17,0.72)',
    borderRightWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.08)', paddingTop: 20,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingBottom: 20 },
  mark: { width: 30, height: 30, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.12)' },
  brandText: { fontFamily: F.semibold, fontSize: 16, letterSpacing: -0.2, color: C.text },
  list: { paddingHorizontal: 12, gap: 2, paddingBottom: 16 },
  group: { marginTop: 18, gap: 2 },
  groupLabel: { fontFamily: F.medium, fontSize: 12, lineHeight: 16, color: C.faint, paddingHorizontal: 10, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.6 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 36, paddingHorizontal: 10, borderRadius: 10 },
  hover: { backgroundColor: 'rgba(255,255,255,0.04)' },
  active: { backgroundColor: 'rgba(255,255,255,0.08)' },
  icon: { width: 20, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { flex: 1, fontFamily: F.medium, fontSize: 14, lineHeight: 20, color: C.textSoft },
  right: { fontFamily: F.regular, fontSize: 12, color: C.faint, fontVariant: ['tabular-nums'] },
  foot: { padding: 12, gap: 2, borderTopWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.06)' },
});
