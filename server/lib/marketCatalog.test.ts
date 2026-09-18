import { describe, it, expect, vi } from "vitest";
import { comOrcamento, porVolume, desambiguarPorPai, limitePedido, normalizarTitulo, expandirNomeTruncado, confrontoEmTexto, glossarioDeNomes, completarComGlossario } from "./marketCatalog.ts";

describe("comOrcamento — página que demora não pode derrubar a tela", () => {
  it("devolve o resultado quando chega a tempo", async () => {
    await expect(comOrcamento(Promise.resolve("ok"), 50)).resolves.toBe("ok");
  });

  it("devolve null quando estoura o prazo, em vez de esperar", async () => {
    const lenta = new Promise<string>((r) => setTimeout(() => r("tarde"), 200));
    await expect(comOrcamento(lenta, 20)).resolves.toBeNull();
  });
});

describe("porVolume — a régua que tirou o catálogo morto do ar", () => {
  const m = (volume24h: number, volume: number) => ({ volume24h, volume });

  it("mais negociado nas últimas 24h vem primeiro", () => {
    expect([m(10, 999), m(500, 1)].sort(porVolume)[0].volume24h).toBe(500);
  });

  it("empate em 24h (dia parado) desempata pelo histórico", () => {
    expect([m(0, 100), m(0, 900)].sort(porVolume)[0].volume).toBe(900);
  });

  it("trata volume ausente como zero, sem quebrar a ordenação", () => {
    const r = ([{}, m(5, 5)] as Array<{ volume24h?: number; volume?: number }>).sort(porVolume);
    expect(r[0].volume24h).toBe(5);
  });
});

describe("desambiguarPorPai — dois cards iguais parecem defeito", () => {
  type Card = { titulo: string; pai: string; suf?: string };
  const marcar = (xs: Card[]) => desambiguarPorPai(
    xs,
    { titulo: (x) => x.titulo, pai: (x) => x.pai, sufixo: (x) => x.suf },
    (x, t) => ({ ...x, titulo: t }),
  );

  it("marca o título repetido entre PAIS diferentes", () => {
    // Caso real: "Game 1: Both Teams Slay Baron Nashor?" em duas partidas de LoL.
    const r = marcar([
      { titulo: "Game 1", pai: "partida-A", suf: "Galions vs TLN" },
      { titulo: "Game 1", pai: "partida-B", suf: "KOI vs UCAM" },
    ]);
    expect(r[0].titulo).toBe("Game 1 — Galions vs TLN");
    expect(r[1].titulo).toBe("Game 1 — KOI vs UCAM");
  });

  it("NÃO mexe em título que já é único — o card específico não pode virar poluído", () => {
    const r = marcar([{ titulo: "Fed corta juros?", pai: "e1", suf: "x" }]);
    expect(r[0].titulo).toBe("Fed corta juros?");
  });

  it("não marca quando as repetições são do MESMO pai", () => {
    // Aqui a repetição é interna ao evento (escada de faixas): quem resolve é o
    // rótulo da faixa, não o nome do evento — marcar com o pai não distinguiria nada.
    const r = marcar([
      { titulo: "Quantos lançamentos?", pai: "spacex-set", suf: "s" },
      { titulo: "Quantos lançamentos?", pai: "spacex-set", suf: "s" },
    ]);
    expect(r.every((x) => x.titulo === "Quantos lançamentos?")).toBe(true);
  });

  it("sem sufixo disponível, deixa como está em vez de inventar", () => {
    const r = marcar([
      { titulo: "T", pai: "a" },
      { titulo: "T", pai: "b" },
    ]);
    expect(r.map((x) => x.titulo)).toEqual(["T", "T"]);
  });
});

describe("limitePedido", () => {
  it("usa o padrão quando não vem nada e respeita o teto", () => {
    expect(limitePedido(undefined, 150, 300)).toBe(150);
    expect(limitePedido("9999", 150, 300)).toBe(300);
  });

  it("aceita valor válido e ignora lixo", () => {
    expect(limitePedido("42", 150, 300)).toBe(42);
    expect(limitePedido("abc", 150, 300)).toBe(150);
    expect(limitePedido("-5", 150, 300)).toBe(150);   // negativo não zera o catálogo
    expect(limitePedido("0", 150, 300)).toBe(150);
  });
});

describe("normalizarTitulo — o buraco que aparecia no card", () => {
  it("preenche a lacuna com o valor que vinha no sufixo", () => {
    // Exatamente o que a auditoria fotografou (MKT-11).
    expect(normalizarTitulo("Bitcoin above ___ on September 9?: 80,000"))
      .toBe("Bitcoin above 80,000 on September 9?");
    expect(normalizarTitulo("$LAPTOP FDV above ___ one day after launch?: $1B"))
      .toBe("$LAPTOP FDV above $1B one day after launch?");
  });

  it("sem valor no sufixo, some com a lacuna em vez de mostrar o buraco", () => {
    expect(normalizarTitulo("Bitcoin above ___ on September 9?"))
      .toBe("Bitcoin above on September 9?");
  });

  it("não confunde dois-pontos comum com preenchimento de lacuna", () => {
    // Sem `___` no corpo, o sufixo não é valor de lacuna: é desambiguação, e
    // apagá-lo criaria dois cards com o mesmo título (o defeito oposto).
    expect(normalizarTitulo("Fed Decision in September?: 25 bps"))
      .toBe("Fed Decision in September?: 25 bps");
    expect(normalizarTitulo("Quem ganha: Flamengo ou Palmeiras?"))
      .toBe("Quem ganha: Flamengo ou Palmeiras?");
  });

  it("aguenta título vazio e junta espaço sobrando", () => {
    expect(normalizarTitulo("")).toBe("");
    // Espaço duplicado vem de título que já teve algo removido na origem.
    expect(normalizarTitulo("  Mercado   normal  ")).toBe("Mercado normal");
  });
});

describe("expandirNomeTruncado — o nome cortado pela origem", () => {
  const EVENTO = "NY Giants vs LA Rams";

  it("o caso real de 17/09: 'New York G wins' vira o time inteiro", () => {
    expect(expandirNomeTruncado("New York G wins", EVENTO)).toBe("NY Giants wins");
  });

  it("vale também no meio da frase, sem estragar o resto", () => {
    expect(expandirNomeTruncado("Los Angeles R wins by over 9.5 points?", EVENTO))
      .toBe("LA Rams wins by over 9.5 points?");
  });

  it("título sem corte fica exatamente como veio", () => {
    expect(expandirNomeTruncado("Will Bitcoin close above $80,000?", EVENTO))
      .toBe("Will Bitcoin close above $80,000?");
  });

  it("sem evento, não há de onde tirar — não inventa", () => {
    expect(expandirNomeTruncado("New York G wins")).toBe("New York G wins");
    expect(expandirNomeTruncado("New York G wins", "Algum evento sem confronto")).toBe("New York G wins");
  });

  it("assinatura ambígua entre os dois lados: mantém o que a origem publicou", () => {
    // LA Rams e LA Raiders dariam a mesma assinatura — no empate não se escolhe.
    expect(expandirNomeTruncado("Los Angeles R wins", "LA Rams vs LA Raiders"))
      .toBe("Los Angeles R wins");
  });

  it("não mexe em nome próprio que só PARECE cortado", () => {
    // "Donald J" não casa com nenhum lado do confronto — fica como está.
    expect(expandirNomeTruncado("Donald J wins the election", EVENTO)).toBe("Donald J wins the election");
  });
});

describe("confrontoEmTexto — o confronto que está no regulamento", () => {
  it("acha o confronto no meio da regra do Kalshi", () => {
    // Vem com o esporte colado ("Pro Football") porque a regra não separa — e
    // tudo bem: quem usa isto casa por PREFIXO de palavras, então o excedente
    // não atrapalha. Cortar por lista de esportes seria adivinhação.
    expect(confrontoEmTexto(
      "If New York G wins the NY Giants vs LA Rams Pro Football game originally scheduled for Sep 21, 2026, then the market resolves to Yes.",
    )).toBe("NY Giants vs LA Rams Pro Football");
  });

  it("serve de contexto para completar o nome cortado", () => {
    const regra = "If Los Angeles R wins the NY Giants vs LA Rams Pro Football game, then Yes.";
    expect(expandirNomeTruncado("Los Angeles R wins", confrontoEmTexto(regra))).toBe("LA Rams wins");
  });

  it("regra sem confronto não inventa nada", () => {
    expect(confrontoEmTexto("If Bitcoin closes above $80,000 then the market resolves to Yes.")).toBeUndefined();
    expect(confrontoEmTexto(undefined)).toBeUndefined();
  });
});

describe("glossarioDeNomes — aprender o nome com o evento irmão", () => {
  // Os três contextos reais do jogo NYG×LAR em 17/09: só o primeiro traz os
  // nomes inteiros; o do handicap e o regulamento vêm cortados nos dois lados.
  const CONTEXTOS = [
    "NY Giants vs LA Rams",
    "New York G vs Los Angeles R: Spread",
    "New York G vs Los Angeles R Pro Football",
  ];

  it("aprende os dois times e ignora as formas cortadas", () => {
    const g = glossarioDeNomes(CONTEXTOS);
    expect(g.get("NYG")).toBe("NY Giants");
    expect(g.get("LAR")).toBe("LA Rams");
  });

  it("conserta o handicap, que não tinha o nome em registro nenhum", () => {
    const g = glossarioDeNomes(CONTEXTOS);
    expect(completarComGlossario("Los Angeles R wins by over 9.5 points?", g))
      .toBe("LA Rams wins by over 9.5 points?");
  });

  it("assinatura que aponta para TIMES diferentes é descartada — não se escolhe no palpite", () => {
    // "NY Giants" e "NY Jets" dão NYG e NYJ, mas "NY Giants" e "NJ Giants"
    // dariam a mesma assinatura sendo times distintos: aí fica como a origem
    // escreveu. (Duas grafias do mesmo nome é outro caso — ver abaixo.)
    const g = glossarioDeNomes(["NY Giants vs LA Rams", "NJ Generals vs LA Chargers"]);
    expect(g.has("NYG")).toBe(true);
    const ambiguo = glossarioDeNomes(["NY Giants vs LA Rams", "NY Gladiators vs LA Chargers"]);
    expect(ambiguo.has("NYG")).toBe(false);
    expect(completarComGlossario("New York G wins", ambiguo)).toBe("New York G wins");
  });

  it("sem glossário, o título passa intacto", () => {
    expect(completarComGlossario("New York G wins", new Map())).toBe("New York G wins");
  });

  it("não mexe em título sem corte", () => {
    const g = glossarioDeNomes(CONTEXTOS);
    expect(completarComGlossario("Will Bitcoin close above $80,000?", g))
      .toBe("Will Bitcoin close above $80,000?");
  });
});

describe("glossário: duas grafias do mesmo time não são ambiguidade", () => {
  it("'NY Giants' e 'New York Giants' convivem — vale a forma mais completa", () => {
    // Medido em produção em 18/09: o jogo da semana escrevia "NY Giants" e o da
    // semana seguinte "New York Giants". As duas dão NYG, e o descarte por
    // ambiguidade deixava "New York G wins by over 2.5 points?" na tela.
    const g = glossarioDeNomes(["NY Giants vs LA Rams", "New York Giants vs Philadelphia Eagles"]);
    expect(g.get("NYG")).toBe("New York Giants");
    expect(completarComGlossario("New York G wins by over 2.5 points?", g))
      .toBe("New York Giants wins by over 2.5 points?");
  });

  it("times diferentes com a mesma assinatura seguem sendo descartados", () => {
    const g = glossarioDeNomes(["LA Rams vs SF 49ers", "LA Raiders vs KC Chiefs"]);
    expect(g.has("LAR")).toBe(false);
    expect(completarComGlossario("Los Angeles R wins", g)).toBe("Los Angeles R wins");
  });
});

describe("o limite honesto do glossário (medido em 18/09)", () => {
  it("'New York G' pode ser o time OU o governo — e aí não se escolhe", () => {
    // Os dois estão no catálogo do Kalshi ao mesmo tempo: o jogo NYG×LAR e a
    // corrida ao governo de Nova York. As duas grafias dão N-Y-G e terminam em
    // palavras diferentes, então o título fica como a origem publicou. É o
    // desenho funcionando: 149 dos 150 títulos completam, e o que sobra mostra
    // o que o Kalshi escreveu, nunca um palpite nosso.
    const g = glossarioDeNomes(["NY Giants vs LA Rams", "New York Governor vs Challenger"]);
    expect(g.has("NYG")).toBe(false);
    expect(completarComGlossario("New York G wins by over 2.5 points?", g))
      .toBe("New York G wins by over 2.5 points?");
    // O outro lado do mesmo jogo continua sendo completado normalmente.
    expect(g.get("LAR")).toBe("LA Rams");
  });
});
