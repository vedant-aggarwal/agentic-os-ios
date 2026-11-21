// The iPhone Action button (and Control Center / the Lock Screen) control for PC command mode.
// Press once: Wispr on the PC starts listening for a command. Press again: it stops and the PC agent runs it.
/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: 'widget',
  name: 'AgenticControls',
  displayName: 'Agentic OS',
  bundleIdentifier: '.controls',
  deploymentTarget: '18.0',
  frameworks: ['SwiftUI', 'WidgetKit', 'AppIntents', 'Security'],
  // The app writes the sign-in into this shared keychain group (modules/shared-auth); the control reads it.
  entitlements: { 'keychain-access-groups': [`$(AppIdentifierPrefix)${config.ios.bundleIdentifier}.shared`] },
});
