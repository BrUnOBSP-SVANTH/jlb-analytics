import { describe, it, expect } from "vitest";
import {
  cotas, retornoSeAcertar, lucroSeAcertar, perdaSeErrar, oddsDecimais,
  acertou, pagamento, valorDeMercado, resumirBanca, validarAposta,
  precoDoLado, SALDO_INICIAL, type Aposta,
} from "./banca.ts";

describe("o retorno da aposta — a conta que o usuário vê antes de apostar", () => {
  const cemA40: Aposta = { lado: "sim", precoEntrada: 0.4, valor: 100 };

  it("R$ 100 a 40% compra 250 cotas e devolve R$ 250 no acerto", () => {
    expect(cotas(cemA40)).toBeCloseTo(250, 6);
    expect(retornoSeAcertar(cemA40)).toBeCloseTo(250, 6);
    expect(lucroSeAcertar(cemA40)).toBeCloseTo(150, 6);
  });

  it("no erro perde-se tudo que foi apostado, nem mais nem menos", () => {
    expect(perdaSeErrar(cemA40)).toBe(100);
  });

  it("o lado NÃO compra a cota contrária, que custa 1 − p", () => {
    // O SIM está a 40%, logo o NÃO custa 60% e paga menos: é o lado popular.
    const naoA40: Aposta = { lado: "nao", precoEntrada: 0.4, valor: 100 };
    expect(precoDoLado("nao", 0.4)).toBeCloseTo(0.6, 10);
    expect(retornoSeAcertar(naoA40)).toBeCloseTo(166.67, 2);
  });

  it("o palpite impopular paga mais — é a lição central do preço", () => {
    const impopular: Aposta = { lado: "sim", precoEntrada: 0.1, valor: 100 };
    const favorito: Aposta = { lado: "sim", precoEntrada: 0.9, valor: 100 };
    expect(lucroSeAcertar(impopular)).toBeGreaterThan(lucroSeAcertar(favorito));
    expect(oddsDecimais(impopular)).toBeCloseTo(10, 6);
    expect(oddsDecimais(favorito)).toBeCloseTo(1.111, 3);
  });

  it("os dois lados do mesmo mercado somam exatamente R$ 1 por cota", () => {
    // Se não somassem, existiria lucro garantido apostando nos dois — e a
    // simulação estaria ensinando algo que não existe.
    for (const p of [0.05, 0.33, 0.5, 0.77, 0.99]) {
      expect(precoDoLado("sim", p) + precoDoLado("nao", p)).toBeCloseTo(1, 10);
    }
  });
});

describe("o desfecho — só o resultado oficial mexe na banca", () => {
  it("acerta quem apostou no lado que aconteceu", () => {
    expect(acertou({ lado: "sim", precoEntrada: 0.4, valor: 10, desfecho: true })).toBe(true);
    expect(acertou({ lado: "nao", precoEntrada: 0.4, valor: 10, desfecho: false })).toBe(true);
    expect(acertou({ lado: "sim", precoEntrada: 0.4, valor: 10, desfecho: false })).toBe(false);
  });

  it("sem desfecho oficial não há veredito nem pagamento", () => {
    // O mercado pode ter fechado e ainda estar em disputa. Chutar aqui creditaria
    // dinheiro que a plataforma ainda não pagou.
    const semResultado: Aposta = { lado: "sim", precoEntrada: 0.4, valor: 10 };
    expect(acertou(semResultado)).toBeNull();
    expect(pagamento(semResultado)).toBeNull();
    expect(pagamento({ ...semResultado, desfecho: null })).toBeNull();
  });

  it("o erro paga zero — a cota que não acontece não vale nada", () => {
    expect(pagamento({ lado: "sim", precoEntrada: 0.4, valor: 100, desfecho: false })).toBe(0);
  });
});

describe("valor de mercado — quanto vale a aposta que ainda não resolveu", () => {
  it("segue o preço de hoje, não o da entrada", () => {
    const subiu: Aposta = { lado: "sim", precoEntrada: 0.4, valor: 100, precoAtual: 0.6 };
    expect(valorDeMercado(subiu)).toBeCloseTo(150, 6); // 250 cotas × 0,60
  });

  it("sem preço atual, não inventa lucro", () => {
    const semPreco: Aposta = { lado: "sim", precoEntrada: 0.4, valor: 100 };
    expect(valorDeMercado(semPreco)).toBe(100);
  });
});

describe("a banca inteira", () => {
  it("banca nova mostra o saldo inicial e nada mais", () => {
    const r = resumirBanca([]);
    expect(r.disponivel).toBe(SALDO_INICIAL);
    expect(r.patrimonio).toBe(SALDO_INICIAL);
    expect(r.taxaAcerto).toBeNull();
    expect(r.retornoPct).toBe(0);
  });

  it("a aposta aberta TIRA o dinheiro do disponível na hora", () => {
    // É a diferença entre banca e lista de desejos: apostar custa antes de pagar.
    const r = resumirBanca([{ lado: "sim", precoEntrada: 0.4, valor: 100, precoAtual: 0.4 }]);
    expect(r.disponivel).toBe(SALDO_INICIAL - 100);
    expect(r.emJogo).toBe(100);
    expect(r.patrimonio).toBeCloseTo(SALDO_INICIAL, 6); // nada ganho, nada perdido
  });

  it("o acerto devolve o retorno cheio para o disponível", () => {
    const r = resumirBanca([
      { lado: "sim", precoEntrada: 0.4, valor: 100, resolvido: true, desfecho: true },
    ]);
    expect(r.lucroRealizado).toBeCloseTo(150, 6);
    expect(r.disponivel).toBeCloseTo(SALDO_INICIAL + 150, 6);
    expect(r.taxaAcerto).toBe(1);
  });

  it("o erro consome o valor apostado", () => {
    const r = resumirBanca([
      { lado: "sim", precoEntrada: 0.4, valor: 100, resolvido: true, desfecho: false },
    ]);
    expect(r.lucroRealizado).toBeCloseTo(-100, 6);
    expect(r.patrimonio).toBeCloseTo(SALDO_INICIAL - 100, 6);
    expect(r.taxaAcerto).toBe(0);
  });

  it("acertar pouco pode render mais que acertar muito — e a banca mostra isso", () => {
    // Duas bancas com a MESMA taxa de acerto (50%) e resultados opostos: a que
    // acertou o impopular lucra, a que acertou o favorito perde. É exatamente o
    // que a simulação existe para ensinar.
    const impopular = resumirBanca([
      { lado: "sim", precoEntrada: 0.2, valor: 100, resolvido: true, desfecho: true },
      { lado: "sim", precoEntrada: 0.2, valor: 100, resolvido: true, desfecho: false },
    ]);
    const favorito = resumirBanca([
      { lado: "sim", precoEntrada: 0.8, valor: 100, resolvido: true, desfecho: true },
      { lado: "sim", precoEntrada: 0.8, valor: 100, resolvido: true, desfecho: false },
    ]);
    expect(impopular.taxaAcerto).toBe(favorito.taxaAcerto);
    expect(impopular.lucroRealizado).toBeGreaterThan(0);
    expect(favorito.lucroRealizado).toBeLessThan(0);
  });

  it("o dinheiro nunca some nem aparece do nada", () => {
    // Invariante de caixa: patrimônio = inicial + lucro fechado + variação das abertas.
    const apostas: Aposta[] = [
      { lado: "sim", precoEntrada: 0.4, valor: 100, resolvido: true, desfecho: true },
      { lado: "nao", precoEntrada: 0.3, valor: 50, resolvido: true, desfecho: false },
      { lado: "sim", precoEntrada: 0.5, valor: 200, precoAtual: 0.5 },
    ];
    const r = resumirBanca(apostas);
    expect(r.disponivel + r.valorAberto).toBeCloseTo(r.patrimonio, 6);
    expect(r.patrimonio).toBeCloseTo(SALDO_INICIAL + r.lucroRealizado + (r.valorAberto - r.emJogo), 6);
  });
});

describe("validação — a recusa tem que ensinar, não só barrar", () => {
  it("barra aposta acima do disponível e explica onde está o dinheiro", () => {
    const v = validarAposta(500, 0.5, "sim", 200);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.motivo).toMatch(/apostas abertas/i);
  });

  it("barra o centavo e o extremo de preço", () => {
    expect(validarAposta(0.5, 0.5, "sim", 1000).ok).toBe(false);
    expect(validarAposta(10, 0.995, "sim", 1000).ok).toBe(false);
    expect(validarAposta(10, 0.005, "sim", 1000).ok).toBe(false);
  });

  it("o extremo é medido no LADO apostado, não no SIM", () => {
    // Mercado a 1% de SIM: apostar NÃO é comprar a 99% — igualmente extremo.
    expect(validarAposta(10, 0.01, "nao", 1000).ok).toBe(false);
  });

  it("aceita a aposta comum", () => {
    expect(validarAposta(100, 0.42, "sim", 1000).ok).toBe(true);
    expect(validarAposta(100, 0.42, "nao", 1000).ok).toBe(true);
  });

  it("gastar exatamente o disponível é permitido", () => {
    expect(validarAposta(200, 0.5, "sim", 200).ok).toBe(true);
  });
});
