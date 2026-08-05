import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  envDir: path.resolve(import.meta.dirname, ".."),
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src")
    },
    dedupe: ["react", "react-dom"]
  },
  build: {
    // PersonaView and its real-time media stack are intentionally isolated in the lazy live-session chunk.
    chunkSizeWarningLimit: 600
  }
});
