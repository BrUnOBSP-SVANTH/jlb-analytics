import { test, expect } from "@playwright/test";

/**
 * Publicação nova com a aba aberta — o defeito que a telemetria registrou três
 * vezes entre 05/09 e 16/09 ("Failed to fetch dynamically imported module").
 *
 * Reproduz de verdade em vez de supor: abre a home, faz o arquivo da tela de
 * login SUMIR (como some do servidor depois de um deploy) e navega até ela.
 */

const CRASH_TEXT = "Ocorreu um erro inesperado";

// Pedido que passa pelo service worker não é visto por `page.route` — sem
// isto o "arquivo sumido" chegava do mesmo jeito e o teste passava sem testar
// nada (visto na 1ª execução). Em produção dá no mesmo: o SW pede ao servidor,
// recebe 404 e o import falha igual.
test.use({ serviceWorkers: "block" });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("jlb_onboarding_v3", "done"));
});

test("arquivo de tela sumiu: recarrega uma vez e nunca mostra stack trace", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("h1").first()).toBeVisible();

  // A partir daqui, a tela de login é "da versão anterior": o servidor não a tem.
  await page.route(/\/assets\/Login-[^/]+\.js$/, (r) => r.fulfill({ status: 404, body: "" }));

  let recargas = 0;
  page.on("load", () => { recargas++; });

  await page.evaluate(() => {
    history.pushState(null, "", "/login");
    dispatchEvent(new PopStateEvent("popstate"));
  });

  // Recarregou UMA vez; como o arquivo continua faltando, a trava contra laço
  // segura a segunda recarga e a tela explica em vez de despejar o erro.
  await expect(page.getByText("Saiu uma versão nova do site")).toBeVisible({ timeout: 20_000 });
  expect(recargas).toBe(1);
  await expect(page.getByText(CRASH_TEXT)).toHaveCount(0);

  // O servidor "volta a ter" o arquivo: o botão resolve.
  await page.unroute(/\/assets\/Login-[^/]+\.js$/);
  await page.getByRole("button", { name: "Recarregar página" }).click();
  await expect(page.locator("input[type=email]").first()).toBeVisible({ timeout: 20_000 });
});

test("erro de código continua aparecendo — a recarga não esconde defeito", async ({ page }) => {
  // Contraprova: só o arquivo SUMIDO dispara a recarga. Uma rota inexistente
  // cai no 404 normal, sem recarregar e sem a tela de versão nova.
  let recargas = 0;
  page.on("load", () => { recargas++; });
  await page.goto("/rota-que-nao-existe");
  await expect(page.locator("h1, h2").first()).toBeVisible();
  expect(recargas).toBe(1); // só a carga inicial
  await expect(page.getByText("Saiu uma versão nova do site")).toHaveCount(0);
});
