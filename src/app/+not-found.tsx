import { Redirect } from 'expo-router';
import { Platform } from 'react-native';
import Index from './index';

// A link or path with no screen (an old push, a mistyped widget link) lands on Today instead of a dead page.
// The web preview is served under a path (https://preview.norrita.com/<id>/?demo&aspect=body), which the router does
// not know: in a dev web build an unknown path is that prefix, so it shows the app as it is at the root.
export default function NotFound() {
  return Platform.OS === 'web' && __DEV__ ? <Index /> : <Redirect href="/" />;
}
