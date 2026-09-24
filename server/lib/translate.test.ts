import { describe, it, expect } from "vitest";
import {
  ehTraducaoConfiavel, ehTraducaoUtil, numerosPreservados,
  normalizarPtBr, montarPromptDeTraducao, interpretarRespostaDaIA, hashDoTexto,
} from "./translate.ts";

// Os títulos abaixo são os que a auditoria de 21/09 fotografou na tela, com a
// tradução errada que o endpoint gtx devolveu. Cada teste prende uma regra.

describe("o sentido não pode inverter", () => {
  const ORIGINAL = "CNN, Politico, or MS NOW unbanned from White House press pool by September 30?";

  it("a regra da negação está no prompt", () => {
    const p = montarPromptDeTraducao([ORIGINAL]);
    expect(p).toContain("unbanned");
    expect(p).toMatch(/não inverta o sentido/i);
    expect(p).toMatch(/un-, de-, non-/);
  });

  it("aceita a tradução que preserva o sentido", () => {
    const boa = "CNN, Politico ou MS NOW readmitidos ao grupo de imprensa da Casa Branca até 30 de setembro?";
    expect(ehTraducaoUtil(ORIGINAL, boa)).toBe(true);
  });
});

describe("'by <data>' é 'até <data>', nunca 'por'", () => {
  it("a regra está no prompt, com a razão", () => {
    const p = montarPromptDeTraducao(["Will X happen by September 30?"]);
    expect(p).toMatch(/"by <data>" é "até <data>"/);
  });

  it("a data sobrevive à tradução — é ela que separa um degrau do outro", () => {
    const original = "US announces end of Iranian blockade by September 30, 2026?";
    expect(ehTraducaoUtil(original, "EUA anunciam fim do bloqueio iraniano até 30 de setembro de 2026?")).toBe(true);
    // Tradução que come a data descreve OUTRO mercado da mesma escada.
    expect(ehTraducaoUtil(original, "EUA anunciam fim do bloqueio iraniano?")).toBe(false);
  });
});

describe("número e patamar são a identidade do mercado", () => {
  it("'(HIGH) $3.0T' sem o 3.0 vira o mercado irmão", () => {
    const original = "Will Anthropic's valuation hit (HIGH) $3.0T by December 31?";
    expect(ehTraducaoUtil(original, "A avaliação da Anthropic chega a (HIGH) US$ 3,0T até 31 de dezembro?")).toBe(true);
    expect(ehTraducaoUtil(original, "A avaliação da Anthropic chega ao teto até 31 de dezembro?")).toBe(false);
  });

  it("trocar ponto por vírgula é o certo em pt-BR, e não reprova", () => {
    expect(numerosPreservados("Map 2 Total Rounds: Over/Under 21.5", "Mapa 2 — Total de Rounds: Mais/Menos 21,5")).toBe(true);
  });

  it("🔴 'tradução' que só trocou a vírgula NÃO vai para a tela", () => {
    // MEDIDO na primeira rodada com a IA de verdade (22/09): o modelo devolveu
    // "Map 2 Total Rounds: Over/Under 21,5" para o título em inglês — só o
    // separador decimal mudou. As strings são diferentes, então isso passaria e
    // o card mostraria o mesmo título duas vezes: o MKT-01 de volta, disfarçado.
    const original = "Map 2 Total Rounds: Over/Under 21.5";
    expect(ehTraducaoUtil(original, "Map 2 Total Rounds: Over/Under 21,5")).toBe(false);
    // Mas ela é uma resposta CONFIÁVEL: fica guardada para não perguntar de novo.
    expect(ehTraducaoConfiavel(original, "Map 2 Total Rounds: Over/Under 21,5")).toBe(true);
    // E a tradução de verdade continua passando.
    expect(ehTraducaoUtil(original, "Mapa 2 — Total de Rounds: Mais/Menos 21,5")).toBe(true);
  });

  it("cifrão sozinho em português vira US$ — senão lê-se como real", () => {
    // Achado pelo detector da varredura (TXT-01): a tradução saía "atingirá
    // (MÁXIMA) $110", e num texto em português "$110" é cento e dez REAIS.
    const p = montarPromptDeTraducao(["Will WTI Crude Oil hit (HIGH) $110 in September?"]);
    expect(p).toMatch(/o cifrão do original é DÓLAR/);
    expect(p).toContain('escreva "US$ 110"');
    // E o número tem que sobreviver à troca do símbolo:
    expect(numerosPreservados("hit (HIGH) $110", "atingir (MÁXIMA) US$ 110")).toBe(true);
  });

  it("o termo comum de aposta é traduzido; o nome do time, não", () => {
    const p = montarPromptDeTraducao(["Map 2 Total Rounds: Over/Under 21.5"]);
    expect(p).toMatch(/"Over\/Under" = "Mais\/Menos"/);
    expect(p).toMatch(/TERMO COMUM de esporte e aposta NÃO é nome próprio/);
  });

  it("não confunde 30 com 2026 nem perde número colado em símbolo", () => {
    expect(numerosPreservados("September 30, 2026", "30 de setembro de 2026")).toBe(true);
    expect(numerosPreservados("September 30, 2026", "setembro de 2026")).toBe(false);
    expect(numerosPreservados("25 bps", "25 pontos-base")).toBe(true);
  });
});

describe("português do Brasil, por palavra inteira", () => {
  it("Irão (o país) vira Irã", () => {
    expect(normalizarPtBr("Fim do bloqueio do Irão")).toBe("Fim do bloqueio do Irã");
    expect(normalizarPtBr("A seleção joga em Teerão")).toBe("A seleção joga em Teerã");
  });

  it("⚠️ não troca palavra que mudaria a concordância", () => {
    // A primeira versão desta lista trocava "equipa" por "time" e escrevia
    // "A time joga em casa": o artigo concorda com a palavra que saiu. Corretor
    // que escreve errado é pior que o erro. Isso fica para o prompt.
    expect(normalizarPtBr("A equipa joga em casa")).toBe("A equipa joga em casa");
  });

  it("⚠️ 'irão' minúsculo é o VERBO e não pode ser trocado", () => {
    // Casar por substring é o erro que já mordeu este projeto quatro vezes.
    // Trocar sem olhar a maiúscula escreveria "os juros Irã subir".
    expect(normalizarPtBr("Os juros irão subir até dezembro?")).toBe("Os juros irão subir até dezembro?");
  });
});

describe("resposta da IA — nada entra na tela sem conferência", () => {
  const TEXTOS = ["Giants vs. Rams", "Will the Fed cut rates by December?"];

  it("casa cada tradução pelo número da linha", () => {
    const bruto = '{"1": "Giants vs. Rams", "2": "O Fed vai cortar juros até dezembro?"}';
    const r = interpretarRespostaDaIA(bruto, TEXTOS);
    // Nome próprio: a tradução correta é IGUAL ao original. Ela é guardada
    // (para não perguntar de novo amanhã) mas não vai para a tela.
    expect(ehTraducaoConfiavel("Giants vs. Rams", r["Giants vs. Rams"])).toBe(true);
    expect(ehTraducaoUtil("Giants vs. Rams", r["Giants vs. Rams"])).toBe(false);
    expect(r["Will the Fed cut rates by December?"]).toBe("O Fed vai cortar juros até dezembro?");
  });

  it("aguenta cerca de markdown e conversa em volta do JSON", () => {
    const bruto = 'Claro! Aqui está:\n```json\n{"1": "Giants vs. Rams", "2": "O Fed corta juros até dezembro?"}\n```';
    expect(interpretarRespostaDaIA(bruto, TEXTOS)["Will the Fed cut rates by December?"])
      .toBe("O Fed corta juros até dezembro?");
  });

  it("resposta sem JSON não derruba nada — devolve vazio", () => {
    expect(interpretarRespostaDaIA("desculpe, não posso ajudar", TEXTOS)).toEqual({});
    expect(interpretarRespostaDaIA("", TEXTOS)).toEqual({});
  });

  it("chave a mais, chave de menos e tipo errado são ignorados", () => {
    const bruto = '{"1": 42, "2": "O Fed corta juros até dezembro?", "7": "sobra"}';
    const r = interpretarRespostaDaIA(bruto, TEXTOS);
    expect(Object.keys(r)).toEqual(["Will the Fed cut rates by December?"]);
  });

  it("a IA que EXPLICA em vez de traduzir é recusada", () => {
    // Visto no bake-off: o modelo responde com um parágrafo sobre o mercado.
    const explicacao = "Este mercado pergunta se o Federal Reserve, banco central "
      + "dos Estados Unidos, vai reduzir a taxa básica de juros antes do fim de dezembro de 2026.";
    expect(ehTraducaoUtil("Will the Fed cut rates by December?", explicacao)).toBe(false);
  });

  it("o pt-PT que escapa do prompt é corrigido na entrada", () => {
    const bruto = '{"1": "Giants vs. Rams", "2": "O Fed vai cortar juros até Dezembro?"}';
    expect(interpretarRespostaDaIA(bruto, TEXTOS)["Will the Fed cut rates by December?"]).toContain("Dezembro");
    const comIrao = interpretarRespostaDaIA('{"1": "Bloqueio do Irão acaba?"}', ["Iranian blockade ends?"]);
    expect(comIrao["Iranian blockade ends?"]).toBe("Bloqueio do Irã acaba?");
  });
});

describe("mensagem de erro do tradutor nunca vira título", () => {
  it("recusa o aviso de cota do MyMemory e URL solta", () => {
    const o = "Will the Fed cut rates?";
    expect(ehTraducaoUtil(o, "MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS")).toBe(false);
    expect(ehTraducaoUtil(o, "https://mymemory.translated.net/doc/usagelimits.php")).toBe(false);
    expect(ehTraducaoUtil(o, "   ")).toBe(false);
    expect(ehTraducaoUtil(o, null)).toBe(false);
  });
});

describe("hashDoTexto — a chave de 'traduzir uma vez na vida'", () => {
  it("é estável e ignora espaço nas pontas", () => {
    expect(hashDoTexto("Giants vs. Rams")).toBe(hashDoTexto("  Giants vs. Rams  "));
    expect(hashDoTexto("Giants vs. Rams")).toHaveLength(64);
    expect(hashDoTexto("Giants vs. Rams")).not.toBe(hashDoTexto("Giants vs. Jets"));
  });
});

describe("o prompt leva a lista inteira, numerada", () => {
  it("numera na ordem e pede JSON puro", () => {
    const p = montarPromptDeTraducao(["Giants vs. Rams", "25 bps"]);
    expect(p).toContain("1. Giants vs. Rams");
    expect(p).toContain("2. 25 bps");
    expect(p).toMatch(/APENAS com um objeto JSON/);
    expect(p).toMatch(/nome próprio/i);
  });
});
