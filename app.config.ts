import type { ConfigContext, ExpoConfig } from 'expo/config';

// CI sets IOS_BUILD_NUMBER (100 + the workflow run number) so every TestFlight upload
// is higher than the old Capacitor builds of the same bundle id.
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  ios: {
    ...config.ios,
    buildNumber: process.env.IOS_BUILD_NUMBER || config.ios?.buildNumber,
  },
});
