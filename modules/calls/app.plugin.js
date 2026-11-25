// Copies the line call Live Activity's App Intents (modules/calls/app/AosLineIntents.swift) into the app target at
// prebuild: Xcode only extracts App Intents metadata from the app itself, and a Live Activity's intent runs there.
// Same as modules/alarms/app.plugin.js.
const fs = require('fs');
const path = require('path');
const { IOSConfig, withXcodeProject } = require('expo/config-plugins');

const FILES = ['AosLineIntents.swift'];

module.exports = function withAosLineIntents(config) {
  return withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    const name = IOSConfig.XcodeUtils.getProjectName(cfg.modRequest.projectRoot);
    const dir = path.join(cfg.modRequest.platformProjectRoot, name);
    for (const file of FILES) {
      fs.mkdirSync(dir, { recursive: true });
      fs.copyFileSync(path.join(__dirname, 'app', file), path.join(dir, file));
      IOSConfig.XcodeUtils.addBuildSourceFileToGroup({ filepath: `${name}/${file}`, groupName: name, project });
    }
    return cfg;
  });
};
