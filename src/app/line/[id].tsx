import { CallRoute } from '@/line/CallRoute';
import { SignedIn } from '@/line/parts';

// One call on Nora's line: live while it's on, its page after (src/line/CallRoute.tsx). agenticos://line/<callId>.
export default function LineCall() {
  return <SignedIn><CallRoute /></SignedIn>;
}
