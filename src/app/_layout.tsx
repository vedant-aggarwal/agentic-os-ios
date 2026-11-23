import { Geist_400Regular, Geist_500Medium, Geist_600SemiBold, useFonts } from '@expo-google-fonts/geist';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { FileViewer } from '@/components/FileViewer';
import { startAlarms } from '@/lib/alarms';
import { startCalls } from '@/lib/calls';
import '@/lib/log'; // sends phone-side errors to the PC log
import { missingNative } from '@/lib/native';
import { startPush } from '@/lib/push';
import { startWidgets } from '@/lib/widgets';
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
  // Notification taps, Nora's calls on the system call screen, alarms' Open button and the home screen widgets.
  // Each is a no-op on the web and on a build without its native module.
  useEffect(() => {
    const stops = [startPush(), startCalls(), startAlarms(), startWidgets()];
    return () => stops.forEach((stop) => stop());
  }, []);
  if (!loaded && !error) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: C.scene }}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.scene } }} />
      {WorkSheets ? <WorkSheets /> : null}
      <FileViewer />
    </GestureHandlerRootView>
  );
}
