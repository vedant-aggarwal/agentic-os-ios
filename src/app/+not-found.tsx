import { Unmatched } from 'expo-router';
import { Platform } from 'react-native';
import Index from './index';

// The web preview is served under a path (https://preview.norrita.com/<id>/?demo&aspect=body), which the router
// does not know. In a dev web build an unknown path is that prefix, so it shows the app as it is at the root (the
// page to open comes from the query, not the path). A phone build keeps the router's own screen.
export default function NotFound() {
  return Platform.OS === 'web' && __DEV__ ? <Index /> : <Unmatched />;
}
