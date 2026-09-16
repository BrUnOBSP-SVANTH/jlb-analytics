import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Split vendor pesado em chunks cacheáveis — React/Supabase mudam raramente,
        // então ficam em cache do navegador entre deploys (o app muda, o vendor não).
        // Normaliza o separador (Windows usa "\") antes de casar os caminhos.
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          const p = id.replace(/\\/g, "/");
          // ⚠️ `/node_modules/<pacote>/`, e NÃO `/<pacote>`. No pnpm as dependências
          // de uma biblioteca moram dentro da pasta dela
          // (`.pnpm/recharts@2.x/node_modules/clsx/…`), então casar por prefixo
          // rotulava como "charts" qualquer miudeza aninhada no recharts — e
          // bastava o app usar a MESMA miudeza para o bundle principal importar do
          // chunk de gráficos e o navegador baixar 406 KB de Recharts na home
          // (auditoria de 14/09, item 27).
          const ehPacote = (nome: string) => p.includes(`/node_modules/${nome}/`);
          const ehFamilia = (prefixo: string) => new RegExp(`/node_modules/${prefixo}[^/]*/`).test(p);
          // Utilidades minúsculas que TODA tela usa (clsx e companhia). Sem um
          // chunk próprio, o Rollup as guardava dentro de "charts" — e aí o
          // bundle principal importava de lá, obrigando a home a baixar 406 KB
          // de Recharts para usar uma função de juntar classes.
          if (ehPacote("clsx") || ehPacote("tailwind-merge") || ehPacote("class-variance-authority")) return "ui-utils";
          if (ehPacote("recharts") || ehFamilia("d3-") || ehPacote("victory-vendor")
            || ehPacote("internmap") || ehPacote("robust-predicates") || ehPacote("decimal.js")) return "charts";
          if (p.includes("/@supabase")) return "supabase";
          if (/\/(react|react-dom|scheduler)@/.test(p) || p.includes("/wouter")) return "react-vendor";
          // demais libs (radix, lucide, cmdk, …) ficam no entry — pequenas e variadas.
        },
      },
    },
  },
  server: {
    port: 3000,
    strictPort: false,
    host: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
    proxy: {
      // Toda a API vai ao Express em :3001 — inclui /api/level1–5, servidos pelo
      // levels.ts (TypeScript). Antes o dev desviava os níveis para o FastAPI em
      // :8000, criando divergência dev/prod; agora dev e prod usam o mesmo código.
      "/api":        { target: "http://localhost:3001", changeOrigin: true },
      "/ws":         { target: "http://localhost:3001", changeOrigin: true, ws: true },
    },
  },
});
