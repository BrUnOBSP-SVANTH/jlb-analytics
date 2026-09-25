import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { copiaUtilizavel, VALIDADE_DA_COPIA_MS } from "./catalogoPersistido.ts";

const AQUI = dirname(fileURLToPath(import.meta.url));
const ler = (rel: string) => readFileSync(join(AQUI, rel), "utf-8");

/**
 * DES-02 — o catálogo era montado DENTRO do pedido de alguém.
 *
 * Medido em 25/09 na produção: a primeira chamada a /api/polymarket/markets
 * depois de o serviço subir levou 10,5s; a segunda, 0,3s. E quase todo
 * visitante é o primeiro — o plano grátis do Render dorme em 15 minutos e o
 * site recebe cerca de 53 pessoas por mês.
 *
 * A cópia no banco resolve porque o custo dela é REDE, não CPU: medido, 374 KB
 * em 660ms de download com 1ms de parse. Sob 0,1 CPU, montar continua caro e
 * ler continua barato.
 */
const AGORA = new Date("2026-09-25T18:00:00Z").getTime();
const hAtras = (h: number) => new Date(AGORA - h * 3_600_000).toISOString();

describe("a cópia só serve enquanto ainda é quase verdade", () => {
  it("cópia recente serve", () => {
    expect(copiaUtilizavel(hAtras(1), AGORA)).toBe(true);
    expect(copiaUtilizavel(hAtras(5.9), AGORA)).toBe(true);
  });

  it("🔴 cópia velha demais NÃO serve — preço de ontem não é preço", () => {
    // Seis horas cobrem uma noite inteira de serviço dormindo sem atravessar um
    // dia de mercado. Passou disso, a rota monta do zero: melhor esperar do que
    // mostrar um mercado que já fechou.
    expect(copiaUtilizavel(hAtras(7), AGORA)).toBe(false);
    expect(VALIDADE_DA_COPIA_MS).toBe(6 * 60 * 60 * 1000);
  });

  it("⚠️ data no FUTURO é relógio errado, não cópia fresca", () => {
    // Sem esta guarda, um relógio adiantado no banco faria a cópia parecer
    // eterna — e ela seria servida para sempre.
    expect(copiaUtilizavel(new Date(AGORA + 2 * 3_600_000).toISOString(), AGORA)).toBe(false);
  });

  it("sem data, sem cópia", () => {
    expect(copiaUtilizavel(null, AGORA)).toBe(false);
    expect(copiaUtilizavel(undefined, AGORA)).toBe(false);
    expect(copiaUtilizavel("não é data", AGORA)).toBe(false);
  });
});

describe("servir cópia sem dizer que é cópia seria mentir", () => {
  const poly = ler("../routes/polymarket.ts");
  const kalshi = ler("../routes/kalshi.ts");

  it("🔴 as duas rotas marcam a resposta e dizem de quando é", () => {
    for (const [nome, fonte] of [["polymarket", poly], ["kalshi", kalshi]] as const) {
      expect(fonte, nome).toMatch(/source: "arquivo"/);
      expect(fonte, nome).toMatch(/atualizadoEm: copia\.atualizadoEm/);
    }
  });

  it("a montagem continua acontecendo — a cópia é ponte, não destino", () => {
    // Sem isto, o site serviria a mesma cópia para sempre e ela envelheceria
    // até parar de passar na régua — aí TODO mundo voltaria a esperar a
    // montagem, e o conserto teria virado o problema.
    expect(poly).toMatch(/void swr<PolyMarket\[\]>\(cacheKey, 90, \(\) => montarCatalogoPoly/);
    expect(kalshi).toMatch(/void swr<KalshiMarket\[\]>\("kalshi:markets", 120, montarCatalogoKalshi\)/);
  });

  it("⚠️ guardar nunca pode derrubar nem atrasar a rota", () => {
    // É aceleração, não dependência: com o banco fora, o site monta como antes.
    expect(poly).toMatch(/void salvarCatalogo\("polymarket"/);
    expect(kalshi).toMatch(/void salvarCatalogo\("kalshi"/);
  });

  it("🔴 a tela mostra a procedência, não 'atualizado agora'", () => {
    const pagina = ler("../../client/src/pages/Apostas.tsx");
    expect(pagina).toMatch(/preços de .*buscando os de agora/);
    const cache = ler("../../client/src/lib/marketsCache.ts");
    // A pior das fontes manda: uma ao vivo não pode esconder a outra velha.
    expect(cache).toMatch(/export function procedenciaDoCatalogo/);
  });
});
