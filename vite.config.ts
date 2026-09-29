import { defineConfig } from "vite-plus";

const generated = ["packages/bindings/src/**", "**/dist/**"];
const startServer = "spacetime start --listen-addr 127.0.0.1:3000";
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
    tasks: {
      dev: {
        command: `${startServer} & server=$!; trap 'kill $server 2>/dev/null' EXIT; spacetime dev --yes`,
        cache: false,
      },
      build: {
        command: "spacetime build --module-path apps/server",
        cache: { output: ["apps/server/dist/**"] },
      },
      ready: { command: "vp check && vp run -r test && vp run -r build" },
      "stdb:start": { command: startServer, cache: false },
      "stdb:publish": { command: "spacetime publish --yes", cache: false },
      "stdb:generate": {
        command: "spacetime generate",
        cache: {
          input: [{ auto: true }, "!apps/server/dist/**"],
          output: ["packages/bindings/src/**"],
        },
      },
    },
  },
});
