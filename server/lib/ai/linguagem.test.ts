import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { REGRA_LINGUAGEM, REGRA_LINGUAGEM_CURTA } from "./linguagem.ts";

describe("regra de linguagem — o que a IA escreve para o usuário", () => {
  it("exige português do Brasil explicitamente", () => {
    // Sem isso o modelo segue a língua da pergunta, e os títulos vêm em inglês
    // das bolsas americanas. Foi assim que 5 de 6 raciocínios saíram em inglês
    // num site cujo público é brasileiro.
    expect(REGRA_LINGUAGEM).toMatch(/português do Brasil/i);
    expect(REGRA_LINGUAGEM_CURTA).toMatch(/português do Brasil/i);
  });

  it("proíbe símbolo matemático no texto corrido", () => {
    expect(REGRA_LINGUAGEM).toMatch(/símbolo matemático/i);
  });

  it("não proíbe o termo técnico — exige que venha traduzido", () => {
    // O site é quantitativo; banir a palavra exata tiraria a precisão que é o
    // produto. O contrato é traduzir na mesma frase, não evitar.
    expect(REGRA_LINGUAGEM).toMatch(/pode usar o termo técnico/i);
    expect(REGRA_LINGUAGEM).toMatch(/mesma frase/i);
  });
});

describe("cobertura — todo prompt lido por gente carrega a regra", () => {
  // Teste ESTRUTURAL: falha se alguém criar um prompt novo voltado ao usuário e
  // esquecer a regra. A instrução de linguagem simples já existia no projeto, mas
  // só em modelPredict.ts — justamente o arquivo que o usuário menos lê. Este
  // teste existe para essa lacuna não se repetir em silêncio.
  const arquivos = [
    "server/lib/ai/marketAnalysis.ts",
    "server/lib/ai/briefing.ts",
    "server/lib/ai/crossref.ts",
    "server/lib/ai/chat.ts",
  ];

  for (const f of arquivos) {
    it(`${f.split("/").pop()} inclui a regra de linguagem`, () => {
      expect(readFileSync(f, "utf8")).toContain("REGRA_LINGUAGEM");
    });
  }

  // ⚠️ Não basta o texto estar no arquivo: se CHAT_SYSTEM deixar de ser template
  // literal, `${REGRA_LINGUAGEM}` vira texto cru dentro da string e a regra NUNCA
  // chega ao modelo — falha silenciosa perfeita, porque o tsc passa igual.
  it("o system do chat é template literal, senão a regra não interpola", () => {
    const src = readFileSync("server/lib/ai/chat.ts", "utf8");
    expect(src).toMatch(/const CHAT_SYSTEM = `/);
    expect(src).toContain("${REGRA_LINGUAGEM}");
  });

  it("o raciocínio das previsões usa a versão curta", () => {
    expect(readFileSync("server/lib/aiForecasts.ts", "utf8")).toContain("REGRA_LINGUAGEM_CURTA");
  });
});
