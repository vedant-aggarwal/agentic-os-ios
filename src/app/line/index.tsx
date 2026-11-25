import { CallLog } from '@/line/CallLog';
import { SignedIn } from '@/line/parts';

// Nora's line: the call log (src/line). Opened from Today's Calls row, the dock's badge and agenticos://line.
export default function LineCalls() {
  return <SignedIn><CallLog /></SignedIn>;
}
