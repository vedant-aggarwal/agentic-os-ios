import { requireOptionalNativeModule } from 'expo';
import { AppState, Platform } from 'react-native';

// The home and lock screen widgets (targets/controls/TodayWidgets.swift) fetch GET /today themselves on a timeline.
// The app asks them to fetch again when it goes to the background, so what he just changed shows on the home screen.
// Pages that change the day can call refreshWidgets() too.

const shared = Platform.OS === 'ios' ? requireOptionalNativeModule<{ reloadWidgets?: () => void }>('SharedAuth') : null;

export function refreshWidgets() {
  try { shared?.reloadWidgets?.(); } catch {}
}

/** Mounted once by the root layout. Returns the cleanup. */
export function startWidgets(): () => void {
  if (!shared?.reloadWidgets) return () => {};
  const app = AppState.addEventListener('change', (s) => { if (s === 'background') refreshWidgets(); });
  return () => app.remove();
}
