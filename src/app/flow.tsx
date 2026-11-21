import { Redirect, useLocalSearchParams } from 'expo-router';
import { requestKeyboardTake } from '@/lib/kbmic';

// agenticos://flow?id=<take id>: the keyboard wants the mic (src/lib/kbmic.ts). Start that take, show Today.
export default function Flow() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  if (id) requestKeyboardTake(String(id));
  return <Redirect href="/" />;
}
