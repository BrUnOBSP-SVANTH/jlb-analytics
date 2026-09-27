import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    // `shared/` entra aqui porque é justamente o código que roda nos DOIS lados
    // (navegador e servidor): um erro ali aparece em dobro e não tinha teste.
    //
    // `scripts/` entrou em 27/09/2026 pelo mesmo motivo, um degrau acima: o
    // `doctor` e a `varredura` são as ferramentas que dizem se o site está de
    // pé, e ninguém as media. O doctor estava apontando quatro críticos, três
    // deles falsos — e um alarme falso ensina a passar o olho pela lista sem
    // ler, que é o oposto do que a ferramenta existe para fazer.
    include: [
      "client/src/**/*.test.ts", "client/src/**/*.spec.ts",
      "server/**/*.test.ts", "shared/**/*.test.ts",
      "supabase/**/*.test.ts", "scripts/**/*.test.ts",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client/src"),
      // Precisa espelhar o vite.config: sem isto, todo teste de arquivo do
      // cliente que importe de `shared/` falha ao carregar — e o erro aparece
      // como "arquivo não existe", que manda quem lê para o lugar errado.
      "@shared": path.resolve(__dirname, "shared"),
    },
  },
});
