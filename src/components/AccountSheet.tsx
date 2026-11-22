import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { R, Sheet, SURF, t } from '@/aspects/kit';
import { lightTap } from '@/components/Glass';
import { signOut } from '@/lib/api';
import { appIconSupported, getAppIcon, setAppIcon, type AppIconChoice } from '@/lib/appIcon';
import { C } from '@/theme';

// Account (the top bar's person button): the app icon, light, dark or following the phone, and signing out.
const LIGHT = require('../../assets/images/app-icon-light.png');
const DARK = require('../../assets/images/app-icon-dark.png');

const CHOICES: { key: AppIconChoice; name: string; sub: string }[] = [
  { key: 'auto', name: 'Automatic', sub: 'Follows dark mode' },
  { key: 'light', name: 'Light', sub: 'Always blue' },
  { key: 'dark', name: 'Dark', sub: 'Always dark' },
];

function Preview({ choice }: { choice: AppIconChoice }) {
  if (choice !== 'auto') return <Image source={choice === 'dark' ? DARK : LIGHT} style={s.icon} contentFit="cover" />;
  // Automatic: the light icon with the dark one over its right half
  return (
    <View style={s.icon}>
      <Image source={LIGHT} style={StyleSheet.absoluteFill} contentFit="cover" />
      <View style={s.half}><Image source={DARK} style={s.halfImg} contentFit="cover" /></View>
    </View>
  );
}

export function AccountSheet({ open, onClose, onSignedOut }: { open: boolean; onClose: () => void; onSignedOut: () => void }) {
  const supported = appIconSupported();
  const [icon, setIcon] = useState<AppIconChoice | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !supported) return;
    let live = true;
    getAppIcon().then((c) => { if (live) setIcon(c); }).catch(() => { if (live) setIcon('auto'); });
    return () => { live = false; };
  }, [open, supported]);

  const pick = async (c: AppIconChoice) => {
    if (!supported || busy || c === icon) return;
    lightTap();
    const before = icon;
    setIcon(c); setBusy(true); setError(null);
    try { await setAppIcon(c); }
    catch { setIcon(before); setError("The icon didn't change. Try again."); }
    finally { setBusy(false); }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Account">
      <View style={s.group}>
        <Text style={t.section}>App icon</Text>
        <View style={s.row}>
          {CHOICES.map((c) => {
            const on = supported && icon === c.key;
            return (
              <Pressable key={c.key} accessibilityRole="radio" accessibilityState={{ selected: on, disabled: !supported }}
                accessibilityLabel={`${c.name} icon. ${c.sub}`} onPress={() => void pick(c.key)}
                style={({ pressed }) => [s.choice, on && s.choiceOn, pressed && supported && s.pressed, !supported && s.off]}>
                <Preview choice={c.key} />
                <Text style={[t.strong, s.center]}>{c.name}</Text>
                <Text style={[t.small, s.center]}>{c.sub}</Text>
              </Pressable>
            );
          })}
        </View>
        {!supported ? <Text style={t.small}>Switching the icon needs the newest build from TestFlight.</Text> : null}
        {error ? <Text style={[t.small, s.error]}>{error}</Text> : null}
      </View>

      <Pressable accessibilityRole="button" onPress={async () => { await signOut(); onClose(); onSignedOut(); }}
        style={({ pressed }) => [s.signOut, pressed && s.pressed]}>
        <Text style={[t.strong, s.signOutText]}>Sign out</Text>
      </Pressable>
    </Sheet>
  );
}

const ICON = 64;
const s = StyleSheet.create({
  group: { gap: 12 },
  row: { flexDirection: 'row', gap: 10 },
  choice: {
    flex: 1, alignItems: 'center', gap: 4, paddingVertical: 14, paddingHorizontal: 6, borderRadius: R.row,
    backgroundColor: SURF.row, borderWidth: 2, borderColor: 'transparent', borderCurve: 'continuous',
  },
  choiceOn: { borderColor: '#4DA8FF', backgroundColor: SURF.card },
  pressed: { backgroundColor: SURF.pressed },
  off: { opacity: 0.5 },
  icon: { width: ICON, height: ICON, borderRadius: ICON * 0.2237, borderCurve: 'continuous', overflow: 'hidden', marginBottom: 6 },
  half: { position: 'absolute', top: 0, bottom: 0, right: 0, width: ICON / 2, overflow: 'hidden' },
  halfImg: { position: 'absolute', top: 0, right: 0, width: ICON, height: ICON },
  center: { textAlign: 'center' },
  error: { color: C.danger },
  signOut: { minHeight: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: SURF.row },
  signOutText: { color: C.danger },
});
