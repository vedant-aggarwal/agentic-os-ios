import { SignedIn } from '@/line/parts';
import { LineSetup } from '@/line/Setup';

// Forwarding to Nora's line, the line's status, and call blocking on the phone (src/line/Setup.tsx).
export default function LineSetupPage() {
  return <SignedIn><LineSetup /></SignedIn>;
}
