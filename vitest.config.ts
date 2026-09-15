import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    exclude: ["node_modules/**", ".next/**", "e2e/**"],
    environment: "node",
    globals: true,
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
