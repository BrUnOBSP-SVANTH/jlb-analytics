import { describe, it, expect } from "vitest";
import { renovaEm } from "./CotaDeAnalises";

describe("renovaEm — quando a cota volta a zero", () => {
  it("no meio do mês, aponta para o dia 1º do seguinte", () => {
    expect(renovaEm(new Date("2026-09-21T15:00:00Z"))).toBe("1º de outubro");
  });

  it("dezembro vira janeiro — a virada de ano não quebra", () => {
    expect(renovaEm(new Date("2026-12-15T12:00:00Z"))).toBe("1º de janeiro");
  });

  it("segue o relógio do servidor (UTC), não o fuso de quem lê", () => {
    // 30/09 às 23h em Brasília já é 01/10 em UTC: a cota já renovou.
    expect(renovaEm(new Date("2026-10-01T02:00:00Z"))).toBe("1º de novembro");
  });
});
