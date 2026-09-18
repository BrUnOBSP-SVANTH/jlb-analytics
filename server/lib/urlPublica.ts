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

type Ambiente = Record<string, string | undefined>;

const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?$/i;

/** O endereço é de máquina local (não serve para ninguém de fora)? */
export function ehEnderecoLocal(url: string | undefined): boolean {
  return !!url && LOCAL.test(url.trim().replace(/\/+$/, ""));
}

/**
 * O endereço público, sem barra no fim. Ordem:
 *  1. `APP_URL`, quando não é local — é a escolha explícita de quem configurou;
 *  2. `RENDER_EXTERNAL_URL` — a URL real do serviço, injetada pela plataforma;
 *  3. `APP_URL` local — o caso de quem está desenvolvendo;
 *  4. `http://localhost:3000`.
 */
export function urlPublica(env: Ambiente = process.env): string {
  const app = env.APP_URL?.trim().replace(/\/+$/, "") || "";
  const render = env.RENDER_EXTERNAL_URL?.trim().replace(/\/+$/, "") || "";
  if (app && !ehEnderecoLocal(app)) return app;
  if (render) return render;
  return app || "http://localhost:3000";
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
