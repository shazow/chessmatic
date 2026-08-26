import tseslint from "typescript-eslint";
import svelte from "eslint-plugin-svelte";
import svelteConfig from "./svelte.config.js";

export default tseslint.config(
  {
    ignores: ["dist/", "dev-dist/", "node_modules/", "playwright-report/", "test-results/"],
  },
  ...tseslint.configs.recommended,
  ...svelte.configs.recommended,
  {
    files: ["**/*.svelte", "**/*.svelte.ts"],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: [".svelte"],
        svelteConfig,
      },
    },
  },
  {
    rules: {
      // Cyclomatic complexity is a guideline, not a gate: warnings flag
      // refactor candidates without failing the lint run.
      complexity: ["warn", { max: 10 }],
    },
  },
);
