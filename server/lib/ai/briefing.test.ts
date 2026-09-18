import { describe, it, expect } from "vitest";
import { motivoDoBriefing } from "./briefing.ts";

describe("motivoDoBriefing — o que a tela diz quando a IA não responde", () => {
  it("não repassa o texto do provedor: ele vaza ID de organização e URL de cobrança", () => {
    // Exatamente o que a resposta pública devolvia em 17/09.
    const real = new Error(
      'Groq HTTP 429: {"error":{"message":"Rate limit reached for model `openai/gpt-oss-120b` in organization `org_01m17cxfkeebntfqcg6g5epmt1` service tier `on_demand`"}}',
    );
    const { message } = motivoDoBriefing(real);
    expect(message).not.toMatch(/org_/);
    expect(message).not.toMatch(/gpt-oss/);
    expect(message).not.toMatch(/429/);
  });

  it("cota esgotada é dito como cota esgotada, com a saída", () => {
    const { error, message } = motivoDoBriefing(new Error("Gemini HTTP 429: You exceeded your current quota"));
    expect(error).toBe("briefing_sem_cota");
    expect(message).toMatch(/cota diária de IA acabou/);
    expect(message).toMatch(/volta assim que a cota renova/);
  });

  it("qualquer outra falha vira um convite a tentar de novo, não um código", () => {
    const { error, message } = motivoDoBriefing(new Error("socket hang up"));
    expect(error).toBe("briefing_indisponivel");
    expect(message).not.toMatch(/socket/);
    expect(message).toMatch(/Tente de novo/);
  });

  it("aguenta erro que não é Error", () => {
    expect(motivoDoBriefing(undefined).error).toBe("briefing_indisponivel");
  });
});
