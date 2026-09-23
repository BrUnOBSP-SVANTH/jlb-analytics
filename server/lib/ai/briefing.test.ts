import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
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

/**
 * SEG-02 — regenerar o briefing é caro, e a rota é pública.
 *
 * Cada geração gasta IA, NewsAPI (100 chamadas/dia no grátis), Polymarket,
 * Kalshi e BCB. O botão "Atualizar" da tela mandava `?force=1` numa rota sem
 * login nem cota: bastava segurar o botão para queimar a cota do site.
 */
describe("SEG-02 — o briefing não é regerado por quem passa na rua", () => {
  const fonte = readFileSync(new URL("./briefing.ts", import.meta.url), "utf-8");

  it("`force` exige a chave de serviço", () => {
    expect(fonte).toMatch(/force[\s\S]{0,80}autorizadoComChaveDeServico/);
  });

  it("o dia é o de BRASÍLIA, não o de Londres", () => {
    // Com a data UTC, o "briefing de hoje" virava às 21h — no meio da noite de
    // quem lê — e a geração era paga de novo.
    expect(fonte).toContain("hojeEmBrasilia()");
    expect(fonte).not.toMatch(/const today = new Date\(\)\.toISOString\(\)/);
  });

  it("o briefing é guardado no banco antes de ir para a tela", () => {
    // Só na memória, cada deploy jogava fora o do dia.
    expect(fonte).toMatch(/await gravarBriefingDoDia\(today, result\)/);
    expect(fonte).toMatch(/await lerBriefingDoDia\(today\)/);
  });

  it("a tela não pede mais a regeração", () => {
    const tela = readFileSync(new URL("../../../client/src/pages/Briefing.tsx", import.meta.url), "utf-8");
    // Olha a CHAMADA, não a prosa: o comentário que explica a mudança cita o
    // `?force=1` de propósito, e um teste que reprovasse isso obrigaria a
    // apagar justamente a explicação de por que o código é assim.
    expect(tela).not.toContain("daily-briefing?force=1");
  });
});
