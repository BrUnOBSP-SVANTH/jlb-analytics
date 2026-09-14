/**
 * Previsão sobre UM desfecho de um mercado com vários (Champions 2027: 12 times).
 *
 * A spec veio de um defeito concreto: a Calculadora de Edge tratava todo mercado
 * como SIM/NÃO, e uma estimativa de 19% num mercado de 12 times não dizia 19% DE
 * QUÊ. A previsão nascia órfã — impossível de pontuar, impossível de mostrar no
 * track record. Estes testes prendem as quatro regras que tornam a previsão de
 * desfecho pontuável e impedem que ela vire lixo em silêncio.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  addPrediction, previsaoDoDesfecho, somaDasEstimativas, tituloComDesfecho,
  detectResolutions, loadPredictions, type StoredPrediction,
} from "./predictions";
import { reconciliar } from "./predictionsSync";

// O vitest roda em Node, sem localStorage. As funções leem de lá.
function storageEmMemoria() {
  const dados = new Map<string, string>();
  return {
    getItem: (k: string) => dados.get(k) ?? null,
    setItem: (k: string, v: string) => { dados.set(k, String(v)); },
    removeItem: (k: string) => { dados.delete(k); },
    clear: () => dados.clear(),
  };
}

const MERCADO = "poly-2772176";

function registrar(outcomeId: string | null, outcomeLabel: string | null, userProb: number) {
  return addPrediction({
    marketId: MERCADO, question: tituloComDesfecho("UEFA Champions League: 2027 Champion", outcomeLabel),
    marketProb: 18.5, userProb, outcomeId, outcomeLabel,
  });
}

beforeEach(() => { vi.stubGlobal("localStorage", storageEmMemoria()); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("o título carrega o desfecho", () => {
  it("toda tela que lista previsões passa a dizer de qual time é", () => {
    expect(tituloComDesfecho("UEFA Champions League: 2027 Champion", "Barcelona"))
      .toBe("UEFA Champions League: 2027 Champion — Barcelona");
  });

  it("mercado binário não ganha sufixo nenhum", () => {
    expect(tituloComDesfecho("Will the Fed cut in October?", null)).toBe("Will the Fed cut in October?");
    expect(tituloComDesfecho("Will the Fed cut in October?", undefined)).toBe("Will the Fed cut in October?");
  });
});

describe("previsaoDoDesfecho — a base do botão 'Atualizar previsão'", () => {
  it("devolve a versão MAIS RECENTE daquele desfecho, e não de outro", () => {
    registrar("tok-barca", "Barcelona", 19);
    registrar("tok-bayern", "Bayern Munich", 16);
    registrar("tok-barca", "Barcelona", 25);
    expect(previsaoDoDesfecho(MERCADO, "tok-barca")?.userProb).toBe(25);
    expect(previsaoDoDesfecho(MERCADO, "tok-bayern")?.userProb).toBe(16);
    expect(previsaoDoDesfecho(MERCADO, "tok-villa")).toBeNull();
  });

  it("atualizar NÃO apaga a versão anterior — calibração se mede pelo que se disse quando se disse", () => {
    registrar("tok-barca", "Barcelona", 19);
    registrar("tok-barca", "Barcelona", 25);
    const doBarca = loadPredictions().filter((p) => p.outcomeId === "tok-barca");
    expect(doBarca.map((p) => p.userProb)).toEqual([25, 19]);
  });
});

describe("somaDasEstimativas — só um time pode vencer", () => {
  it("soma a última estimativa de cada desfecho, trocando a da tela pela registrada", () => {
    registrar("tok-barca", "Barcelona", 60);
    registrar("tok-bayern", "Bayern Munich", 30);
    // Na tela, o Barcelona foi para 80: a soma usa 80, não os 60 registrados.
    expect(somaDasEstimativas(MERCADO, { outcomeId: "tok-barca", userProb: 80 })).toBe(110);
  });

  it("versão antiga do mesmo desfecho não entra duas vezes", () => {
    registrar("tok-barca", "Barcelona", 19);
    registrar("tok-barca", "Barcelona", 25);
    expect(somaDasEstimativas(MERCADO, { outcomeId: "tok-bayern", userProb: 16 })).toBe(41);
  });

  it("previsão binária do mesmo mercado não contamina a soma", () => {
    registrar(null, null, 70);
    expect(somaDasEstimativas(MERCADO, { outcomeId: "tok-barca", userProb: 19 })).toBe(19);
  });
});

describe("resolução automática — previsão de desfecho fica de fora", () => {
  it("o settlement do mercado (o SIM/NÃO do LÍDER) não é aplicado a um desfecho", async () => {
    const binaria = registrar(null, null, 70);
    const doVilla = registrar("tok-villa", "Aston Villa", 5);
    const pedidos: string[][] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      const { ids } = JSON.parse(String(init?.body ?? "{}")) as { ids: string[] };
      pedidos.push(ids);
      return new Response(JSON.stringify({ settlements: { [MERCADO]: true } }), { status: 200 });
    }));

    const sugestoes = await detectResolutions([binaria, doVilla]);

    expect(sugestoes.map((s) => s.prediction.id)).toEqual([binaria.id]);
    // Nem chegou a pedir: o desfecho saiu antes da chamada.
    expect(pedidos).toEqual([[MERCADO]]);
  });
});

describe("reconciliar — a foto do banco não apaga o desfecho do aparelho", () => {
  const base = (p: Partial<StoredPrediction>): StoredPrediction => ({
    id: "p1", marketId: MERCADO, question: "q", marketProb: 18.5, userProb: 19,
    savedAt: "2026-09-14T12:00:00.000Z", resolved: false, outcome: null, brierScore: null, ...p,
  });

  it("banco sem a migration 030 devolve a linha sem outcome_id — o local fica", () => {
    const local = [base({ outcomeId: "tok-villa", outcomeLabel: "Aston Villa" })];
    const remoto = [base({ userProb: 22 })];          // mais nova no banco, mas sem desfecho
    const [r] = reconciliar(remoto, local);
    expect(r.userProb).toBe(22);                      // remoto continua vencendo no resto
    expect(r.outcomeId).toBe("tok-villa");
    expect(r.outcomeLabel).toBe("Aston Villa");
  });

  it("quando o banco TEM o desfecho, é o dele que vale", () => {
    const [r] = reconciliar([base({ outcomeId: "tok-barca", outcomeLabel: "Barcelona" })], [base({ outcomeId: "tok-villa" })]);
    expect(r.outcomeId).toBe("tok-barca");
  });

  it("as regras antigas continuam: resolução local não é desfeita", () => {
    const local = [base({ resolved: true, outcome: true, brierScore: 0.6561 })];
    const [r] = reconciliar([base({})], local);
    expect(r.resolved).toBe(true);
  });
});
