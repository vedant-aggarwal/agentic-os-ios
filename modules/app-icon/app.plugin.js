// The app's alternate icons, which src/lib/appIcon.ts switches between: each a single 1024 px asset set beside
// AppIcon in the app target's asset catalog. Xcode compiles them in through ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES
// (app target only, not the extensions) and Info.plist lists them under CFBundleAlternateIcons. The primary icon
// (AppIcon: light, with a dark appearance for iOS 18) comes from ios.icon in app.json.
//   ["./modules/app-icon/app.plugin.js", { "icons": { "AppIconLight": "./assets/images/app-icon-light.png", ... } }]
const fs = require('fs');
const path = require('path');
const { IOSConfig, withDangerousMod, withInfoPlist, withXcodeProject } = require('expo/config-plugins');

/** An app icon has to be a 1024 px square PNG without alpha, or App Store Connect rejects the build. */
function checkPng(file) {
  const b = fs.readFileSync(file);
  const png = b.length > 26 && b.toString('latin1', 1, 4) === 'PNG';
  const w = png ? b.readUInt32BE(16) : 0, h = png ? b.readUInt32BE(20) : 0, type = png ? b[25] : -1;
  if (w !== 1024 || h !== 1024 || (type !== 2 && type !== 0)) {
    throw new Error(`app-icon plugin: ${file} must be a 1024x1024 PNG without alpha (got ${w}x${h}, color type ${type})`);
  }
}

module.exports = function withAosAppIcons(config, { icons = {} } = {}) {
  const names = Object.keys(icons);
  if (!names.length) return config;

  config = withDangerousMod(config, ['ios', (cfg) => {
    const { projectRoot, platformProjectRoot } = cfg.modRequest;
    const name = cfg.modRequest.projectName || IOSConfig.XcodeUtils.getProjectName(projectRoot);
    const catalog = path.join(platformProjectRoot, name, 'Images.xcassets');
    for (const name of names) {
      const src = path.resolve(projectRoot, icons[name]);
      checkPng(src);
      const dir = path.join(catalog, `${name}.appiconset`);
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(dir, { recursive: true });
      const filename = `${name}-1024.png`;
      fs.copyFileSync(src, path.join(dir, filename));
      const contents = { images: [{ filename, idiom: 'universal', platform: 'ios', size: '1024x1024' }], info: { author: 'expo', version: 1 } };
      fs.writeFileSync(path.join(dir, 'Contents.json'), JSON.stringify(contents, null, 2) + '\n');
    }
    return cfg;
  }]);

  config = withInfoPlist(config, (cfg) => {
    const entry = (name) => ({ CFBundleIconName: name, CFBundleIconFiles: [`${name}60x60`], UIPrerenderedIcon: false });
    const set = cfg.modResults.CFBundleIcons ?? {};
    set.CFBundlePrimaryIcon = set.CFBundlePrimaryIcon ?? entry('AppIcon');
    set.CFBundleAlternateIcons = { ...(set.CFBundleAlternateIcons ?? {}), ...Object.fromEntries(names.map((n) => [n, entry(n)])) };
    cfg.modResults.CFBundleIcons = set;
    return cfg;
  });

  config = withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    const projectName = cfg.modRequest.projectName || IOSConfig.XcodeUtils.getProjectName(cfg.modRequest.projectRoot);
    const { target } = IOSConfig.XcodeUtils.getApplicationNativeTarget({ project, projectName });
    for (const [, c] of IOSConfig.XcodeUtils.getBuildConfigurationsForListId(project, target.buildConfigurationList)) {
      if (c.buildSettings) c.buildSettings.ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES = `"${names.join(' ')}"`;
    }
    return cfg;
  });

  return config;
};
