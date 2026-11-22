// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'hero-scene/**'], // hero-scene is browser code bundled by bun into src/hero/sceneHtml.ts
  },
]);
