Pod::Spec.new do |s|
  s.name           = 'VolumeButtons'
  s.version        = '1.0.0'
  s.summary        = 'Volume button presses for Agentic OS'
  s.description    = 'Reports each volume up and down step while the app listens, and keeps the volume and its HUD still.'
  s.license        = 'UNLICENSED'
  s.author         = 'Norrita'
  s.homepage       = 'https://github.com/vedant-aggarwal/agentic-os-ios'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: 'https://github.com/vedant-aggarwal/agentic-os-ios.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = "**/*.{h,m,swift}"
  s.frameworks = 'AVFoundation', 'MediaPlayer'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES'
  }
end
