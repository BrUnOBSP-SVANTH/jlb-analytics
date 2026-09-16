/**
 * Service Worker — JLB Analytics
 *
 * ⚠️ O DEFEITO QUE ESTE ARQUIVO CAUSOU, E QUE NÃO PODE VOLTAR.
 *
 * A versão anterior aplicava "stale-while-revalidate" a TODO GET que não fosse
 * /api/ — inclusive à navegação, ou seja, ao próprio HTML — e pré-cacheava "/".
 * O nome do cache era a constante "jlb-v1", e o `activate` só apagava caches de
 * nome DIFERENTE: como o nome nunca mudava, nada era invalidado, nunca.
 *
 * Resultado medido em 13/09/2026 (scripts/repro-sw.mjs): depois de um deploy o
 * servidor entregava `index-DSMD3CWe.js` e o navegador seguia rodando
 * `index-D7HB5of9.js`. O site abria bonito com código velho, e NENHUMA correção
 * publicada chegava a quem já tinha visitado. Foi assim que o conserto do login
 * (commit 581a26e) ficou no ar sem alcançar o fundador.
 *
 * No servidor de desenvolvimento era pior: o SW cacheava os módulos do Vite, que
 * mudam de versão quando as dependências são reotimizadas. O HTML congelado
 * pedia módulos que não existiam mais, o React não montava, e a tela ficava
 * BRANCA — com o token do login com Google parado na URL, sem ninguém para
 * consumi-lo. (Por isso o SW agora nem é registrado em dev: ver hooks/usePWA.ts.)
 *
 * Nenhum teste pegou porque todo teste de navegador deste repositório abre um
 * contexto novo, sem service worker. `scripts/repro-sw.mjs` é o que reproduz.
 *
 * AS REGRAS DESTA VERSÃO:
 *
 *   1. O DOCUMENTO NUNCA SAI DO CACHE. Navegação vai sempre à rede. É o HTML que
 *      diz quais arquivos com hash carregar; congelá-lo congela o site inteiro.
 *      O Express já o serve com `no-cache` + ETag, então a rede custa pouco.
 *
 *   2. /api/ NÃO É CACHEADO. A versão anterior guardava respostas autenticadas
 *      (créditos de IA, histórico de calibração): num aparelho compartilhado,
 *      uma falha de rede depois do logout servia o dado do usuário anterior.
 *
 *   3. SÓ /assets/ É CACHEADO, e em cache-first. O nome desses arquivos carrega o
 *      hash do conteúdo — um arquivo com aquele nome nunca muda — então é o
 *      único lugar onde cachear é seguro. E só resposta `ok`: a versão anterior
 *      guardava 404 também.
 *
 *   4. O NOME DO CACHE MUDA QUANDO A ESTRATÉGIA MUDA. Trocar "jlb-v1" por
 *      "jlb-v2" faz o `activate` apagar o cache envenenado de quem receber este
 *      arquivo. É o mecanismo de auto-cura — e o teste ao lado exige que o nome
 *      antigo nunca volte.
 *
 * O SW não pode simplesmente sumir: os alertas de watchlist (Web Push) dependem
 * dele — ver hooks/usePushNotifications.ts.
 */

const CACHE_NAME = "jlb-v2";

// ── Install: nada pré-cacheado ─────────────────────────────────────────────
// Pré-cachear "/" era a linha que congelava a home.
self.addEventListener("install", () => {
  self.skipWaiting();
});

// ── Activate: apaga todo cache de outra versão (inclui o "jlb-v1") ────────
/**
 * Teto de arquivos guardados.
 *
 * O nome do cache é constante entre deploys (de propósito: trocá-lo apaga tudo
 * de todo mundo), então cada build novo acrescenta os arquivos dele e os do
 * build anterior ficavam ali para sempre — 87 entradas na medição da auditoria
 * de 14/09 (item 28), e crescendo. O navegador acaba despejando o cache inteiro
 * quando a cota estoura, que é o pior momento possível.
 *
 * `cache.keys()` devolve na ordem em que entraram, então os primeiros são os
 * mais antigos. 120 cobre com folga os arquivos de um build (87 na medição) e
 * ainda deixa o anterior inteiro para quem está com uma aba velha aberta.
 */
const MAX_ARQUIVOS = 120;

async function podarCache() {
  const cache = await caches.open(CACHE_NAME);
  const chaves = await cache.keys();
  const sobrando = chaves.length - MAX_ARQUIVOS;
  if (sobrando <= 0) return;
  await Promise.all(chaves.slice(0, sobrando).map((k) => cache.delete(k)));
}

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => podarCache())
      .then(() => self.clients.claim())
  );
});

// ── Fetch ──────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Sem `respondWith`, o navegador segue o caminho normal (rede + cache HTTP).
  if (request.method !== "GET") return;
  if (request.mode === "navigate") return;            // regra 1

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith("/assets/")) return;   // regras 2 e 3

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const guardado = await cache.match(request);
      if (guardado) return guardado;
      const resposta = await fetch(request);
      if (resposta.ok) cache.put(request, resposta.clone());
      return resposta;
    })
  );
});

// ── Web Push: alertas de watchlist ────────────────────────────────────────
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { /* payload inválido */ }
  const title = data.title || "JLB Analytics";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "Um mercado da sua watchlist se moveu.",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: data.url || "/apostas" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/apostas";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const win of wins) {
        if ("focus" in win) { win.navigate(url); return win.focus(); }
      }
      return clients.openWindow(url);
    })
  );
});
