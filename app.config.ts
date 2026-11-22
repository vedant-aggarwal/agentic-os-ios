import type { ConfigContext, ExpoConfig } from 'expo/config';

// CI sets IOS_BUILD_NUMBER (100 + the workflow run number) so every TestFlight upload
// is higher than the old Capacitor builds of the same bundle id.
// WEB_SPA=1 (or ASPECTS_WEB, set by the dev server the aspect builders shared) serves the web preview as a plain
// single-page app: Metro's dev server rendering runs out of memory on this PC while files change, a preview doesn't
// need it, and each aspect page then loads as its own chunk, so a broken file in one aspect breaks only that aspect.
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  ios: {
    ...config.ios,
    buildNumber: process.env.IOS_BUILD_NUMBER || config.ios?.buildNumber,
  },
  ...(process.env.WEB_SPA === '1' || process.env.ASPECTS_WEB ? { web: { ...config.web, output: 'single' as const } } : {}),
});
