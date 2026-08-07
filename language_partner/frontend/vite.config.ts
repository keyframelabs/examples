import { resolve } from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), react()],
  envDir: resolve(import.meta.dirname, ".."),
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "src")
    }
  }
});
