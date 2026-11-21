// The Agentic OS keyboard: dictation (the app records it as a GPT take; the keyboard shows the words as they come and
// inserts them), Rewrite and Reply (the PC's /kb endpoints), recent takes, and letter keys. Ported from the old
// Swift app's AgenticKeyboard. It reads the sign-in from the shared keychain group (modules/shared-auth).
/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: 'keyboard',
  name: 'AgenticKeyboard',
  displayName: 'Agentic OS',
  bundleIdentifier: '.keyboard',
  deploymentTarget: '17.0',
  frameworks: ['SwiftUI', 'Photos', 'Security'],
  entitlements: { 'keychain-access-groups': [`$(AppIdentifierPrefix)${config.ios.bundleIdentifier}.shared`] },
});
