import { describe, it, expect } from "vitest";
import { RETENCAO_DIAS } from "./cerebroLimpeza.ts";

describe("retenção do Cérebro — a régua não pode encostar no que o site usa", () => {
  // Estes números não são decoração: se alguém apertar a retenção sem olhar, o
  // site perde a notícia que ele mesmo consulta, e o sintoma seria silencioso
  // (contexto vazio, não erro).
  const JANELA_PRECIFICACAO = 14;  // MAX_IDADE_PRECIFICACAO_DIAS em cerebro.ts
  const JANELA_ESTUDO = 45;        // scripts/news-impact.mjs

  it("guarda muito mais tempo do que a precificação consulta", () => {
    expect(RETENCAO_DIAS).toBeGreaterThanOrEqual(JANELA_PRECIFICACAO * 3);
  });

  it("não corta o estudo de impacto de notícia", () => {
    expect(RETENCAO_DIAS).toBeGreaterThan(JANELA_ESTUDO);
  });

  it("mas guarda pouco o bastante para o acervo ter teto", () => {
    // ~660 artigos/dia × 8KB. Acima de ~90 dias o acervo passa de 450MB e o
    // plano gratuito (500MB) volta a apertar.
    const mbEstimado = (660 * RETENCAO_DIAS * 8) / 1024;
    expect(mbEstimado).toBeLessThan(400);
  });
});
