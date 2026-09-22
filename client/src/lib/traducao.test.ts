import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { traduzir, emLotes, pareceEmPortugues, _limparMemoria } from "./traducao.ts";

// Títulos reais do catálogo — os mesmos que a auditoria de 21/09 listou.
const TITULO = (i: number) => `Will market number ${i} resolve YES by September 30?`;

describe("emLotes — o excedente vira outra requisição, não vira null", () => {
  it("parte em pedaços de 40", () => {
    const cem = Array.from({ length: 100 }, (_, i) => i);
    const lotes = emLotes(cem);
    expect(lotes.map((l) => l.length)).toEqual([40, 40, 20]);
    expect(lotes.flat()).toEqual(cem);           // nada some no caminho
  });

  it("lista curta é um lote só; lista vazia, nenhum", () => {
    expect(emLotes([1, 2, 3]).map((l) => l.length)).toEqual([3]);
    expect(emLotes([])).toEqual([]);
  });
});

describe("traduzir — o 41º título da lista", () => {
  let chamadas: string[][] = [];

  beforeEach(() => {
    _limparMemoria();
    chamadas = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      const { textos } = JSON.parse(String(init.body)) as { textos: string[] };
      chamadas.push(textos);
      // O servidor traduz tudo que recebe. Quem não receber, não traduz.
      const traducoes = Object.fromEntries(textos.map((t) => [t, `PT: ${t}`]));
      return { ok: true, json: async () => ({ traducoes }) } as Response;
    }));
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("🔴 traduz TODOS os 100 títulos, não só os 40 primeiros", async () => {
    // O DEFEITO (DAD-05): `despachar` cortava a lista em 40 e resolvia o resto
    // como `null` — guardando esse `null` na memória. Do 41º em diante, nenhum
    // título era traduzido na sessão, nem rolando a página nem voltando à tela.
    const titulos = Array.from({ length: 100 }, (_, i) => TITULO(i));
    const resultados = await Promise.all(titulos.map(traduzir));

    expect(resultados.filter((r) => r === null)).toHaveLength(0);
    expect(resultados[40]).toBe(`PT: ${TITULO(40)}`);   // o primeiro que se perdia
    expect(resultados[99]).toBe(`PT: ${TITULO(99)}`);
  });

  it("manda 3 requisições de no máximo 40 — não 100 requisições nem 1 gigante", async () => {
    const titulos = Array.from({ length: 100 }, (_, i) => TITULO(i));
    await Promise.all(titulos.map(traduzir));

    expect(chamadas).toHaveLength(3);
    expect(chamadas.every((c) => c.length <= 40)).toBe(true);
    expect(chamadas.flat().sort()).toEqual([...titulos].sort());
  });

  it("título repetido na tela vira UM pedido só", async () => {
    await Promise.all([traduzir(TITULO(1)), traduzir(TITULO(1)), traduzir(TITULO(2))]);
    expect(chamadas.flat()).toHaveLength(2);
  });

  it("o que já foi traduzido não é pedido de novo", async () => {
    await traduzir(TITULO(1));
    await traduzir(TITULO(1));
    expect(chamadas).toHaveLength(1);
  });
});

describe("falha não vira título duplicado nem memória envenenada", () => {
  beforeEach(() => { _limparMemoria(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("erro de rede devolve null E deixa tentar de novo na próxima montagem", async () => {
    let tentativas = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      tentativas++;
      throw new Error("offline");
    }));
    expect(await traduzir(TITULO(1))).toBeNull();
    expect(await traduzir(TITULO(1))).toBeNull();
    expect(tentativas).toBe(2);   // não guardou o null: perguntou de novo
  });

  it("servidor sem tradução para o texto guarda o null — não insiste à toa", async () => {
    let tentativas = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      tentativas++;
      return { ok: true, json: async () => ({ traducoes: {}, pendentes: [] }) } as Response;
    }));
    expect(await traduzir(TITULO(1))).toBeNull();
    expect(await traduzir(TITULO(1))).toBeNull();
    expect(tentativas).toBe(1);
  });

  it("🔴 título que o servidor ainda está traduzindo NÃO vira null guardado", async () => {
    // O servidor não segura o request esperando a IA: devolve o que já sabe e
    // manda o título novo em `pendentes`. Se o cliente gravasse "não tem" para
    // ele, o mercado recém-listado ficaria em inglês pelo resto da sessão —
    // a mesma falha do `.slice(0, 40)`, com outra roupa.
    let tentativas = 0;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      const { textos } = JSON.parse(String(init.body)) as { textos: string[] };
      tentativas++;
      // Na 1ª vez está pendente; na 2ª, a tradução de fundo já ficou pronta.
      return tentativas === 1
        ? { ok: true, json: async () => ({ traducoes: {}, pendentes: textos }) } as Response
        : { ok: true, json: async () => ({ traducoes: { [textos[0]]: "pronto" }, pendentes: [] }) } as Response;
    }));
    expect(await traduzir(TITULO(1))).toBeNull();
    expect(await traduzir(TITULO(1))).toBe("pronto");   // perguntou de novo, e valeu a pena
    expect(tentativas).toBe(2);
  });

  it("um lote quebrado não apaga os que deram certo", async () => {
    // 100 títulos = 3 lotes. O segundo falha; os outros dois têm que entregar.
    let n = 0;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      const { textos } = JSON.parse(String(init.body)) as { textos: string[] };
      if (++n === 2) return { ok: false, status: 500, json: async () => ({}) } as Response;
      return { ok: true, json: async () => ({ traducoes: Object.fromEntries(textos.map((t) => [t, `PT: ${t}`])) }) } as Response;
    }));
    const titulos = Array.from({ length: 100 }, (_, i) => TITULO(i));
    const r = await Promise.all(titulos.map(traduzir));
    expect(r.filter((x) => x !== null).length).toBeGreaterThanOrEqual(60);
  });
});

describe("pareceEmPortugues — não gasta chamada com o que já está na língua", () => {
  it("reconhece título em português", () => {
    expect(pareceEmPortugues("Quem vai ganhar a eleição de 2026 no Brasil?")).toBe(true);
    expect(pareceEmPortugues("O Fed vai cortar juros até dezembro?")).toBe(true);
  });

  it("na dúvida, traduz: inglês e nome próprio passam batido", () => {
    expect(pareceEmPortugues("Giants vs. Rams")).toBe(false);
    expect(pareceEmPortugues("Will the Fed cut rates by December?")).toBe(false);
  });
});
