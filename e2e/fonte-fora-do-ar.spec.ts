import { test, expect } from "@playwright/test";

/**
 * O teste que faltava: derrubar UMA fonte e exigir que a tela ADMITA.
 *
 * Em 17/09 a /mercados carregava as quatro fontes com `Promise.allSettled` —
 * quem falhasse virava lista vazia em silêncio. O filtro "Manifold" levava a um
 * vazio explicado como "algumas categorias ficam vazias por horas" e o
 * subtítulo seguia prometendo as três bolsas. Nenhum teste via isso, porque
 * todos deixam as APIs reais responderem.
 */

const CRASH_TEXT = "Ocorreu um erro inesperado";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("jlb_onboarding_v3", "done"));
});

test("Manifold fora do ar: a tela diz, em vez de mostrar vazio sem motivo", async ({ page }) => {
  await page.route("**/api/manifold/**", (route) => route.abort("connectionrefused"));
  await page.goto("/mercados");

  // O subtítulo para de prometer a fonte que não respondeu...
  // Prazo largo de propósito: a frase só muda DEPOIS da primeira carga, e aqui
  // as bolsas são as APIs reais — servidor frio já levou mais de 5s.
  const subtitulo = page.locator("p", { hasText: "precificando agora" }).first();
  await expect(subtitulo).toContainText("Manifold não respondeu nesta atualização", { timeout: 45_000 });
  await expect(subtitulo).not.toContainText("Kalshi e Manifold estão");

  // ...a pastilha do filtro avisa antes do clique...
  await expect(page.getByRole("button", { name: /Manifold, sem resposta/ })).toBeVisible();

  // ...e quem clica recebe a causa certa, com saída.
  await page.getByRole("button", { name: /Manifold, sem resposta/ }).click();
  await expect(page.getByText("Manifold não respondeu agora")).toBeVisible();
  await expect(page.getByRole("button", { name: "Tentar de novo" })).toBeVisible();
  await expect(page.getByText(CRASH_TEXT)).toHaveCount(0);
});

test("com as fontes de pé, o subtítulo segue sendo a promessa das três", async ({ page }) => {
  await page.goto("/mercados");
  const subtitulo = page.locator("p", { hasText: "precificando agora" }).first();
  await expect(subtitulo).toContainText("Polymarket, Kalshi e Manifold estão precificando agora");
  await expect(subtitulo).not.toContainText("não respondeu");
});
