import { defineConfig } from "vite-plus";

export default defineConfig({
  run: {
    tasks: {
      dev: { command: "node scripts/dev.mjs", cache: false },
      "stdb:start": {
        command: "spacetime start --listen-addr 127.0.0.1:3000",
        cache: false,
      },
      "stdb:build": { command: "spacetime build", cache: { output: ["dist/**"] } },
      "stdb:generate": {
        command:
          "spacetime generate --lang typescript --out-dir ../../packages/bindings/src --module-path .",
        cache: {
          input: [{ auto: true }, "!dist/**"],
          output: [{ pattern: "packages/bindings/src/**", base: "workspace" }],
        },
      },
      "stdb:publish": {
        command: "spacetime publish --server local --module-path . --yes browser-game",
        cache: false,
        dependsOn: ["stdb:build"],
      },
    },
  },
});
