// Lets the app read the team's shared site data (sim/pavilions.json) straight from the repo,
// so there is one source of truth for pavilion names, tags and visit times.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.watchFolders = [path.resolve(__dirname, '../sim')];

module.exports = config;
