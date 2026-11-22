import { Geist_400Regular, Geist_500Medium, Geist_600SemiBold, useFonts } from '@expo-google-fonts/geist';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import '@/lib/log'; // sends phone-side errors to the PC log
import { missingNative } from '@/lib/native';
import { C } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

// The Projects hub's sheets (idea, task, job, project, push to talk) sit over every screen. Required only on a build
// that has the native pieces they draw with; an older build shows OutOfDate from index.tsx instead.
const WorkSheets = missingNative().length
  ? null
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  : (require('@/work/sheets/WorkSheets') as typeof import('@/work/sheets/WorkSheets')).WorkSheets;

export default function RootLayout() {
  const [loaded, error] = useFonts({ Geist_400Regular, Geist_500Medium, Geist_600SemiBold });
  useEffect(() => { if (loaded || error) SplashScreen.hideAsync().catch(() => {}); }, [loaded, error]);
  if (!loaded && !error) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: C.scene }}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.scene } }} />
      {WorkSheets ? <WorkSheets /> : null}
    </GestureHandlerRootView>
  );
}
