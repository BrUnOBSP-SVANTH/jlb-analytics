/**
 * useSEO — define <title> e <meta description> por página (JLB Analytics).
 *
 * SPA não tem SSR, mas o Googlebot executa JS e indexa o título/description
 * resultante. Isso dá a cada rota um título próprio (aba, bookmark, busca) —
 * muito melhor que o título estático único do index.html.
 *
 * Para conteúdo rico em crawlers que NÃO executam JS, o passo completo é
 * prerender/SSR (vite-plugin) — este hook é o ganho de baixo custo e alto valor.
 */
import { useEffect } from "react";

const DEFAULT_TITLE = "JLB Analytics — Educação em Mercados Preditivos";

function upsertMeta(name: string, content: string): void {
  let tag = document.querySelector(`meta[name="${name}"]`);
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute("name", name);
    document.head.appendChild(tag);
  }
  tag.setAttribute("content", content);
}

export function useSEO(title: string, description?: string): void {
  useEffect(() => {
    document.title = `${title} · JLB Analytics`;

    if (description) upsertMeta("description", description);

    // Canonical da rota atual (sem query/hash) — evita indexação duplicada
    let link = document.querySelector('link[rel="canonical"]');
    if (!link) {
      link = document.createElement("link");
      link.setAttribute("rel", "canonical");
      document.head.appendChild(link);
    }
    link.setAttribute("href", `${window.location.origin}${window.location.pathname}`);

    return () => { document.title = DEFAULT_TITLE; };
  }, [title, description]);
}
