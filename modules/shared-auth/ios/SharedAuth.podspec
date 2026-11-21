Pod::Spec.new do |s|
  s.name           = 'SharedAuth'
  s.version        = '1.0.0'
  s.summary        = 'Shares the Agentic OS sign-in with its app extensions'
  s.description    = 'Writes the PC session token and API address to a keychain group the Controls extension can read.'
  s.license        = 'UNLICENSED'
  s.author         = 'Norrita'
  s.homepage       = 'https://github.com/vedant-aggarwal/agentic-os-ios'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: 'https://github.com/vedant-aggarwal/agentic-os-ios.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = "**/*.{h,m,swift}"
  s.frameworks = 'Security'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES'
  }
end
