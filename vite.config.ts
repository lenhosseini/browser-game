import { defineConfig } from "vite-plus";

const generated = ["packages/bindings/src/**", "**/dist/**"];
const vendored = [".agents/**", ".claude/**", "skills-lock.json"];

export default defineConfig({
  defaultPackage: "./apps/client",
  staged: {
    "*": "vp check --fix",
  },
  fmt: { ignorePatterns: [...generated, ...vendored] },
  lint: {
    ignorePatterns: [...generated, ...vendored],
    plugins: ["typescript", "oxc"],
    options: { typeAware: true, typeCheck: true },
    overrides: [
      {
        files: ["apps/client/**"],
        plugins: ["react"],
        rules: {
          "react/rules-of-hooks": "error",
          "react/only-export-components": ["warn", { allowConstantExport: true }],
        },
      },
      { files: ["**/*.test.ts", "**/*.test.tsx"], plugins: ["vitest"] },
    ],
  },
  test: { projects: ["apps/*", "packages/*"] },
  run: {
    cache: true,
  },
});
