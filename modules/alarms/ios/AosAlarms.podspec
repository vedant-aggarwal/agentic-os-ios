Pod::Spec.new do |s|
  s.name           = 'AosAlarms'
  s.version        = '1.0.0'
  s.summary        = 'Alarms that ring through silent mode for Agentic OS'
  s.description    = 'AlarmKit alarms on iOS 26 (a local notification on older iOS), set from JS or from a silent push.'
  s.license        = 'UNLICENSED'
  s.author         = 'Norrita'
  s.homepage       = 'https://github.com/vedant-aggarwal/agentic-os-ios'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: 'https://github.com/vedant-aggarwal/agentic-os-ios.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = "**/*.{h,m,swift}"
  s.frameworks = 'UserNotifications', 'SwiftUI', 'AppIntents', 'CryptoKit'
  # AlarmKit is iOS 26 only; every use is behind #available, so link it weakly.
  s.weak_frameworks = 'AlarmKit'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES'
  }
end
