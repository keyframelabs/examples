import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["server/src/**/*.test.ts", "shared/src/**/*.test.ts", "client/src/**/*.test.ts"],
    coverage: {
      reporter: ["text", "html"]
    }
  },
  resolve: {
    alias: {
      "@/": new URL("./client/src/", import.meta.url).pathname,
      "@kfl-interview/shared": new URL("./shared/src/index.ts", import.meta.url).pathname
    }
  }
});
