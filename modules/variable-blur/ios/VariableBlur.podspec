Pod::Spec.new do |s|
  s.name           = 'VariableBlur'
  s.version        = '1.0.0'
  s.summary        = 'Progressive gaussian blur view for Agentic OS'
  s.description    = 'Clear at the top edge, blurred at the bottom, using the system variable blur filter.'
  s.license        = 'UNLICENSED'
  s.author         = 'Norrita'
  s.homepage       = 'https://github.com/vedant-aggarwal/agentic-os-ios'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: 'https://github.com/vedant-aggarwal/agentic-os-ios.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES'
  }
end
