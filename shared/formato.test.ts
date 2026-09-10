import { describe, it, expect } from "vitest";
import {
  num, pct, pctDeProb, pp, magnitude, dolar, real, reaisExatos,
  plural, tempoRestante, haQuantoTempo,
} from "./formato.ts";

/**
 * Cada caso abaixo saiu da auditoria — é literalmente o que estava impresso na
 * tela. Prender o formato em teste é o que impede a regressão silenciosa: um
 * número mal formatado não quebra build nem derruba página, só faz o site
 * parecer feito por quem não fala português.
 */
describe("número em pt-BR", () => {
  it("usa vírgula decimal e ponto de milhar", () => {
    expect(num(1234.5, 1)).toBe("1.234,5");
    expect(num(0.144, 3)).toBe("0,144");
  });

  it("devolve travessão em vez de NaN", () => {
    // `NaN%` na tela é pior que campo vazio: parece dado.
    expect(num(NaN)).toBe("—");
    expect(num(null)).toBe("—");
    expect(pct(undefined)).toBe("—");
    expect(magnitude(Infinity)).toBe("—");
  });
});

describe("porcentagem e ponto percentual", () => {
  it("pct recebe 0–100, pctDeProb recebe 0–1", () => {
    // Os dois nomes existem para tornar a escala impossível de confundir.
    expect(pct(72)).toBe("72%");
    // Pedir uma casa entrega uma casa, com vírgula — o defeito apontado na
    // auditoria era o ponto decimal (`72.0%`), não a casa.
    expect(pct(72.04, 1)).toBe("72,0%");
    expect(pctDeProb(0.53)).toBe("53%");
  });

  it("pp leva sinal e uma casa", () => {
    expect(pp(2.5)).toBe("+2,5 pp");
    expect(pp(-2.5)).toBe("−2,5 pp");
    expect(pp(0)).toBe("0,0 pp");
  });

  it("pp de 50 é 50 pp — não 5000", () => {
    // O achado nº 1 da auditoria: o sino mostrava `+5000.0pp` porque a tela
    // multiplicava por 100 um valor que o servidor já mandava em pp.
    expect(pp(50)).toBe("+50,0 pp");
  });
});

describe("magnitude", () => {
  it("US$ 1,27 bi não vira $1273912k", () => {
    // Exatamente o card da home que a auditoria fotografou.
    expect(magnitude(1_273_912_000)).toBe("1,27 bi");
    expect(dolar(1_273_912_000)).toBe("US$ 1,27 bi");
  });

  it("só põe decimal quando ele informa", () => {
    expect(magnitude(701_349_000)).toBe("701 mi");   // 701,0 mi não acrescenta nada
    expect(magnitude(2_400_000)).toBe("2,4 mi");
    expect(magnitude(108_600_000)).toBe("109 mi");
    expect(magnitude(898_000)).toBe("898 mil");
    expect(magnitude(2_000)).toBe("2 mil");
    expect(magnitude(540)).toBe("540");
  });

  it("negativo usa o sinal de menos tipográfico", () => {
    expect(magnitude(-2_400_000)).toBe("−2,4 mi");
  });

  it("real acompanha a mesma régua", () => {
    expect(real(554_000_000)).toBe("R$ 554 mi");
    expect(reaisExatos(1234.56)).toMatch(/^R\$\s?1\.234,56$/);
  });
});

describe("plural", () => {
  it("1 posição, 2 posições — sem (ões)", () => {
    expect(plural(1, "posição", "posições")).toBe("1 posição");
    expect(plural(2, "posição", "posições")).toBe("2 posições");
    expect(plural(0, "posição", "posições")).toBe("0 posições");
  });
});

describe("tempo", () => {
  it("não repete a palavra 'restantes' dentro do valor", () => {
    // "Encerra em: 6d 3h restantes" dizia duas vezes a mesma coisa (DET-09).
    expect(tempoRestante((6 * 24 + 3) * 3_600_000)).toBe("6d 3h");
    expect(tempoRestante(6 * 24 * 3_600_000)).toBe("6d");
    expect(tempoRestante(80 * 60_000)).toBe("1h 20min");
    expect(tempoRestante(12 * 60_000)).toBe("12min");
    expect(tempoRestante(-1)).toBe("encerrado");
  });

  it("fala do lado do usuário, não do lado do cache", () => {
    // "snapshot de mercados há 16min" era jargão nosso vazando (TRV-19).
    expect(haQuantoTempo(Date.now() - 16 * 60_000)).toBe("há 16 minutos");
    expect(haQuantoTempo(Date.now() - 60_000)).toBe("há 1 minuto");
    expect(haQuantoTempo(Date.now() - 3 * 3_600_000)).toBe("há 3 horas");
    expect(haQuantoTempo(Date.now())).toBe("agora");
    expect(haQuantoTempo(null)).toBe("—");
  });
});
