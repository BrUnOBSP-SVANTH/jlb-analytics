import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    // `shared/` entra aqui porque é justamente o código que roda nos DOIS lados
    // (navegador e servidor): um erro ali aparece em dobro e não tinha teste.
    include: ["client/src/**/*.test.ts", "client/src/**/*.spec.ts", "server/**/*.test.ts", "shared/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client/src"),
    },
  },
});
