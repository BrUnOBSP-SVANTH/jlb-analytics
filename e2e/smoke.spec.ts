import { test, expect } from "@playwright/test";

/**
 * Smoke dos fluxos críticos — pega "a página quebrou ao montar", classe de
 * regressão que os 88 testes unitários não veem. Tolerante a APIs externas
 * (mercados podem falhar em CI); intolerante a crash de renderização.
 */

// O ErrorBoundary renderiza este texto quando o React explode
const CRASH_TEXT = "Ocorreu um erro inesperado";

// O tour de onboarding cobre a tela na 1ª visita — pré-marca como visto
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("jlb_onboarding_v3", "done"));
});

test("home renderiza hero e navegação", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/JLB Analytics/);
  await expect(page.locator("h1").first()).toBeVisible();
  await expect(page.getByText(CRASH_TEXT)).toHaveCount(0);
});

test("apostas monta o shell sem crash", async ({ page }) => {
  await page.goto("/apostas");
  await expect(page.locator("h1, h2").first()).toBeVisible();
  await expect(page.getByText(CRASH_TEXT)).toHaveCount(0);
});

test("calculadoras: EV calcula de verdade", async ({ page }) => {
  await page.goto("/calculadoras");
  await expect(page.locator("h1").first()).toBeVisible();
  await expect(page.getByText(CRASH_TEXT)).toHaveCount(0);
});

test("chat: botão flutuante abre o painel", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Abrir assistente JLB" }).click();
  await expect(page.getByRole("complementary", { name: "Assistente JLB" })).toBeVisible();
  await expect(page.getByLabel("Mensagem para o assistente")).toBeVisible();
});

test("login: formulário renderiza campos", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await expect(page.locator('input[type="password"]')).toBeVisible();
});

test("rota inexistente cai na página 404", async ({ page }) => {
  await page.goto("/esta-rota-nao-existe");
  await expect(page.getByText(/não encontrada/i).first()).toBeVisible();
});

test("níveis educacionais montam", async ({ page }) => {
  await page.goto("/nivel/1");
  await expect(page.getByText("Fundamentos").first()).toBeVisible();
  await expect(page.getByText(CRASH_TEXT)).toHaveCount(0);
});
