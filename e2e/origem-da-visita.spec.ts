import { test, expect, type Page } from "@playwright/test";

/**
 * A origem da visita sai no PRIMEIRO page_view, uma vez só, e só com
 * consentimento.
 *
 * Lê o que o app ENTREGA ao navegador para /api/track. O Playwright vê o
 * pedido do sendBeacon (tipo "ping") mas não expõe o corpo quando ele é um
 * Blob — visto na 1ª tentativa: postData() vinha null. Por isso o sendBeacon é
 * envolvido e o corpo, lido do Blob.
 */

type Enviado = { event: string; path: string; meta?: Record<string, unknown> };

async function prepararCaptura(page: Page, consentimento: "completo" | "essencial") {
  await page.addInitScript((c) => {
    localStorage.setItem("jlb_onboarding_v3", "done");
    localStorage.setItem("jlb_consentimento_v1", c);
    const w = window as unknown as { __enviados: unknown[] };
    w.__enviados = [];
    const original = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = (url, data) => {
      if (String(url).endsWith("/api/track") && data instanceof Blob) {
        void data.text().then((t) => w.__enviados.push(JSON.parse(t)));
      }
      return original(url, data);
    };
  }, consentimento);
}

const enviados = (page: Page) =>
  page.evaluate(() => (window as unknown as { __enviados: Enviado[] }).__enviados);

test("com consentimento: a chegada leva o canal, as páginas seguintes não", async ({ page }) => {
  await prepararCaptura(page, "completo");
  await page.goto("/?utm_source=instagram&utm_campaign=lancamento");
  await expect.poll(async () => (await enviados(page)).filter((e) => e.event === "page_view").length)
    .toBeGreaterThanOrEqual(1);

  // Navegação interna: a URL perde as UTMs e o page_view novo vem sem origem.
  await page.evaluate(() => {
    history.pushState(null, "", "/sobre");
    dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect.poll(async () => (await enviados(page)).filter((e) => e.event === "page_view").length)
    .toBeGreaterThanOrEqual(2);

  const [chegada, seguinte] = (await enviados(page)).filter((e) => e.event === "page_view");
  expect(chegada.meta).toEqual({ canal: "instagram", utm_source: "instagram", utm_campaign: "lancamento" });
  expect(seguinte.path).toBe("/sobre");
  expect(seguinte.meta).toBeUndefined();
});

test("sem consentimento: nada sai — nem a origem", async ({ page }) => {
  await prepararCaptura(page, "essencial");
  await page.goto("/?utm_source=instagram");
  await expect(page.locator("h1").first()).toBeVisible();
  await page.waitForTimeout(1_500);
  expect(await enviados(page)).toHaveLength(0);
});
