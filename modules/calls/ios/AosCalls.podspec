Pod::Spec.new do |s|
  s.name           = 'AosCalls'
  s.version        = '1.0.0'
  s.summary        = "Nora's calls on the iPhone's own call screen"
  s.description    = 'PushKit VoIP token and pushes, each reported to CallKit, and the call audio relayed through the PC (NoraRelay).'
  s.license        = 'UNLICENSED'
  s.author         = 'Norrita'
  s.homepage       = 'https://github.com/vedant-aggarwal/agentic-os-ios'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: 'https://github.com/vedant-aggarwal/agentic-os-ios.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = "**/*.{h,m,swift}"
  s.frameworks = 'CallKit', 'PushKit', 'AVFoundation', 'Security'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES'
  }
end
