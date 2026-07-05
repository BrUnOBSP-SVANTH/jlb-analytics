import { describe, it, expect } from "vitest";
import { isStaleMonth } from "./aiCredits.ts";

// Regressão do bloqueio permanente: usuário free em 30/30 levava 429 antes do
// UPDATE, então o trigger de reset mensal nunca disparava. A leitura precisa
// tratar mês antigo como cota zerada.
describe("isStaleMonth", () => {
  const now = new Date("2026-07-15T12:00:00Z");

  it("mês anterior é stale (cota deve zerar)", () => {
    expect(isStaleMonth("2026-06-01", now)).toBe(true);
  });

  it("ano anterior é stale", () => {
    expect(isStaleMonth("2025-12-01", now)).toBe(true);
  });

  it("mês corrente NÃO é stale", () => {
    expect(isStaleMonth("2026-07-01", now)).toBe(false);
  });

  it("aceita timestamp completo do Postgres", () => {
    expect(isStaleMonth("2026-06-01T00:00:00+00:00", now)).toBe(true);
    expect(isStaleMonth("2026-07-01T00:00:00+00:00", now)).toBe(false);
  });
});
