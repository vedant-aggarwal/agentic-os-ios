// A line call's decision notification (LINE_DECISION, line calls v2 contract §4) with one button per option, so he can
// choose from the notification. Each decision gets its own category, made here as the push arrives; the app posts the
// choice (modules/calls/ios/LineNative.swift LineNotifications). iOS runs this only for a push with
// "mutable-content": 1. Signed as <app>.notify (scripts/ios_manual_signing.rb).
/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: 'notification-service',
  name: 'AgenticNotify',
  displayName: 'Agentic OS',
  bundleIdentifier: '.notify',
  deploymentTarget: '17.0',
  frameworks: ['UserNotifications', 'Security'],
  // the sign-in, to fetch a decision's options when the push doesn't carry them
  entitlements: { 'keychain-access-groups': [`$(AppIdentifierPrefix)${config.ios.bundleIdentifier}.shared`] },
});
