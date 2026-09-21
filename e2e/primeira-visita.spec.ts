import { test, expect } from "@playwright/test";

/**
 * A PRIMEIRA visita, sem nada pré-marcado — o estado que todo o resto da suíte
 * pula ao gravar `jlb_onboarding_v3` antes de abrir a página.
 *
 * Percorrido no site real em 19/09/2026 (tela de celular): quem chegava numa
 * ficha de mercado recebia o tour de 6 passos por cima dela, e o clique em
 * "Analisar com IA" não chegava ao botão. Quem clicava "Criar conta grátis"
 * caía em "Entre na sua conta".
 */

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test("chegar numa ficha de mercado: nenhum tour por cima, o botão da IA responde", async ({ page }) => {
  await page.goto("/mercados");
  const href = await page.locator("a[href^='/mercados/']").first().getAttribute("href", { timeout: 30_000 })
    .catch(() => null);
  test.skip(!href, "catálogo vazio neste ambiente — sem mercado para abrir");

  // Nova aba = nova chegada, direto na ficha, como quem vem do Google.
  const aba = await page.context().newPage();
  await aba.addInitScript(() => localStorage.removeItem("jlb_onboarding_v3"));
  await aba.goto(href!);
  const botao = aba.getByRole("button", { name: /Analisar com IA/ });
  await expect(botao).toBeVisible({ timeout: 30_000 });
  await aba.waitForTimeout(2_000); // o tour é lazy: dá tempo de ele chegar, se fosse chegar
  await expect(aba.getByRole("dialog", { name: /Bem-vindo/ })).toHaveCount(0);
  await botao.click({ timeout: 5_000 }); // falha se algo interceptar o clique
});

test("chegar pela home: o tour dá as boas-vindas", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("dialog", { name: /Bem-vindo/ })).toBeVisible({ timeout: 15_000 });
});

test("'Criar conta grátis' abre o CADASTRO, não o login", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("jlb_onboarding_v3", "done"));
  await page.goto("/login?modo=cadastro");
  await expect(page.getByText("Crie sua conta gratuita")).toBeVisible();
  await expect(page.getByText("Entre na sua conta")).toHaveCount(0);
});

test("cadastro avisa ANTES quando o e-mail é temporário", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("jlb_onboarding_v3", "done"));
  await page.goto("/login?modo=cadastro");
  const email = page.getByLabel("E-mail");

  await email.fill("alguem@mailinator.com");
  await email.blur();
  await expect(page.getByText("Esse é um e-mail temporário")).toBeVisible({ timeout: 10_000 });

  // Trocou para um e-mail de verdade: o aviso some.
  await email.fill("alguem@gmail.com");
  await email.blur();
  await expect(page.getByText("Esse é um e-mail temporário")).toHaveCount(0, { timeout: 10_000 });
});

test("cadastro: o botão do Google apagado diz o porquê", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("jlb_onboarding_v3", "done"));
  await page.goto("/login?modo=cadastro");
  await expect(page.getByText("Para criar a conta, marque o aceite dos termos abaixo.")).toBeVisible();
  await page.getByRole("checkbox").check();
  await expect(page.getByText("Para criar a conta, marque o aceite dos termos abaixo.")).toHaveCount(0);
});
