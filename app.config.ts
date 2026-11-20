import type { ConfigContext, ExpoConfig } from 'expo/config';

// CI sets IOS_BUILD_NUMBER (the workflow run number) so every TestFlight upload gets a new build number.
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  ios: {
    ...config.ios,
    buildNumber: process.env.IOS_BUILD_NUMBER || config.ios?.buildNumber,
  },
});
