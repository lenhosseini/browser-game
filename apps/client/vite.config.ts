import react from "@vitejs/plugin-react";
import { defineConfig, lazyPlugins } from "vite-plus";

export default defineConfig({
  plugins: lazyPlugins(() => [react()]),
  run: {
    tasks: {
      dev: { command: "spacetime dev --yes", cwd: "../..", cache: false },
      serve: { command: "vp dev", cache: false },
      build: { command: "vp build" },
      preview: { command: "vp preview", cache: false },
    },
  },
});
