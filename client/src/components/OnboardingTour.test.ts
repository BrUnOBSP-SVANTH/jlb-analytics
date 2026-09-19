import { describe, it, expect } from "vitest";
import { tourAbre } from "./OnboardingTour";

describe("tourAbre — o tour só recebe quem chegou pela home", () => {
  it("chegou pela home e está nela: abre", () => {
    expect(tourAbre("/", "/")).toBe(true);
  });

  it("chegou numa ficha de mercado (Google, link compartilhado): não abre", () => {
    // O caso percorrido em 19/09: 6 passos por cima do mercado que a pessoa veio ver.
    expect(tourAbre("/mercados/kalshi-KXTREASBUYBTC-26AUG-27JAN01", "/mercados/kalshi-KXTREASBUYBTC-26AUG-27JAN01")).toBe(false);
  });

  it("chegou por outra página e depois foi à home: não interrompe no meio da navegação", () => {
    expect(tourAbre("/mercados", "/")).toBe(false);
  });

  it("formulário de login nunca é coberto — o defeito de 16/09 continua fechado", () => {
    expect(tourAbre("/login", "/login")).toBe(false);
    expect(tourAbre("/reset-password", "/reset-password")).toBe(false);
  });
});
