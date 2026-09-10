/**
 * useSEO — título, descrição e PRÉVIA DE COMPARTILHAMENTO por rota.
 *
 * O QUE ISTO CONSERTA (NEG-03). A auditoria reportou que links do site
 * compartilhados no WhatsApp não carregam prévia. O diagnóstico dela foi "SPA
 * sem SSR"; medindo aqui, a causa é mais específica e mais fácil de consertar:
 *
 * O `index.html` JÁ tem Open Graph estático completo, e o site JÁ serve
 * snapshots pré-renderizados para bots (ver `scripts/prerender.mjs` e o
 * dynamic rendering em `server/index.ts`). O que faltava é que este hook
 * atualizava só `<title>` e `meta[name=description]` — e as tags do Open Graph
 * usam `property=`, não `name=`. Resultado: QUALQUER link do site, de qualquer
 * página, mostrava a prévia genérica da home.
 *
 * Um link para o Track Record — a prova de valor, a página que dá vontade de
 * mandar para alguém — chegava no WhatsApp dizendo "Plataforma de educação
 * quantitativa para mercados preditivos". No Brasil, prévia errada custa quase
 * tanto quanto prévia nenhuma.
 *
 * Agora o hook escreve as duas famílias, e o snapshot pré-renderizado sai com
 * elas dentro — que é o que o crawler lê, já que ele não executa JavaScript.
 */
import { useEffect } from "react";

const TITULO_PADRAO = "JLB Analytics — Educação em Mercados Preditivos";
const DESCRICAO_PADRAO =
  "Plataforma de educação quantitativa para mercados preditivos. Aprenda Valor Esperado, calibração, modelos Poisson, GARCH e ensemble com dados reais.";

/** `name=` (description, twitter:*) e `property=` (og:*) são atributos diferentes. */
function upsert(atributo: "name" | "property", chave: string, conteudo: string): void {
  let tag = document.head.querySelector(`meta[${atributo}="${chave}"]`);
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute(atributo, chave);
    document.head.appendChild(tag);
  }
  tag.setAttribute("content", conteudo);
}

export function useSEO(title: string, description?: string): void {
  useEffect(() => {
    const tituloCompleto = `${title} · JLB Analytics`;
    const desc = description ?? DESCRICAO_PADRAO;
    const url = `${window.location.origin}${window.location.pathname}`;

    document.title = tituloCompleto;
    upsert("name", "description", desc);

    // A prévia que aparece no WhatsApp, no LinkedIn e no Telegram.
    upsert("property", "og:title", tituloCompleto);
    upsert("property", "og:description", desc);
    upsert("property", "og:url", url);
    upsert("name", "twitter:title", tituloCompleto);
    upsert("name", "twitter:description", desc);
    upsert("name", "twitter:url", url);

    // Canonical da rota atual (sem query/hash) — evita indexação duplicada
    let link = document.head.querySelector('link[rel="canonical"]');
    if (!link) {
      link = document.createElement("link");
      link.setAttribute("rel", "canonical");
      document.head.appendChild(link);
    }
    link.setAttribute("href", url);

    // Ao sair da rota, volta ao padrão da home — senão a próxima página herda a
    // prévia da anterior enquanto o efeito dela não roda.
    return () => {
      document.title = TITULO_PADRAO;
      upsert("property", "og:title", TITULO_PADRAO);
      upsert("property", "og:description", DESCRICAO_PADRAO);
      upsert("name", "twitter:title", TITULO_PADRAO);
      upsert("name", "twitter:description", DESCRICAO_PADRAO);
    };
  }, [title, description]);
}
