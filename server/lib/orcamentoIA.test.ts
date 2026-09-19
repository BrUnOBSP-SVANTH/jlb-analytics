import { describe, it, expect } from "vitest";
import { tarefasAgendadasLigadas, temAlgumaIA, inicioDoDiaUTC, restanteDoDia } from "./orcamentoIA.ts";

describe("tarefasAgendadasLigadas — quem pode gastar a cota do site", () => {
  it("produção roda (no Render, mesmo sem NODE_ENV)", () => {
    expect(tarefasAgendadasLigadas({ RENDER_EXTERNAL_URL: "https://jlb-analytics.onrender.com" })).toBe(true);
    expect(tarefasAgendadasLigadas({ NODE_ENV: "production" })).toBe(true);
  });

  it("servidor local NÃO roda — era ele que gastava a cota de produção nos testes", () => {
    // O .env local traz NODE_ENV=development e as MESMAS chaves de produção.
    expect(tarefasAgendadasLigadas({ NODE_ENV: "development", SUPABASE_SERVICE_KEY: "x", GEMINI_API_KEY: "y" })).toBe(false);
    expect(tarefasAgendadasLigadas({})).toBe(false);
  });

  it("dá para ligar de propósito, quando alguém quer testar a tarefa", () => {
    expect(tarefasAgendadasLigadas({ NODE_ENV: "development", JLB_TAREFAS: "1" })).toBe(true);
  });
});

describe("temAlgumaIA — a cadeia tem três provedores, uma chave basta", () => {
  it("só Gemini já serve — exigir a da Anthropic parava a semeadura", () => {
    expect(temAlgumaIA({ GEMINI_API_KEY: "k" })).toBe(true);
    expect(temAlgumaIA({ GROQ_API_KEY: "k" })).toBe(true);
    expect(temAlgumaIA({})).toBe(false);
  });
});

describe("o dia da cota", () => {
  it("vira à meia-noite UTC, não no fuso de quem roda", () => {
    // 19/09 às 02h de Brasília ainda é 19/09 05h UTC.
    expect(inicioDoDiaUTC(Date.parse("2026-09-19T05:00:00Z"))).toBe("2026-09-19T00:00:00.000Z");
    expect(inicioDoDiaUTC(Date.parse("2026-09-18T23:59:59Z"))).toBe("2026-09-18T00:00:00.000Z");
  });

  it("restante nunca fica negativo", () => {
    expect(restanteDoDia(80, 30)).toBe(50);
    expect(restanteDoDia(80, 127)).toBe(0); // o dia de 15/09
  });

  it("sem conseguir contar, não gasta — gastar às cegas foi o que esgotou a cota", () => {
    expect(restanteDoDia(80, null)).toBe(0);
    expect(restanteDoDia(80, NaN)).toBe(0);
  });
});
