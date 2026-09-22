import { describe, it, expect } from "vitest";
import { montarDestaques, ttlDaVitrine } from "./destaques.ts";

const mercado = (over: Record<string, unknown> = {}) => ({
  id: "1", question: "Vai chover?", outcomePrices: '["0.42","0.58"]', volume: 1000, ...over,
});

describe("montarDestaques — o pouco que a home precisa", () => {
  it("devolve preço em 0–1 e o total das duas fontes", () => {
    const { destaques, totais } = montarDestaques([mercado()], 120);
    expect(destaques[0]).toEqual({ id: "1", titulo: "Vai chover?", prob: 0.42, volume: 1000 });
    expect(totais).toEqual({ polymarket: 1, kalshi: 120 });
  });

  it("evento AGREGADO: o título é o evento e o número vem com o nome do desfecho", () => {
    // Em mercado agrupado a pergunta que a plataforma manda é a do desfecho
    // líder ("25 bps") — sozinha, não diz de que mercado se trata. Quem carrega
    // o específico são os desfechos. Auditoria 21/09, DAD-01/DAD-02.
    const [d] = montarDestaques([mercado({
      question: "25 bps",
      eventTitle: "Decisão do Fed em setembro",
      outcomes: '["25 bps","Manter","50 bps"]',
      outcomePrices: '["0.62","0.30","0.08"]',
    })], 0).destaques;
    expect(d.titulo).toBe("Decisão do Fed em setembro");
    expect(d.desfecho).toBe("25 bps");     // 62% de QUEM
    expect(d.prob).toBeCloseTo(0.62, 3);
  });

  it("binário: a PERGUNTA é o título, e o evento vira subtítulo", () => {
    // O contrário do caso acima, e o defeito que a auditoria fotografou: a home
    // mostrava "Which party will win the House in 2026? 93%" — 93% de qual partido?
    const [d] = montarDestaques([mercado({
      question: "Will the Democratic Party control the House after the 2026 Midterm elections?",
      eventTitle: "Which party will win the House in 2026?",
      outcomes: '["Yes","No"]',
      outcomePrices: '["0.925","0.075"]',
    })], 0).destaques;
    expect(d.titulo).toContain("Democratic Party");
    expect(d.subtitulo).toBe("Which party will win the House in 2026?");
    expect(d.desfecho).toBeUndefined();   // Sim/Não não precisa de nome
  });

  it("mercado sem preço real não vai para a tela", () => {
    const { destaques, totais } = montarDestaques([
      mercado({ id: "a", outcomePrices: undefined }),
      mercado({ id: "b", outcomePrices: "não é json" }),
      mercado({ id: "c" }),
      mercado({ id: "" }),
    ], 5);
    expect(destaques.map((d) => d.id)).toEqual(["c"]);
    // O total conta o catálogo inteiro — é o número que a home anuncia.
    expect(totais.polymarket).toBe(4);
  });

  it("corta no limite pedido", () => {
    const muitos = Array.from({ length: 30 }, (_, i) => mercado({ id: String(i) }));
    expect(montarDestaques(muitos, 0, 8).destaques).toHaveLength(8);
  });

  it("volume cai para o de 24h quando não há total", () => {
    const [d] = montarDestaques([mercado({ volume: undefined, volume24hr: 77 })], 0).destaques;
    expect(d.volume).toBe(77);
  });
});

describe("preço decidido não entra na vitrine", () => {
  it("tira o que já acabou (>=97% ou <=3%) e segue preenchendo", () => {
    const m = (id: string, p: string) => ({ id, question: "q" + id, outcomePrices: `["${p}","x"]`, volume: 1 });
    const { destaques } = montarDestaques([
      m("acabado", "0.995"),   // jogo decidido — era o que abria a fileira em 16/09
      m("zerado", "0.01"),
      m("vivo", "0.42"),
      m("vivo2", "0.66"),
    ], 0, 8);
    expect(destaques.map((d) => d.id)).toEqual(["vivo", "vivo2"]);
  });

  it("a borda continua valendo: 96% entra, 97% não", () => {
    const m = (id: string, p: string) => ({ id, question: "q", outcomePrices: `["${p}","x"]`, volume: 1 });
    expect(montarDestaques([m("a", "0.96")], 0).destaques).toHaveLength(1);
    expect(montarDestaques([m("b", "0.97")], 0).destaques).toHaveLength(0);
  });
});

describe("prazo vencido não fica na vitrine", () => {
  const AGORA = new Date("2026-09-17T12:00:00Z").getTime();
  const m = (id: string, over: Record<string, unknown> = {}) => ({
    id, question: "q" + id, outcomePrices: '["0.42","0.58"]', volume: 1, ...over,
  });

  it("mercado com data de fim no passado sai, mesmo com preço em aberto", () => {
    // O caso que dois caches empilhados (catálogo 90s + vitrine 60s) deixavam
    // passar: fechou às 11h, a home ainda o mostrava.
    const { destaques } = montarDestaques([
      m("vencido", { endDate: "2026-09-17T11:00:00Z" }),
      m("vivo", { endDate: "2026-09-20T00:00:00Z" }),
    ], 0, 8, AGORA);
    expect(destaques.map((d) => d.id)).toEqual(["vivo"]);
  });

  it("respeita o que a origem já marcou como encerrado", () => {
    const { destaques } = montarDestaques([
      m("fechado", { closed: true }),
      m("inativo", { active: false }),
      m("vivo"),
    ], 0, 8, AGORA);
    expect(destaques.map((d) => d.id)).toEqual(["vivo"]);
  });

  it("sem data de fim, segue valendo — não se descarta por falta de campo", () => {
    expect(montarDestaques([m("sem-data")], 0, 8, AGORA).destaques).toHaveLength(1);
    expect(montarDestaques([m("data-lixo", { endDate: "não é data" })], 0, 8, AGORA).destaques).toHaveLength(1);
  });

  it("fecha daqui a um minuto: ainda é um mercado vivo", () => {
    const daquiAPouco = new Date(AGORA + 60_000).toISOString();
    expect(montarDestaques([m("quase", { endDate: daquiAPouco })], 0, 8, AGORA).destaques).toHaveLength(1);
  });
});

describe("ttlDaVitrine — o cache não pode sobreviver ao fechamento", () => {
  const AGORA = new Date("2026-09-17T12:00:00Z").getTime();
  const daqui = (segundos: number) => new Date(AGORA + segundos * 1000).toISOString();

  it("tudo fechando longe: vale o teto normal", () => {
    expect(ttlDaVitrine([daqui(3600), daqui(86_400)], AGORA)).toBe(60);
    expect(ttlDaVitrine([undefined, undefined], AGORA)).toBe(60);
  });

  it("um mercado fecha em 20s: o cache morre com ele", () => {
    expect(ttlDaVitrine([daqui(3600), daqui(20)], AGORA)).toBe(20);
  });

  it("fechamento colado no agora respeita o piso de 5s", () => {
    // Sem piso, a home reconstruiria a lista a cada requisição.
    expect(ttlDaVitrine([daqui(1)], AGORA)).toBe(5);
  });

  it("data no passado não encurta nada — quem filtra o vencido é montarDestaques", () => {
    expect(ttlDaVitrine([daqui(-100), daqui(3600)], AGORA)).toBe(60);
  });
});
