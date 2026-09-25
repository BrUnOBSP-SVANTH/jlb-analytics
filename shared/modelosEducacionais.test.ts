import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as modelos from "./modelosEducacionais.ts";

const AQUI = dirname(fileURLToPath(import.meta.url));

/**
 * DES-03 — as dezoito calculadoras da trilha eram matemática pura atrás de
 * dezoito rotas HTTP. Cada clique custava uma ida e volta: ~300ms na produção, e
 * mais de dez segundos quando o plano grátis do Render tinha deixado o serviço
 * dormir. Esperar dez segundos por uma multiplicação faz a pessoa concluir que o
 * site está quebrado — e ela estaria certa, porque a conta podia ter acontecido
 * no aparelho dela.
 *
 * A transcrição foi verificada por três redes ao mesmo tempo: as 26 provas de
 * integração das rotas (que não mudaram uma linha), a captura de referência das
 * 23 respostas (23 de 23 idênticas) e, no navegador com a API BLOQUEADA, a
 * calculadora de valor esperado devolvendo os mesmos −10,00 e 99,4987.
 *
 * Estes testes existem porque agora é possível testar a CONTA sem subir
 * servidor — o que antes exigia um Express efêmero por caso.
 */
describe("a conta é a mesma, agora sem HTTP no meio", () => {
  it("valor esperado: o caso que a referência fixou", () => {
    const r = modelos.ev1({ outcomes: [100, -100], probabilities: [0.45, 0.55] });
    expect(r.ok).toBe(true);
    expect(r.payload.value).toBe(-10);
    expect(r.payload.std).toBeCloseTo(99.4987, 4);
    expect(r.payload.signal).toBe("negative");
  });

  it("margem da casa: três odds dão o overround certo", () => {
    const r = modelos.houseEdge1({ decimal_odds: [2.10, 3.50, 3.20] });
    expect(r.ok).toBe(true);
    // 1/2,10 + 1/3,50 + 1/3,20 = 1,074405 — conferido na mão. (A primeira versão
    // deste teste esperava 1,077381: eu errei a soma, e o teste acusou a MIM.)
    expect(r.payload.overround as number).toBeCloseTo(1.074405, 5);
  });

  it("Bayes: 30% com evidência 4:1 vira 63,2%", () => {
    const r = modelos.bayes1({ prior: 0.3, likelihood_given_true: 0.8, likelihood_given_false: 0.2 });
    expect(r.ok).toBe(true);
    expect(r.payload.posterior as number).toBeCloseTo(0.6316, 3);
  });

  it("divergência: 70% contra 55% é 15 pp", () => {
    const r = modelos.divergence5({ model_probability: 0.7, market_probability: 0.55 });
    expect(r.ok).toBe(true);
    expect(r.payload.divergence as number).toBeCloseTo(0.15, 4);
  });

  it("🔴 entrada inválida devolve ok:false, não um número inventado", () => {
    // Era o defeito: com campo ausente, a calculadora de maturidade dava um
    // diagnóstico sobre a PESSOA e a divergência classificava `null` como
    // "extreme".
    for (const r of [
      modelos.ev1({ outcomes: [1, 2], probabilities: [0.3, 0.3] }),
      modelos.maturity4({ brier_skill: 0.1 }),
      modelos.divergence5({ model_prob: 0.7 }),
      modelos.enso3({ oni: 1.4 }),
    ]) {
      expect(r.ok).toBe(false);
      expect(typeof r.payload.error).toBe("string");
      for (const chave of ["stage", "tier", "value", "posterior"]) {
        expect(r.payload[chave]).toBeUndefined();
      }
    }
  });
});

describe("uma implementação só, usada pelos dois lados", () => {
  it("🔴 a rota não tem conta nenhuma — só encaminha", () => {
    const rota = readFileSync(join(AQUI, "../server/routes/levels.ts"), "utf-8");
    // Se voltar a existir matemática aqui, volta a existir a chance de a API e a
    // tela divergirem — que é o que a mudança eliminou.
    expect(rota).not.toMatch(/Math\.(sqrt|exp|log|pow)/);
    expect(rota).toMatch(/from "\.\.\/\.\.\/shared\/modelosEducacionais\.ts"/);
    // 18 encaminhamentos, um por rota.
    expect((rota.match(/router\.post\(/g) ?? []).length).toBe(18);
  });

  it("🔴 o hook do navegador não vai à rede para conta que sabe fazer", () => {
    const hook = readFileSync(join(AQUI, "../client/src/hooks/useModels.ts"), "utf-8");
    expect(hook).toMatch(/import \* as modelos from "@shared\/modelosEducacionais"/);
    // O mapa cobre as 18; o `fetch` que sobrou é reserva para endereço fora dele.
    // Sem comentários: o cabeçalho deste hook CITA "/api/levelN/*" ao explicar a
    // mudança, e contar essa citação dava 19.
    const semComentarios = hook.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect((semComentarios.match(/"\/api\/level[1-5]\//g) ?? []).length).toBe(18);
  });

  it("⚠️ o cabeçalho X-User-Level saiu — o servidor nunca o leu", () => {
    // Ele só existia na lista de CORS. Era resto do tempo em que o motor de
    // cálculo era Python, e dava a impressão de um gate que não existia.
    const hook = readFileSync(join(AQUI, "../client/src/hooks/useModels.ts"), "utf-8")
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(hook).not.toMatch(/X-User-Level/i);
  });

  it("todas as 18 funções existem e devolvem o contrato", () => {
    const esperadas = [
      "ev1", "houseEdge1", "bayes1", "zscore2", "confidenceInterval2", "correlation2",
      "taylorRule3", "poisson3", "elo3", "garch3", "enso3", "polling3",
      "prospect4", "brier4", "gambler4", "maturity4", "divergence5", "ensemble5",
    ] as const;
    for (const nome of esperadas) {
      const fn = (modelos as unknown as Record<string, unknown>)[nome];
      expect(typeof fn, nome).toBe("function");
      const r = (fn as (c: unknown) => modelos.Resultado)({});
      expect(typeof r.ok, nome).toBe("boolean");
      expect(typeof r.payload, nome).toBe("object");
    }
  });
});
