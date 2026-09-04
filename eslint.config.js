import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["node_modules/**", "dist/**", "coverage/**"] },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    // The build scripts are plain Node ESM, not TypeScript, so nothing has
    // already told ESLint that `process`, `console` and `URL` exist. Without
    // this, every one of them is reported as an undefined global.
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: { console: "readonly", process: "readonly", URL: "readonly" },
    },
  },
  {
    files: ["**/*.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
);
