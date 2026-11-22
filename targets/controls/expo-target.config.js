// The iPhone Action button (and Control Center / the Lock Screen) control for PC command mode.
// Press once: Wispr on the PC starts listening for a command. Press again: it stops and the PC agent runs it.
// The same WidgetKit extension also holds the Today and Next task widgets and the snoozed alarm's Live Activity, so
// they need no bundle ID or provisioning profile of their own (scripts/ios_manual_signing.rb signs it as .controls).
/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: 'widget',
  name: 'AgenticControls',
  displayName: 'Agentic OS',
  bundleIdentifier: '.controls',
  deploymentTarget: '18.0',
  frameworks: ['SwiftUI', 'WidgetKit', 'AppIntents', 'Security', 'ActivityKit'],
  // The app writes the sign-in into this shared keychain group (modules/shared-auth); the control reads it.
  entitlements: { 'keychain-access-groups': [`$(AppIdentifierPrefix)${config.ios.bundleIdentifier}.shared`] },
});
