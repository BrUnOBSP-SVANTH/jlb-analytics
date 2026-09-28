import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { idadeEmPalavras } from "./analiseGuardada.ts";

const AQUI = dirname(fileURLToPath(import.meta.url));
const analise = readFileSync(join(AQUI, "marketAnalysis.ts"), "utf-8");
const rota = readFileSync(join(AQUI, "..", "..", "routes", "ai.ts"), "utf-8");

/** Comentário que explica o defeito cita o defeito. Oitava vez nesta base. */
const semComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

/**
 * A ANÁLISE É A COISA MAIS CARA QUE O SITE PRODUZ, E MORAVA SÓ NA MEMÓRIA.
 *
 * Reportado em 27/09/2026: a tela de um mercado mostrava a análise de
 * emergência ("a leitura da IA não pôde ser gerada agora"). Medindo os três
 * provedores naquele minuto — Anthropic sem crédito (HTTP 400 "credit
 * balance"), Groq em 429, Gemini free no teto do dia. Os três fora.
 *
 * Só que aquele mercado JÁ tinha sido analisado. A leitura estava num `Map()`
 * e sumiu no deploy anterior.
 *
 * É o mesmo defeito do briefing, consertado na migração 043 com este texto:
 * "ficava só na memória do processo, então cada deploy — e cada vez que o
 * plano grátis do Render deixava o serviço dormir — jogava fora o do dia e a
 * próxima visita pagava tudo de novo". A análise nunca recebeu o conserto, e
 * roda centenas de vezes mais que o briefing.
 */
describe("a análise sobrevive à soneca e ao deploy", () => {
  it("as duas rotas leem o banco antes de gastar cota", () => {
    const fonte = semComentarios(rota);
    // A JSON e a SSE. A SSE é a que a tela usa — cobrir só a outra deixaria o
    // caminho real pagando de novo por tudo.
    expect((fonte.match(/await lerAnalise\(cacheKey\)/g) ?? []).length).toBe(2);
  });

  it("a leitura do banco vem DEPOIS da memória e ANTES de runMarketAnalysis", () => {
    const fonte = semComentarios(rota);
    const memoria = fonte.indexOf("getCache<object>(cacheKey)");
    const banco = fonte.indexOf("await lerAnalise(cacheKey)");
    const gera = fonte.indexOf("await runMarketAnalysis");
    expect(memoria).toBeGreaterThan(-1);
    expect(banco).toBeGreaterThan(memoria);
    expect(gera).toBeGreaterThan(banco);
  });

  it("guarda só análise de verdade — nunca a de emergência", () => {
    // `fairValue !== null` é o que separa as duas: sem IA não há fair value.
    // Guardar o texto "tente de novo em alguns minutos" faria dele a resposta
    // servida para sempre, que é o oposto do conserto.
    const bloco = analise.slice(analise.indexOf("void gravarAnalise"));
    const antes = analise.slice(0, analise.indexOf("void gravarAnalise")).slice(-220);
    expect(antes).toMatch(/fairValue !== null/);
    expect(bloco).toMatch(/chave: ANALYZE_CACHE_KEY/);
  });
});

/**
 * COM TODOS OS PROVEDORES FORA, A TELA MOSTRA A ÚLTIMA LEITURA REAL.
 *
 * Uma análise de ontem, a outro preço, diz muito mais do que "tente de novo em
 * alguns minutos" — com UMA condição, que é o que estes testes prendem: a tela
 * é obrigada a dizer de quando ela é e a que preço foi escrita. O texto inteiro
 * fala do preço; servi-lo como novo seria pior do que não ter análise.
 */
describe("o caminho de todos os provedores fora", () => {
  const bloco = analise.slice(
    analise.indexOf("const anterior = marketId"),
    analise.indexOf("const relevantArticles"),
  );

  it("procura a última análise antes de cair na emergência", () => {
    expect(bloco).toMatch(/lerUltimaAnaliseDoMercado\(marketId\)/);
    const busca = bloco.indexOf("lerUltimaAnaliseDoMercado");
    const emergencia = bloco.indexOf("analiseDeEmergencia(ficha");
    expect(busca).toBeLessThan(emergencia);
  });

  it("🔴 diz DE QUANDO é e A QUE PREÇO foi feita", () => {
    expect(bloco).toMatch(/idadeEmPalavras\(anterior\.criadaEm\)/);
    expect(bloco).toMatch(/anterior\.precoPct/);
    // E o preço de agora ao lado, senão o leitor não sabe o que mudou.
    expect(bloco).toMatch(/agora está em \$\{probPct\}%/);
  });

  it("a emergência continua existindo para mercado nunca analisado", () => {
    // …e recebe os FATOS, que é o que a torna uma leitura em vez de uma
    // reimpressão da ficha (ver profundidade.test.ts).
    expect(bloco).toMatch(/analiseDeEmergencia\(ficha, probPct, platformName, fatos\)/);
  });
});

describe("a idade da cópia, em português", () => {
  const agora = Date.now();
  const atras = (ms: number) => new Date(agora - ms).toISOString();

  it.each([
    [atras(30_000), "há poucos minutos"],
    [atras(25 * 60_000), "há 25 minutos"],
    [atras(60 * 60_000), "há 1 hora"],
    [atras(5 * 60 * 60_000), "há 5 horas"],
    [atras(26 * 60 * 60_000), "ontem"],
    [atras(3 * 24 * 60 * 60_000), "há 3 dias"],
  ])("%s → %s", (iso, esperado) => {
    expect(idadeEmPalavras(iso)).toBe(esperado);
  });

  it("data inválida não vira NaN na tela", () => {
    // A tela mostra este texto direto. "há NaN minutos" seria o mesmo tipo de
    // defeito que o "Invalid Date" do briefing, dois commits atrás.
    expect(idadeEmPalavras("nada disso")).toBe("há pouco");
    expect(idadeEmPalavras(new Date(agora + 60_000).toISOString())).toBe("há pouco");
  });
});
