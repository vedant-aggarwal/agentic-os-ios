# After `expo prebuild`: manual App Store signing on the app target and its app extensions, every build configuration.
# Only those targets are touched, so Pods never get a provisioning profile they don't support.
# Env: TEAM, BUNDLE_ID, PROFILE_APP, PROFILE_EXT, PROFILE_KBD, PROFILE_SHR, PROFILE_CDX, PROFILE_NSE (written by
# scripts/ios_signing.py setup).
require 'xcodeproj'

path = Dir['ios/*.xcodeproj'].reject { |p| p.include?('Pods') }.first or abort('No Xcode project under ios/')
project = Xcodeproj::Project.open(path)
typed = project.targets.select { |t| t.respond_to?(:product_type) }
app = typed.find { |t| t.product_type == 'com.apple.product-type.application' }
abort('No app target in the Xcode project') unless app
exts = typed.select { |t| t.product_type == 'com.apple.product-type.app-extension' }

team = ENV.fetch('TEAM')
sign = lambda do |target, profile, bundle|
  target.build_configurations.each do |config|
    s = config.build_settings
    s['CODE_SIGN_STYLE'] = 'Manual'
    s['DEVELOPMENT_TEAM'] = team
    s['CODE_SIGN_IDENTITY'] = 'Apple Distribution'
    s['CODE_SIGN_IDENTITY[sdk=iphoneos*]'] = 'Apple Distribution'
    s['PROVISIONING_PROFILE_SPECIFIER'] = profile
    s['PRODUCT_BUNDLE_IDENTIFIER'] = bundle if bundle
    # A Debug build would otherwise add get-task-allow, which an App Store profile doesn't grant.
    s['CODE_SIGN_INJECT_BASE_ENTITLEMENTS'] = 'NO'
    # One real executable, not a stub plus a .debug.dylib (Xcode's default for Debug).
    s['ENABLE_DEBUG_DYLIB'] = 'NO'
  end
  attrs = (project.root_object.attributes['TargetAttributes'] ||= {})
  (attrs[target.uuid] ||= {}).merge!('DevelopmentTeam' => team, 'ProvisioningStyle' => 'Manual')
end

sign.call(app, ENV.fetch('PROFILE_APP'), ENV.fetch('BUNDLE_ID'))
exts.each do |t|
  # set by @bacons/apple-targets: the keyboard (targets/keyboard, <app>.keyboard) and the Controls extension
  # (targets/controls, <app>.controls)
  if t.name =~ /keyboard/i
    sign.call(t, ENV.fetch('PROFILE_KBD'), "#{ENV.fetch('BUNDLE_ID')}.keyboard")
  elsif t.name =~ /share/i # targets/share, <app>.share: "Open on PC" in the share sheet
    sign.call(t, ENV.fetch('PROFILE_SHR'), "#{ENV.fetch('BUNDLE_ID')}.share")
  elsif t.name =~ /calldirectory/i # targets/calldirectory, <app>.calldirectory: Nora's line's call blocking
    sign.call(t, ENV.fetch('PROFILE_CDX'), "#{ENV.fetch('BUNDLE_ID')}.calldirectory")
  elsif t.name =~ /notify/i # targets/notify, <app>.notify: a line decision's option buttons
    sign.call(t, ENV.fetch('PROFILE_NSE'), "#{ENV.fetch('BUNDLE_ID')}.notify")
  else
    sign.call(t, ENV.fetch('PROFILE_EXT'), "#{ENV.fetch('BUNDLE_ID')}.controls")
  end
end
project.save
puts "Manual signing set on #{([app] + exts).map(&:name).join(', ')} (#{app.build_configurations.map(&:name).join(', ')})"
