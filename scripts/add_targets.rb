# Adds the native pieces to the Xcode project on the CI Mac: the app's Swift files (push, calls and the free voice
# loop, dictation, Siri and Shortcuts, haptics and breathing, Face ID, scanning, Live Activities, alarms, notifications,
# Health, Spotlight, the on-device model, calendars, contacts, geofences, icons, Screen Time), the widget extension
# (widgets, Live Activities, controls), the share extension and the keyboard, and, with FAMILY_CONTROLS=true, the three
# Screen Time extensions and the Family Controls entitlement. Safe to re-run. Never committed back.
# Signing: when PROFILE_APP, PROFILE_WIDGETS, PROFILE_SHARE, PROFILE_KEYBOARD (and PROFILE_MONITOR, PROFILE_SHIELD,
# PROFILE_SHIELDACTION with Screen Time) are set (scripts/ios_signing.py setup) and TEAM is the team id, every target
# signs manually for Release. Without them the project stays unsigned (compile check).
# A new Swift file builds only if it is listed here.
require 'xcodeproj'

IOS = File.expand_path('../ios/App', __dir__)
project = Xcodeproj::Project.open(File.join(IOS, 'App.xcodeproj'))
app = project.targets.find { |t| t.name == 'App' } or abort('No App target in App.xcodeproj')
BUNDLE = ENV.fetch('BUNDLE_ID', 'com.norrita.agenticos')
MARKETING = app.build_configurations.first.build_settings['MARKETING_VERSION'] || '1.0'
FAMILY = ENV['FAMILY_CONTROLS'].to_s == 'true'

APP_FILES = %w[NativePlugin.swift CallManager.swift NoraRelay.swift Flow.swift Intents.swift LiveWork.swift
               AosKit.swift Haptics.swift Auth.swift Scan.swift Live.swift Notify.swift Alarms.swift Voice.swift
               Health.swift System.swift LLM.swift Personal.swift ScreenTime.swift].freeze
# Shared/: Shared.swift goes into every target; the others only where they're used.
SHARED_APP_WIDGETS = %w[SharedActivities.swift SharedIntents.swift].freeze
SHARED_SCREEN_TIME = %w[SharedScreenTime.swift].freeze
WIDGET_FILES = %w[AgenticWidgets.swift TodayWidget.swift NoraWidget.swift QuickIdeaWidget.swift DayActivity.swift
                  WorkActivity.swift Kit.swift LifeWidget.swift MoneyWidget.swift StreaksWidget.swift AgentWidgets.swift
                  CaptureWidget.swift LiveV2.swift AlarmLive.swift].freeze
# iOS 26 frameworks load only on iOS 26; weak links keep iOS 17-25 launching (the code checks #available).
WEAK_APP = ['-weak_framework', 'AlarmKit', '-weak_framework', 'FoundationModels'].freeze
WEAK_WIDGETS = ['-weak_framework', 'AlarmKit'].freeze

def group(project, name)
  project.main_group.children.find { |g| g.display_name == name && g.isa == 'PBXGroup' } ||
    project.main_group.new_group(name, name)
end

def add_sources(target, grp, files)
  files.each do |f|
    path = File.join(IOS, grp.path || grp.display_name, f)
    abort("Missing #{path}") unless File.exist?(path)
    ref = grp.files.find { |r| r.path == f } || grp.new_reference(f)
    target.source_build_phase.add_file_reference(ref, true)
  end
end

# Appends linker flag pairs (-weak_framework X) once each, keeping what's there.
def flags(settings, extra)
  have = settings['OTHER_LDFLAGS']
  have = have.is_a?(Array) ? have.dup : have.to_s.split(' ').reject(&:empty?)
  have = ['$(inherited)'] if have.empty?
  extra.each_slice(2) { |pair| have += pair unless have.each_cons(2).include?(pair) }
  settings['OTHER_LDFLAGS'] = have
end

shared = group(project, 'Shared')
add_sources(app, group(project, 'App'), APP_FILES)
add_sources(app, shared, %w[Shared.swift] + SHARED_APP_WIDGETS + SHARED_SCREEN_TIME)
app.build_configurations.each do |c|
  s = c.build_settings
  s['CODE_SIGN_ENTITLEMENTS'] = 'App/App.entitlements'
  s['IPHONEOS_DEPLOYMENT_TARGET'] = '17.0'
  s['ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES'] = 'AppIcon-Obsidian AppIcon-Matte'
  s['ASSETCATALOG_COMPILER_INCLUDE_ALL_APPICON_ASSETS'] = 'YES'
  s['AOS_FAMILY_CONTROLS'] = FAMILY ? 'YES' : 'NO'
  flags(s, WEAK_APP)
end

def extension(project, app, shared, name, bundle, files, shared_files)
  t = project.targets.find { |x| x.name == name }
  unless t
    t = project.new_target(:app_extension, name, :ios, '17.0', project.products_group, :swift)
    app.add_dependency(t)
    embed = app.copy_files_build_phases.find { |p| p.name == 'Embed Foundation Extensions' } ||
            app.new_copy_files_build_phase('Embed Foundation Extensions')
    embed.symbol_dst_subfolder_spec = :plug_ins
    build_file = embed.add_file_reference(t.product_reference, true)
    build_file.settings = { 'ATTRIBUTES' => ['RemoveHeadersOnCopy'] }
  end
  add_sources(t, group(project, name), files)
  add_sources(t, shared, %w[Shared.swift] + shared_files)
  t.build_configurations.each do |c|
    s = c.build_settings
    s['PRODUCT_NAME'] = '$(TARGET_NAME)'
    s['PRODUCT_BUNDLE_IDENTIFIER'] = bundle
    s['INFOPLIST_FILE'] = "#{name}/Info.plist"
    s['GENERATE_INFOPLIST_FILE'] = 'NO'
    s['CODE_SIGN_ENTITLEMENTS'] = "#{name}/#{name}.entitlements"
    s['MARKETING_VERSION'] = MARKETING
    s['CURRENT_PROJECT_VERSION'] = '1'
    s['SWIFT_VERSION'] = '5.0'
    s['TARGETED_DEVICE_FAMILY'] = '1'
    s['IPHONEOS_DEPLOYMENT_TARGET'] = '17.0'
    s['SKIP_INSTALL'] = 'YES'
    s['APPLICATION_EXTENSION_API_ONLY'] = 'YES'
    s['LD_RUNPATH_SEARCH_PATHS'] = ['$(inherited)', '@executable_path/Frameworks', '@executable_path/../../Frameworks']
  end
  t
end

widgets = extension(project, app, shared, 'AgenticWidgets', "#{BUNDLE}.widgets", WIDGET_FILES, SHARED_APP_WIDGETS)
widgets.build_configurations.each do |c|
  # SharedIntents.swift leaves its app-only work out of the widget build.
  c.build_settings['SWIFT_ACTIVE_COMPILATION_CONDITIONS'] = '$(inherited) AOS_WIDGET'
  flags(c.build_settings, WEAK_WIDGETS)
end
share = extension(project, app, shared, 'AgenticShare', "#{BUNDLE}.share", %w[ShareViewController.swift], [])
keyboard = extension(project, app, shared, 'AgenticKeyboard', "#{BUNDLE}.keyboard",
                     %w[KeyboardViewController.swift KeyboardModel.swift KeyboardViews.swift], [])

profiles = { app => ENV['PROFILE_APP'], widgets => ENV['PROFILE_WIDGETS'], share => ENV['PROFILE_SHARE'],
             keyboard => ENV['PROFILE_KEYBOARD'] }

if FAMILY
  # Screen Time (DECISIONS 4): the extensions, and the entitlement on the app. Off by default; see ios/README.md.
  monitor = extension(project, app, shared, 'AgenticMonitor', "#{BUNDLE}.monitor",
                      %w[DeviceActivityMonitorExtension.swift], SHARED_SCREEN_TIME)
  shield = extension(project, app, shared, 'AgenticShield', "#{BUNDLE}.shield",
                     %w[ShieldConfigurationExtension.swift], SHARED_SCREEN_TIME)
  action = extension(project, app, shared, 'AgenticShieldAction', "#{BUNDLE}.shieldaction",
                     %w[ShieldActionExtension.swift], SHARED_SCREEN_TIME)
  profiles.merge!(monitor => ENV['PROFILE_MONITOR'], shield => ENV['PROFILE_SHIELD'], action => ENV['PROFILE_SHIELDACTION'])
  ent_path = File.join(IOS, 'App', 'App.entitlements')
  ent = Xcodeproj::Plist.read_from_path(ent_path)
  ent['com.apple.developer.family-controls'] = true
  Xcodeproj::Plist.write_to_path(ent, ent_path)
  puts 'Screen Time: on (3 extensions, Family Controls entitlement)'
else
  puts 'Screen Time: off (family_controls is false)'
end

if ENV['TEAM'].to_s != '' && profiles.values.all? { |p| p.to_s != '' }
  profiles.each do |target, profile|
    target.build_configurations.select { |c| c.name == 'Release' }.each do |c|
      s = c.build_settings
      s['CODE_SIGN_STYLE'] = 'Manual'
      s['CODE_SIGN_IDENTITY'] = 'Apple Distribution'
      s['DEVELOPMENT_TEAM'] = ENV['TEAM']
      s['PROVISIONING_PROFILE_SPECIFIER'] = profile
    end
  end
  puts "Signing: manual, #{profiles.size} profiles"
else
  puts 'Signing: none (compile check)'
end

project.save
puts "Targets: #{project.targets.map(&:name).join(', ')}"
