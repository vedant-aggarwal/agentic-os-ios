// "Open on PC" in the iPhone share sheet: share a link, a photo, a PDF from WhatsApp, any file, or text from any app.
// Links open in the PC's browser; files go to Downloads\From Phone and open with their usual app; plain text lands on
// the PC clipboard. It reads the sign-in from the shared keychain group (modules/shared-auth), like the keyboard.
/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: 'share',
  name: 'AgenticShare',
  displayName: 'Open on PC',
  bundleIdentifier: '.share',
  deploymentTarget: '17.0',
  frameworks: ['SwiftUI', 'UniformTypeIdentifiers', 'Security'],
  entitlements: { 'keychain-access-groups': [`$(AppIdentifierPrefix)${config.ios.bundleIdentifier}.shared`] },
});
