/* global __dirname */
// Puts modules/alarms/app/*.swift into the app target at prebuild. Xcode only extracts App Intents metadata from the
// app's own sources, and an AlarmKit button runs its intent by that metadata, so the alarm's Open intent can't live
// in the AosAlarms pod. The pod finds it at run time by its Objective-C name (AosAlarmIntentFactory).
const fs = require('fs');
const path = require('path');
const { IOSConfig, withXcodeProject } = require('expo/config-plugins');

const FILES = ['AosAlarmIntents.swift'];

module.exports = function withAosAlarmIntents(config) {
  return withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    const name = IOSConfig.XcodeUtils.getProjectName(cfg.modRequest.projectRoot);
    const dir = path.join(cfg.modRequest.platformProjectRoot, name);
    for (const file of FILES) {
      fs.mkdirSync(dir, { recursive: true });
      fs.copyFileSync(path.join(__dirname, 'app', file), path.join(dir, file));
      // a second prebuild finds the file already in the group and leaves it
      IOSConfig.XcodeUtils.addBuildSourceFileToGroup({ filepath: `${name}/${file}`, groupName: name, project });
    }
    return cfg;
  });
};
