import { defineConfig } from "vite-plus";

export default defineConfig({
  run: {
    tasks: {
      dev: { command: "spacetime start --listen-addr 127.0.0.1:3000", cache: false },
      build: { command: "spacetime build", cache: { output: ["dist/**"] } },
    },
  },
});
