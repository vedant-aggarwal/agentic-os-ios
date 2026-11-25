// Call blocking and caller names for Nora's phone line (line calls v2): numbers blocked from a call stop ringing the
// iPhone, and the callers Nora knows show their name. The app keeps the line's blocklist (GET /nora/line/blocklist)
// in the keychain group it shares with its extensions (modules/calls/ios/LineNative.swift LineDirectory) and asks iOS
// to reload this extension after each change. He turns it on in Settings › Apps › Phone › Call Blocking &
// Identification. Signed as <app>.calldirectory (scripts/ios_manual_signing.rb).
/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: 'call-directory',
  name: 'AgenticCallDirectory',
  displayName: 'Agentic OS',
  bundleIdentifier: '.calldirectory',
  deploymentTarget: '17.0',
  frameworks: ['CallKit', 'Security'],
  entitlements: { 'keychain-access-groups': [`$(AppIdentifierPrefix)${config.ios.bundleIdentifier}.shared`] },
});
