import { describe, it, expect } from "vitest";
import { serieDiaria } from "./serieDiaria";

const DIA = 86_400;
const AGORA = Date.UTC(2026, 8, 14, 12) / 1000;

describe("serieDiaria — um ponto por dia, sem inventar dia", () => {
  it("fica com o ÚLTIMO preço de cada dia, em 0–100", () => {
    const s = serieDiaria([
      { t: AGORA - DIA - 3600, p: 0.40 },
      { t: AGORA - DIA - 60, p: 0.42 },   // mesmo dia, mais tarde → vence
      { t: AGORA - 60, p: 0.5 },
    ], 90, AGORA);
    expect(s.map((x) => Math.round(x.p))).toEqual([42, 50]);
  });

  it("dia sem negociação não ganha ponto", () => {
    const s = serieDiaria([{ t: AGORA - 5 * DIA, p: 0.3 }, { t: AGORA - DIA, p: 0.35 }], 90, AGORA);
    expect(s).toHaveLength(2);
  });

  it("corta a janela e descarta ponto inválido", () => {
    const s = serieDiaria([
      { t: AGORA - 100 * DIA, p: 0.2 },   // fora dos 90 dias
      { t: AGORA - 2 * DIA, p: NaN },
      { t: AGORA - 2 * DIA, p: 1.4 },     // fora de 0–1
      { t: AGORA + DIA, p: 0.5 },         // futuro
      { t: AGORA - 3 * DIA, p: 0.61 },
    ], 90, AGORA);
    expect(s).toEqual([{ t: AGORA - 3 * DIA, p: 61 }]);
  });

  it("sai em ordem cronológica mesmo com a entrada embaralhada", () => {
    const s = serieDiaria([{ t: AGORA - DIA, p: 0.2 }, { t: AGORA - 3 * DIA, p: 0.1 }, { t: AGORA - 2 * DIA, p: 0.15 }], 90, AGORA);
    expect(s.map((x) => x.t)).toEqual([AGORA - 3 * DIA, AGORA - 2 * DIA, AGORA - DIA]);
  });
});
