import { defineConfig } from "@playwright/test";

/**
 * E2E smoke — roda contra o BUILD DE PRODUÇÃO real (dist/index.js).
 * `pnpm build` antes de `pnpm test:e2e`. Os testes não dependem de
 * segredos: validam o shell das páginas, não chamadas de IA.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:3311",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "node dist/index.js",
    port: 3311,
    reuseExistingServer: !process.env.CI,
    env: {
      NODE_ENV: "production",
      PORT: "3311",
      APP_URL: "http://localhost:3311",
    },
  },
});
