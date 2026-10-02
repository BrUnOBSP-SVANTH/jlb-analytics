/**
 * Qual é o endereço público deste site — a resposta, num lugar só.
 *
 * O QUE ACONTECIA (medido em 17/09/2026 nos cabeçalhos do site publicado). A
 * variável `APP_URL` no Render está valendo `http://localhost:3000`, e o código
 * confiava nela cegamente. A CSP servida em produção trazia
 * `wss://localhost:3000`, e — pior — o Stripe recebia
 * `success_url: http://localhost:3000/perfil`: quem pagasse seria mandado para o
 * PRÓPRIO computador, exatamente o defeito que o login do Google tinha.
 *
 * O Render injeta `RENDER_EXTERNAL_URL` sozinho, com a URL real do serviço. Então
 * a regra aqui é: **endereço local só vale se não houver um público disponível**.
 * Assim a configuração errada deixa de importar — e continua funcionando na
 * máquina de quem desenvolve, onde local é o certo.
 *
 * `ehProducao` existe pelo mesmo motivo: o serviço no Render está sem
 * `NODE_ENV=production` (o `render.yaml` define, mas o serviço não nasceu dele),
 * e era isso que soltava as origens de desenvolvimento no CORS e na CSP do site
 * publicado. Rodar no Render é prova suficiente de produção.
 */

import { ORIGEM_PUBLICA } from "../../shared/rotas.ts";

type Ambiente = Record<string, string | undefined>;

const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?$/i;

/** O endereço é de máquina local (não serve para ninguém de fora)? */
export function ehEnderecoLocal(url: string | undefined): boolean {
  return !!url && LOCAL.test(url.trim().replace(/\/+$/, ""));
}

/**
 * O endereço público, sem barra no fim. Ordem:
 *  1. `APP_URL`, quando não é local — é a escolha explícita de quem configurou;
 *  2. em produção, o DOMÍNIO (`ORIGEM_PUBLICA`, shared/rotas.ts);
 *  3. `APP_URL` local — o caso de quem está desenvolvendo;
 *  4. `http://localhost:3000`.
 *
 * 🔴 O passo 2 era `RENDER_EXTERNAL_URL` (02/10/2026). Depois que o domínio
 * próprio entrou no ar, isso fazia o servidor se apresentar como
 * jlb-analytics.onrender.com: quem pagava no Stripe em jlbanalytics.com voltava
 * para o endereço do Render, e os links dos e-mails também iam para lá. O
 * endereço público já tinha UMA fonte (a do sitemap e do canonical) — agora o
 * servidor usa a mesma.
 */
export function urlPublica(env: Ambiente = process.env): string {
  const app = env.APP_URL?.trim().replace(/\/+$/, "") || "";
  if (app && !ehEnderecoLocal(app)) return app;
  if (ehProducao(env)) return ORIGEM_PUBLICA;
  return app || "http://localhost:3000";
}

/**
 * Para onde mandar quem chegou pelo endereço antigo do Render — ou `null`
 * quando a requisição deve ser servida aqui mesmo.
 *
 * POR QUE (02/10/2026): o fundador entrava com o Google em jlbanalytics.com e
 * terminava em jlb-analytics.onrender.com. O Supabase recusa destino fora da
 * lista dele e devolve no "Site URL", que é o endereço do Render — e o Render
 * servia o site inteiro ali, então a pessoa ficava presa no endereço errado.
 * Levando o endereço antigo ao domínio, o desvio se desfaz sozinho: o navegador
 * carrega o `#access_token` junto (o fragmento atravessa o redirecionamento) e
 * a sessão abre no domínio. Também junta links velhos e buscadores num lugar só.
 *
 * Só página: `/api` fica de fora porque o webhook do Stripe e quem consome a
 * API por fora chegam por ali (e POST redirecionado vira GET em muito cliente);
 * `/ws` não é navegação. 302, e não 301: o navegador guarda 301 para sempre,
 * e isto tem de poder ser desfeito com um deploy.
 */
export function enderecoNoDominio(host: string | undefined, metodo: string, url: string): string | null {
  if (metodo !== "GET" && metodo !== "HEAD") return null;
  const caminho = url.split("?")[0];
  if (caminho === "/api" || caminho.startsWith("/api/") || caminho === "/ws" || caminho.startsWith("/ws/")) return null;
  const h = (host ?? "").toLowerCase().replace(/:\d+$/, "");
  if (!h.endsWith(".onrender.com")) return null;
  return ORIGEM_PUBLICA + (url.startsWith("/") ? url : `/${url}`);
}

/** Só o host, do jeito que a CSP pede (`wss://host`). */
export function hostPublico(env: Ambiente = process.env): string {
  return urlPublica(env).replace(/^https?:\/\//, "").replace(/\/.*$/, "");
}

/**
 * Está servindo gente de verdade? `NODE_ENV=production` OU rodando no Render —
 * porque o serviço de produção pode estar sem a variável, e estava.
 */
export function ehProducao(env: Ambiente = process.env): boolean {
  return env.NODE_ENV === "production" || !!env.RENDER_EXTERNAL_URL;
}
