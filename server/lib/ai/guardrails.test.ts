import { describe, it, expect } from "vitest";
import { clampFairValue, quantFairValue, capConfidence, CONFIDENCE_CEILING, semHistoricoInventado } from "./guardrails.ts";

describe("clampFairValue — dentro do permitido, passa igual", () => {
  it("não mexe quando a estimativa está a ≤15pp do mercado", () => {
    expect(clampFairValue(58, 45)).toBe(58); // +13pp, ok
    expect(clampFairValue(35, 45)).toBe(35); // -10pp, ok
    expect(clampFairValue(45, 45)).toBe(45); // igual ao mercado
  });
});

describe("clampFairValue — trava o desvio em ±15pp do mercado", () => {
  it("corta estimativa muito acima para market+15", () => {
    // mercado 45, IA disse 90 → deveria virar 60 (o buraco do '42% vs 21%')
    expect(clampFairValue(90, 45)).toBe(60);
  });
  it("corta estimativa muito abaixo para market-15", () => {
    // mercado 80, IA disse 10 → 65
    expect(clampFairValue(10, 80)).toBe(65);
  });
  it("no limite exato de ±15pp não corta", () => {
    expect(clampFairValue(60, 45)).toBe(60);
    expect(clampFairValue(30, 45)).toBe(30);
  });
});

describe("clampFairValue — respeita a faixa 5-95", () => {
  it("piso 5 vence mesmo dentro do ±15pp", () => {
    // mercado 12, IA disse 0 → market-15 = -3, mas piso é 5
    expect(clampFairValue(0, 12)).toBe(5);
  });
  it("teto 95 vence mesmo dentro do ±15pp", () => {
    // mercado 92, IA disse 100 → market+15 = 107, mas teto é 95
    expect(clampFairValue(100, 92)).toBe(95);
  });
});

describe("clampFairValue — maxDev configurável (crossref usa ±20)", () => {
  it("permite desvio de até 20pp quando maxDev=20", () => {
    // mercado 40, IA disse 65 → +25pp cortado para 60 (market+20)
    expect(clampFairValue(65, 40, 20)).toBe(60);
    // dentro de 20pp passa
    expect(clampFairValue(58, 40, 20)).toBe(58);
  });
});

describe("clampFairValue — casos de borda", () => {
  it("mercado extremo baixo aperta a banda (não deixa quadruplicar as chances)", () => {
    expect(clampFairValue(50, 3)).toBe(8);  // folga=3 → dev=5 → market+5 (antes ia a 18)
    expect(clampFairValue(1, 3)).toBe(5);   // piso
  });
  it("mercado extremo alto aperta a banda", () => {
    expect(clampFairValue(50, 97)).toBe(92); // folga=3 → dev=5 → market-5 (antes ia a 82)
    expect(clampFairValue(99, 97)).toBe(95); // teto
  });
});

describe("clampFairValue — banda encolhe na cauda, cheia no meio", () => {
  it("na cauda baixa, o desvio permitido = folga até a borda (mín 5pp)", () => {
    expect(clampFairValue(68, 5)).toBe(10);  // folga=5 → dev=5 → max 10 (o buraco '68% vs 5%')
    expect(clampFairValue(42, 6)).toBe(12);  // folga=6 → dev=6 → max 12
    expect(clampFairValue(80, 10)).toBe(20); // folga=10 → dev=10 → max 20
  });
  it("no meio (15–85%) a banda segue cheia de ±15pp", () => {
    expect(clampFairValue(90, 45)).toBe(60); // dev=15 (inalterado)
    expect(clampFairValue(70, 15)).toBe(30); // folga=15 → dev=15 → max 30
    expect(clampFairValue(5, 85)).toBe(70);  // folga=15 → dev=15 → min 70
  });
});

describe("quantFairValue — fair value quantitativo (fallback do /fair-value)", () => {
  it("sem liquidez/momentum: média 50/50 entre base rate e mercado", () => {
    // 30*0.5 + 50*0.5 = 40
    expect(quantFairValue(50, 30).clampedPreFV).toBe(40);
  });
  it("alta liquidez pesa mais o mercado (0.75)", () => {
    // 30*0.25 + 50*0.75 = 45
    expect(quantFairValue(50, 30, { liquidity: 200_000 }).clampedPreFV).toBe(45);
  });
  it("baixa liquidez pesa mais a base rate (0.35)", () => {
    // 30*0.65 + 50*0.35 = 37
    expect(quantFairValue(50, 30, { liquidity: 500 }).clampedPreFV).toBe(37);
  });
  it("momentum moderado soma leve tendência", () => {
    // 40 + 5*0.2 = 41
    expect(quantFairValue(50, 30, { weekPriceChange: 5 }).clampedPreFV).toBe(41);
  });
  it("movimento extremo vira reversão à média (sinal invertido)", () => {
    // 40 + (-20*0.3) = 34
    expect(quantFairValue(50, 30, { weekPriceChange: 20 }).clampedPreFV).toBe(34);
  });
  it("respeita o piso 5 em mercado/base rate extremos", () => {
    const r = quantFairValue(2, 2);
    expect(r.preFairValue).toBe(2);
    expect(r.clampedPreFV).toBe(5);
  });
});

describe("capConfidence — impõe os tetos de calibração por domínio/horizonte", () => {
  it("corta cripto/finanças curto prazo a 62 (mercados quase-eficientes)", () => {
    expect(capConfidence("crypto", "short", 88)).toBe(62);
    expect(capConfidence("finance", "short", 90)).toBe(62);
  });
  it("corta esportes: 1 jogo a 78, torneio a 65", () => {
    expect(capConfidence("sports", "short", 95)).toBe(78);
    expect(capConfidence("sports", "long", 80)).toBe(65);
  });
  it("corta tecnologia longo prazo a 55 (disrupção imprevisível)", () => {
    expect(capConfidence("science", "long", 82)).toBe(55);
  });
  it("não mexe quando a confiança já está abaixo do teto", () => {
    expect(capConfidence("crypto", "short", 55)).toBe(55);
  });
  it("combo sem regra explícita cai no teto geral", () => {
    expect(capConfidence("energy", "medium", 99)).toBe(CONFIDENCE_CEILING);
    expect(capConfidence("crypto", "long", 99)).toBe(CONFIDENCE_CEILING); // cripto só tem regra p/ short
  });
});

describe("semHistoricoInventado — dado NOSSO fabricado é o erro mais caro", () => {
  // Auditoria de 06/09: o prompt proibia e a IA escreveu mesmo assim "nosso
  // histórico aponta base rate de 50%" num mercado sem amostra. Instrução em
  // texto é pedido; isto aqui é garantia.
  const comAlegacao = "O preço está em 42%. O nosso histórico medido mostra 80 mercados com favorito vencendo. "
    + "A notícia da BBC de 28/08 aponta indecisos. O prazo é longo e a liquidez é alta neste evento.";

  it("não toca no texto quando o histórico EXISTE de verdade", () => {
    expect(semHistoricoInventado(comAlegacao, true)).toBe(comAlegacao);
  });

  it("corta só a frase que alega, preservando o resto", () => {
    const limpo = semHistoricoInventado(comAlegacao, false);
    expect(limpo).not.toMatch(/nosso histórico medido/i);
    expect(limpo).toMatch(/BBC/);          // o que estava certo continua
    expect(limpo).toMatch(/42%/);
  });

  it("pega as várias formas de alegar", () => {
    for (const frase of [
      "Acompanhamos 120 mercados desta categoria até o fim.",
      "Nossa base proprietária indica tendência de alta.",
      "O histórico proprietário da JLB aponta 70% de acerto.",
    ]) {
      const texto = `${frase} O preço de mercado está em 30% e a liquidez é baixa neste evento específico.`;
      expect(semHistoricoInventado(texto, false)).not.toMatch(/\d+ mercados|propriet/i);
    }
  });

  it("quando a alegação era o texto inteiro, diz a verdade em vez de devolver caco", () => {
    const r = semHistoricoInventado("Nosso histórico medido mostra 80 mercados.", false);
    expect(r).toMatch(/não temos amostra própria/i);
    expect(r.length).toBeGreaterThan(60);
  });

  it("NÃO quebra dentro de número decimal", () => {
    // O separador ingênuo (dividir em todo ponto) cortava "89.6%" ao meio e
    // produzia "O preço está em 30%.6% de acerto" — texto sem sentido entregue
    // ao usuário sem erro nenhum no console. Decimal é o formato dos NOSSOS
    // próprios números, então o caso é a regra, não a exceção.
    const t = "O preço está em 30%. O nosso histórico em 106 mercados mostra 89.6% de acerto. "
      + "A liquidez é baixa e o prazo é longo neste evento específico.";
    const r = semHistoricoInventado(t, false);
    expect(r).not.toMatch(/%\.\d/);        // nada de "30%.6%"
    expect(r).not.toMatch(/89\.6/);         // a alegação saiu inteira
    expect(r).toMatch(/O preço está em 30%\./);
    expect(r).toMatch(/liquidez é baixa/);
  });

  it("texto sem alegação nenhuma passa intacto", () => {
    const normal = "O preço está em 42% e a liquidez é alta. A BBC noticiou em 28/08.";
    expect(semHistoricoInventado(normal, false)).toBe(normal);
    expect(semHistoricoInventado("", false)).toBe("");
  });
});
