# After `expo prebuild`: manual App Store signing on the app target, every build configuration.
# Only the app target is touched, so Pods never get a provisioning profile they don't support.
# Env: TEAM, BUNDLE_ID, PROFILE_APP (written by scripts/ios_signing.py setup).
require 'xcodeproj'

path = Dir['ios/*.xcodeproj'].reject { |p| p.include?('Pods') }.first or abort('No Xcode project under ios/')
project = Xcodeproj::Project.open(path)
app = project.targets.find { |t| t.respond_to?(:product_type) && t.product_type == 'com.apple.product-type.application' }
abort('No app target in the Xcode project') unless app

team = ENV.fetch('TEAM')
app.build_configurations.each do |config|
  s = config.build_settings
  s['CODE_SIGN_STYLE'] = 'Manual'
  s['DEVELOPMENT_TEAM'] = team
  s['CODE_SIGN_IDENTITY'] = 'Apple Distribution'
  s['CODE_SIGN_IDENTITY[sdk=iphoneos*]'] = 'Apple Distribution'
  s['PROVISIONING_PROFILE_SPECIFIER'] = ENV.fetch('PROFILE_APP')
  s['PRODUCT_BUNDLE_IDENTIFIER'] = ENV.fetch('BUNDLE_ID')
  # A Debug build would otherwise add get-task-allow, which an App Store profile doesn't grant.
  s['CODE_SIGN_INJECT_BASE_ENTITLEMENTS'] = 'NO'
  # One real executable, not a stub plus a .debug.dylib (Xcode's default for Debug).
  s['ENABLE_DEBUG_DYLIB'] = 'NO'
end

attrs = (project.root_object.attributes['TargetAttributes'] ||= {})
(attrs[app.uuid] ||= {}).merge!('DevelopmentTeam' => team, 'ProvisioningStyle' => 'Manual')
project.save
puts "Manual signing set on target #{app.name} (#{app.build_configurations.map(&:name).join(', ')})"
