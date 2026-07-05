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
          if (p.includes("/recharts") || p.includes("/d3-") || p.includes("victory-vendor") || p.includes("/internmap") || p.includes("/robust-predicates") || p.includes("/decimal.js")) return "charts";
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
      // Modelos Python: vai direto para o FastAPI em :8000
      "/api/level1": { target: "http://localhost:8000", changeOrigin: true },
      "/api/level2": { target: "http://localhost:8000", changeOrigin: true },
      "/api/level3": { target: "http://localhost:8000", changeOrigin: true },
      "/api/level4": { target: "http://localhost:8000", changeOrigin: true },
      "/api/level5": { target: "http://localhost:8000", changeOrigin: true },
      "/api/models":  { target: "http://localhost:8000", changeOrigin: true },
      // Todo o resto da API vai para o Express em :3001
      "/api":        { target: "http://localhost:3001", changeOrigin: true },
      "/ws":         { target: "http://localhost:3001", changeOrigin: true, ws: true },
    },
  },
});
