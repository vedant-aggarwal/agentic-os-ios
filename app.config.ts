import type { ConfigContext, ExpoConfig } from 'expo/config';

// CI sets IOS_BUILD_NUMBER (100 + the workflow run number) so every TestFlight upload
// is higher than the old Capacitor builds of the same bundle id.
// WEB_SPA=1 serves the web preview as a plain single-page app: Metro's dev server rendering runs out of memory on
// this PC while files change, and a preview doesn't need it.
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  ios: {
    ...config.ios,
    buildNumber: process.env.IOS_BUILD_NUMBER || config.ios?.buildNumber,
  },
  ...(process.env.WEB_SPA === '1' ? { web: { ...config.web, output: 'single' as const } } : {}),
});
