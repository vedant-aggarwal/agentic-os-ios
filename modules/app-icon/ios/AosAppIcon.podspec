Pod::Spec.new do |s|
  s.name           = 'AosAppIcon'
  s.version        = '1.0.0'
  s.summary        = "Switches the app's home screen icon"
  s.description    = 'Reads and sets the alternate app icon (AppIconLight, AppIconDark) or the primary one.'
  s.license        = 'UNLICENSED'
  s.author         = 'Norrita'
  s.homepage       = 'https://github.com/vedant-aggarwal/agentic-os-ios'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: 'https://github.com/vedant-aggarwal/agentic-os-ios.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = "**/*.{h,m,swift}"
  s.frameworks = 'UIKit'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES'
  }
end
