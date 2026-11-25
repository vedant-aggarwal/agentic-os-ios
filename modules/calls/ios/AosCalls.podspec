Pod::Spec.new do |s|
  s.name           = 'AosCalls'
  s.version        = '1.0.0'
  s.summary        = "Nora's calls on the iPhone's own call screen"
  s.description    = "PushKit VoIP token and pushes, each reported to CallKit, the call audio relayed through the PC (NoraRelay), and Nora's phone line: listening, taking over, the Live Activity's tokens, the notification buttons and the call blocking list (Line*.swift)."
  s.license        = 'UNLICENSED'
  s.author         = 'Norrita'
  s.homepage       = 'https://github.com/vedant-aggarwal/agentic-os-ios'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: 'https://github.com/vedant-aggarwal/agentic-os-ios.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  # the line's notification buttons join expo-notifications' notification center delegate (LineNotifications)
  s.dependency 'ExpoNotifications'

  s.source_files = "**/*.{h,m,swift}"
  s.frameworks = 'CallKit', 'PushKit', 'AVFoundation', 'Security', 'ActivityKit', 'UserNotifications'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES'
  }
end
