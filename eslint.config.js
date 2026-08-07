const js = require('@eslint/js');
const globals = require('globals');
const eslintConfigPrettier = require('eslint-config-prettier');

module.exports = [
  js.configs.recommended,
  {
    ignores: ['node_modules/**', 'dist/**', 'out/**', 'build/**'],
  },
  {
    // Electron main process, build scripts, and this config file itself: CommonJS, Node globals.
    files: ['main.js', 'preload.js', 'preload-settings.js', 'scripts/**/*.js', 'eslint.config.js', 'playwright.config.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
  },
  {
    // Playwright specs: Node (require/process/__dirname) at the top level, but callbacks passed
    // to page.evaluate()/electronApp.evaluate() run in a browser/Electron-renderer context.
    files: ['tests/**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { ...globals.node, ...globals.browser },
    },
  },
  {
    // Renderer scripts are loaded via plain <script> tags (see index.html/settings.html), not
    // ES modules — each is a script-scope IIFE that reads/writes globals on `window`.
    files: ['renderer/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: { ...globals.browser },
    },
  },
  eslintConfigPrettier,
];
