import { describe, it, expect, beforeEach } from "vitest";
import { guardarResposta, respostaGuardada, consumirResposta, _limpar, _tamanho } from "./respostasDoChat.ts";

/**
 * SEG-06 — `/api/ai/chat/feedback` recebia `question` e `answer` do CLIENTE e
 * gravava os dois no banco, sem login. Qualquer pessoa na internet tinha um
 * campo de escrita de 6 KB por requisição no nosso Postgres — e o que
 * escrevesse ficaria guardado como se fosse uma conversa real com o Analista.
 *
 * O pior não é o espaço: é que a tabela existe para mostrar ONDE A IA ERRA, e
 * envenená-la com texto que a IA nunca disse é pior do que enchê-la.
 */
beforeEach(() => { _limpar(); });

const AGORA = new Date("2026-09-24T12:00:00Z").getTime();

describe("quem diz o que foi dito é quem disse", () => {
  it("o id devolve a pergunta e a resposta que o SERVIDOR guardou", () => {
    const id = guardarResposta("Como funciona o Brier?", "Brier mede calibração…", AGORA);
    expect(respostaGuardada(id, AGORA)).toEqual({
      pergunta: "Como funciona o Brier?",
      resposta: "Brier mede calibração…",
    });
  });

  it("🔴 id inventado não devolve nada — e é isso que fecha a rota", () => {
    guardarResposta("p", "r", AGORA);
    expect(respostaGuardada("id-que-eu-inventei", AGORA)).toBeNull();
    expect(respostaGuardada("", AGORA)).toBeNull();
    expect(respostaGuardada(undefined, AGORA)).toBeNull();
    expect(respostaGuardada(42, AGORA)).toBeNull();
  });

  it("⚠️ o mesmo id não entra duas vezes", () => {
    // Sem isto, um laço com um id VÁLIDO repetiria a mesma linha até encher a
    // tabela — um abuso mais difícil de ver, porque o conteúdo é legítimo.
    const id = guardarResposta("p", "r", AGORA);
    expect(consumirResposta(id, AGORA)).not.toBeNull();
    expect(consumirResposta(id, AGORA)).toBeNull();
  });
});

describe("a memória não cresce para sempre", () => {
  it("resposta vence em 15 minutos", () => {
    const id = guardarResposta("p", "r", AGORA);
    expect(respostaGuardada(id, AGORA + 14 * 60_000)).not.toBeNull();
    expect(respostaGuardada(id, AGORA + 16 * 60_000)).toBeNull();
  });

  it("guardar de novo limpa o que já venceu", () => {
    guardarResposta("velha", "r", AGORA);
    expect(_tamanho()).toBe(1);
    guardarResposta("nova", "r", AGORA + 20 * 60_000);
    expect(_tamanho()).toBe(1);   // a velha saiu junto
  });

  it("acima do teto, a mais antiga sai", () => {
    for (let i = 0; i < 520; i++) guardarResposta(`p${i}`, "r", AGORA);
    expect(_tamanho()).toBeLessThanOrEqual(500);
  });

  it("o texto é cortado — o banco não recebe romance", () => {
    const id = guardarResposta("p".repeat(5_000), "r".repeat(9_000), AGORA);
    const r = respostaGuardada(id, AGORA)!;
    expect(r.pergunta.length).toBe(2_000);
    expect(r.resposta.length).toBe(4_000);
  });
});
