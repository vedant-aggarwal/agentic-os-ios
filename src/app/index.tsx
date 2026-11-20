import { OutOfDate } from '@/components/OutOfDate';
import { missingNative } from '@/lib/native';

// Checked once per JS load: native modules can't appear without reinstalling the app.
const missing = missingNative();

export default function Index() {
  if (missing.length) return <OutOfDate missing={missing} />;
  // Required only after the check: importing react-native-svg on an old build throws before anything renders.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Today = (require('@/screens/Today') as typeof import('@/screens/Today')).default;
  return <Today />;
}
