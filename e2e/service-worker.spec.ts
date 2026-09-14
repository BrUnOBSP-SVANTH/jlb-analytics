import { test, expect, type Page } from "@playwright/test";

/**
 * O service worker e a primeira visita — os dois estados que NENHUM outro teste
 * de navegador deste repositório via.
 *
 * Todo teste daqui abria contexto novo (sem SW registrado), e o `smoke.spec.ts`
 * ainda pré-marca o tour como visto. Com isso, dois defeitos conviveram com uma
 * suíte verde:
 *
 *   1. O tour cobria o formulário de /login na primeira visita — ninguém
 *      conseguia entrar (commit 581a26e).
 *   2. O SW servia o HTML do cache: depois de um deploy o navegador seguia
 *      rodando o build antigo, e no servidor de dev a tela ficava branca. Foi
 *      assim que o conserto do item 1 ficou no ar sem alcançar o fundador.
 *
 * Roda contra o build de produção (ver playwright.config.ts). ⚠️ Faça o build
 * com `NODE_ENV=production pnpm build`: o `.env` local traz NODE_ENV=development
 * e o Vite o respeita, gerando React de desenvolvimento — onde o SW nem é
 * registrado, e o primeiro teste abaixo falha dizendo isso.
 */

/** Espera o SW assumir a página. Sem isso, "não veio do SW" seria verdade por ausência. */
async function esperarSW(page: Page) {
  const assumiu = await page
    .waitForFunction(() => !!navigator.serviceWorker?.controller, undefined, { timeout: 20_000 })
    .then(() => true, () => false);
  expect(
    assumiu,
    "O service worker não assumiu a página. O build é de produção? (NODE_ENV=production pnpm build)",
  ).toBe(true);
}

test("o documento HTML nunca é servido pelo service worker", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("jlb_onboarding_v3", "done"));
  await page.goto("/");
  await esperarSW(page);

  // Recarga já com o SW no controle: é aqui que a versão antiga devolvia o
  // HTML congelado.
  const doc = await page.reload();
  expect(doc, "a recarga não devolveu resposta").not.toBeNull();
  expect(doc!.fromServiceWorker(), "o HTML veio do service worker — o site congela no build antigo").toBe(false);
  await expect(page.locator("#root > *").first()).toBeAttached();
});

test("/api/ não passa pelo cache do service worker", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("jlb_onboarding_v3", "done"));
  await page.goto("/");
  await esperarSW(page);

  const [resposta] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/health")),
    page.evaluate(() => fetch("/api/health").catch(() => null)),
  ]);
  // Resposta de /api/ servida pelo SW é dado possivelmente de OUTRO usuário
  // num aparelho compartilhado — a versão antiga cacheava as autenticadas.
  expect(resposta.fromServiceWorker()).toBe(false);
});

test("o SW só guarda /assets/ — nunca documento nem /api/", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("jlb_onboarding_v3", "done"));
  await page.goto("/");
  await esperarSW(page);
  await page.reload();
  await page.waitForTimeout(1500);

  const guardados = await page.evaluate(async () => {
    const saida: string[] = [];
    for (const nome of await caches.keys()) {
      for (const req of await (await caches.open(nome)).keys()) saida.push(new URL(req.url).pathname);
    }
    return saida;
  });
  const indevidos = guardados.filter((p) => !p.startsWith("/assets/"));
  expect(indevidos, `o SW guardou fora de /assets/: ${indevidos.join(", ")}`).toEqual([]);
});

test("primeira visita em /login: o formulário é alcançável", async ({ page }) => {
  // SEM pré-marcar o tour. É exatamente o estado que o smoke.spec.ts pula.
  await page.goto("/login");
  const email = page.locator('input[type="email"]');
  await expect(email).toBeVisible();
  await page.waitForTimeout(3000);   // o tour é lazy: dá tempo de ele chegar, se fosse chegar

  // `trial` faz todas as checagens de clique (inclusive "outro elemento
  // intercepta") sem clicar de fato. É a checagem que acusava o tour.
  await email.click({ trial: true, timeout: 5_000 });
  await email.fill("primeira-visita@example.com");
  await page.locator('input[type="password"]').fill("QualquerSenha123");
  await page.locator('button[type="submit"]').click({ trial: true, timeout: 5_000 });
});
