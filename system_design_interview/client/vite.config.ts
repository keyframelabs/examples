import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
      "#": new URL("../infinite-canvas/src", import.meta.url).pathname
    },
    dedupe: ["react", "react-dom"]
  }
});
