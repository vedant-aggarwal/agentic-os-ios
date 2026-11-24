import { Redirect } from 'expo-router';

// A link or path with no screen (an old push, a mistyped widget link) lands on Today instead of a dead page.
export default function NotFound() {
  return <Redirect href="/" />;
}
