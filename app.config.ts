import type { ConfigContext, ExpoConfig } from 'expo/config';

// CI sets IOS_BUILD_NUMBER (100 + the workflow run number) so every TestFlight upload
// is higher than the old Capacitor builds of the same bundle id.
// ASPECTS_WEB=1 is set only by the dev server the aspect builders share. It serves the web preview as a plain
// single page app, so the page is not first rendered on the server from one bundle that holds all nine aspect
// pages. Each aspect then loads as its own chunk, and a broken file in one aspect breaks only that aspect.
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  ...(process.env.ASPECTS_WEB ? { web: { ...config.web, output: 'single' as const } } : {}),
  ios: {
    ...config.ios,
    buildNumber: process.env.IOS_BUILD_NUMBER || config.ios?.buildNumber,
  },
});
