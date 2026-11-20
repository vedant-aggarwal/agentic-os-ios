import { Platform, TurboModuleRegistry } from 'react-native';

/**
 * Native pieces this JS needs that an older TestFlight dev client may not have.
 * JS loads live from Metro, native code only changes with a new build, so check before rendering.
 */
export function missingNative(): string[] {
  if (Platform.OS === 'web') return [];
  const missing: string[] = [];
  if (!TurboModuleRegistry.get('RNSVGRenderableModule')) missing.push('Drawing (react-native-svg)');
  if (!(globalThis as { expo?: { modules?: Record<string, unknown> } }).expo?.modules?.ExpoSecureStore) {
    missing.push('Saved sign-in (expo-secure-store)');
  }
  return missing;
}

/** Lowest TestFlight build that has everything above. */
export const MIN_BUILD = 102;
