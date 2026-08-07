import { resolve } from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: { drop: ["console", "debugger"] },
  plugins: [tailwindcss(), react()],
  envDir: resolve(import.meta.dirname, ".."),
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "src")
    }
  },
  build: { target: "esnext" },
  test: {
    environment: "jsdom",
    restoreMocks: true
  }
});
