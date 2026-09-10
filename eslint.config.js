// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  ...expoConfig,
  {
    ignores: ["dist/*", "android/*", "ios/*", "node_modules/*"],
  },
  {
    // Tests intentionally use require() for lazy, per-test module loading and
    // typed mocks, so relax a few rules here.
    files: ["__tests__/**/*.ts", "__tests__/**/*.tsx", "jest.setup.ts"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "import/first": "off",
    },
  },
]);
