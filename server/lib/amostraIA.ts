/**
 * A amostra do Track Record — uma leitura, um denominador, uma régua.
 *
 * O QUE ISTO CONSERTA (TRK-01, TRK-02, TRK-03, TRK-04, DSH-03, PRV-04, HOME-02).
 * A auditoria abriu `/track-record` e contou CINCO totais diferentes de
 * "previsões resolvidas" na mesma página: 1002, 1014, 1013, 983 e 964. Não era
 * cache velho nem race condition — cada bloco da tela buscava de um endpoint
 * diferente, e cada endpoint filtrava a mesma tabela de um jeito:
 *
 *   /track-record        view SQL, `COUNT(*) FILTER (WHERE resolved)`
 *   /calibration-curve   resolved=true AND outcome IS NOT NULL
 *   /by-category         idem, com corte de amostra em 15
 *   /evolution           idem + resolved_at IS NOT NULL, corte em 30
 *   /sample-transparency tudo, deduplicado depois
 *   AccuracyAnalysis     50 linhas, calculadas no navegador
 *
 * O pior deles estava na view: `brier` é NULL quando `outcome` é NULL (coluna
 * gerada, migration 007), então `AVG(brier)` media sobre um conjunto e
 * `resolved_count` contava outro, MAIOR. "Bateu o mercado" saía de
 * `beat_market_count / resolved_count` — numerador de um conjunto, denominador
 * de outro. Daí os 12% de um bloco contra os 43% de outro na mesma tela.
 *
 * Num produto cujo argumento é "audite você mesmo", número que não fecha não é
 * bug de exibição: é a tese do produto se desmentindo na própria página.
 *
 * A REGRA, agora escrita uma vez só:
 *
 *   resolvida  =  resolved === true  E  outcome !== null
 *
 * Linha marcada como resolvida sem desfecho não pode ser pontuada — não tem
 * Brier, não tem acerto, não diz nada sobre calibração. Ela existe (o mercado
 * fechou, o resolvedor não conseguiu o resultado), e por isso aparece à parte,
 * declarada. O que não pode é entrar no denominador de uma conta cujo numerador
 * ela nunca poderia integrar.
 */
import { buscarTudo } from "./supaPaginado.ts";
import { dedupPorMercado } from "./calibrationData.ts";
import { getCache, setCache } from "./cache.ts";
import { intervaloWilson, comparaComMercado } from "./ai/incerteza.ts";
import { MIN_AMOSTRA as MINIMO } from "../../shared/referencias.ts";

/**
 * O corte de amostra do site inteiro — por tema, por mês e por faixa.
 *
 * 20 porque é o número que a página `/track-record` JÁ PROMETE por escrito:
 * "Só exibimos os números a partir de 20 resolvidas — abaixo disso é ruído
 * estatístico, não evidência." A auditoria encontrou a tabela logo abaixo desse
 * texto listando temas com 1, 2, 3 e 4 casos, e os endpoints usando 15 num lugar
 * e 30 em outro. Regra publicada que o próprio site não cumpre é pior do que
 * regra nenhuma.
 */
export { MIN_AMOSTRA } from "../../shared/referencias.ts";

export interface LinhaIA {
  market_id: string;
  source: string;
  title: string;
  category: string | null;
  model: string | null;
  market_prob: number | string;
  ai_fair_value: number | string;
  brier: number | string | null;
  market_brier: number | string | null;
  outcome: boolean | null;
  resolved: boolean;
  resolved_at: string | null;
  resolution_source: string | null;
  forecast_date: string;
  created_at: string;
}

export interface Amostra {
  /** 1 linha por mercado (a previsão mais antiga), como a view sempre fez. */
  todas: LinhaIA[];
  /** O conjunto pontuável: resolvida COM desfecho. É o denominador de tudo. */
  resolvidas: LinhaIA[];
  /** Ainda vai resolver. Fica à vista: é o que prova que não há escolha a dedo. */
  emAberto: LinhaIA[];
  /** Fechou sem desfecho utilizável. Declarada, nunca somada em silêncio. */
  semDesfecho: LinhaIA[];
}

const COLUNAS = [
  "market_id", "source", "title", "category", "model",
  "market_prob", "ai_fair_value", "brier", "market_brier",
  "outcome", "resolved", "resolved_at", "resolution_source",
  "forecast_date", "created_at",
].join(",");

const CHAVE_CACHE = "ia-amostra-v1";
const TTL = 600;

const n = (v: number | string | null | undefined): number | null => {
  if (v === null || v === undefined) return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};

/**
 * Lê a tabela inteira UMA vez, deduplica UMA vez e classifica UMA vez.
 *
 * `buscarTudo` é obrigatório aqui: o PostgREST corta em 1.000 linhas em
 * SILÊNCIO — `limit=5000` devolve 200 OK com 1.000 —, e a amostra já passou
 * disso. Um corte silencioso aqui apareceria como "a IA piorou", não como erro.
 *
 * Auto-heal de coluna: `model` e `resolution_source` chegaram em migrations
 * posteriores (018, 023). Num banco anterior a elas o PostgREST responde 400, e
 * a leitura é refeita sem as colunas novas em vez de a página inteira sumir.
 */
export async function carregarAmostra(): Promise<Amostra | null> {
  const cache = getCache<Amostra>(CHAVE_CACHE);
  if (cache) return cache;

  let linhas = await buscarTudo<LinhaIA>("ai_forecasts", `select=${COLUNAS}&order=created_at.asc`);
  if (linhas.length === 0) {
    const basico = COLUNAS.replace(",model", "").replace(",resolution_source", "");
    linhas = await buscarTudo<LinhaIA>("ai_forecasts", `select=${basico}&order=created_at.asc`);
  }
  if (linhas.length === 0) return null;

  const todas = dedupPorMercado(linhas);
  const amostra: Amostra = {
    todas,
    resolvidas:  todas.filter((r) => r.resolved && r.outcome !== null),
    emAberto:    todas.filter((r) => !r.resolved),
    semDesfecho: todas.filter((r) => r.resolved && r.outcome === null),
  };

  setCache(CHAVE_CACHE, amostra, TTL);
  return amostra;
}

export interface ResumoIA {
  /** Mercados acompanhados — o universo. */
  total: number;
  /** O denominador. Toda porcentagem desta página divide por ele. */
  resolvidas: number;
  emAberto: number;
  /** Fechou sem resultado utilizável. Zero na maioria dos dias; nunca escondido. */
  semDesfecho: number;

  aiBrier: number | null;
  marketBrier: number | null;
  /** 1 − nosso/mercado. Positivo = melhor que o mercado. */
  skillVsMarket: number | null;

  /** Brier melhor que o do mercado, caso a caso. Mesmo denominador. */
  bateuMercado: number;
  bateuMercadoPct: number | null;

  /**
   * O teste difícil: quando divergimos do preço e dissemos que o mercado errou,
   * acertamos? Denominador = só os casos em que houve divergência.
   *
   * Esta é a outra metade do achado TRK-02. A tela mostrava 12% num bloco
   * (Brier, sobre todas as resolvidas) e 43% em outro (divergência, sobre 50
   * linhas) — duas perguntas legítimas, dois denominadores incompatíveis e
   * nenhuma explicação. Agora as duas saem da mesma amostra e cada bloco diz
   * qual pergunta responde.
   */
  divergimos: number;
  acertosAoDivergir: number;
  taxaAoDivergir: number | null;

  /** Acerto DIRECIONAL: previu o lado certo. Exclui os 50% exatos, que não têm lado. */
  acertos: number;
  comLado: number;
  taxaAcerto: number | null;
  acertosMercado: number;
  comLadoMercado: number;
  taxaAcertoMercado: number | null;

  /** Quantas vieram do settlement OFICIAL, não de preço inferido. */
  oficiais: number;

  edgeMedioPp: number | null;
  intervalo: ReturnType<typeof intervaloWilson>;
  comparacaoMercado: ReturnType<typeof comparaComMercado>;
}

const media = (v: (number | null)[]): number | null => {
  const bons = v.filter((x): x is number => x !== null);
  return bons.length ? bons.reduce((s, x) => s + x, 0) / bons.length : null;
};

/**
 * Todas as contas da manchete, do mesmo conjunto.
 *
 * As duas leituras de "bateu o mercado" continuam existindo — elas medem coisas
 * diferentes e ambas são legítimas:
 *   • `bateuMercadoPct` — em quantos mercados nosso Brier foi menor que o dele;
 *   • `taxaAcerto` vs `taxaAcertoMercado` — quem acertou mais o LADO.
 * O que a auditoria pegou não foi a existência das duas, e sim as duas
 * dividindo por denominadores diferentes sem dizer. Agora o denominador é o
 * mesmo e cada uma sai rotulada com o que mede.
 */
export function resumir(a: Amostra): ResumoIA {
  const r = a.resolvidas;

  const aiBrier = media(r.map((x) => n(x.brier)));
  const marketBrier = media(r.map((x) => n(x.market_brier)));

  const bateu = r.filter((x) => {
    const meu = n(x.brier), dele = n(x.market_brier);
    return meu !== null && dele !== null && meu < dele;
  }).length;

  const comLado = r.filter((x) => n(x.ai_fair_value) !== 50);
  const acertos = comLado.filter((x) => (n(x.ai_fair_value)! > 50) === !!x.outcome).length;

  const comLadoMkt = r.filter((x) => n(x.market_prob) !== 50);
  const acertosMkt = comLadoMkt.filter((x) => (n(x.market_prob)! > 50) === !!x.outcome).length;

  const divergentes = r.filter((x) => n(x.ai_fair_value) !== n(x.market_prob));
  const ganhouAoDivergir = divergentes.filter(
    (x) => (n(x.ai_fair_value)! > n(x.market_prob)!) === !!x.outcome,
  ).length;

  const edges = a.todas.map((x) => {
    const f = n(x.ai_fair_value), m = n(x.market_prob);
    return f !== null && m !== null ? Math.abs(f - m) : null;
  });

  const pct = (parte: number, todo: number) => todo > 0 ? Math.round((parte / todo) * 100) : null;
  const arred = (v: number | null, casas: number) => v === null ? null : Number(v.toFixed(casas));

  return {
    total: a.todas.length,
    resolvidas: r.length,
    emAberto: a.emAberto.length,
    semDesfecho: a.semDesfecho.length,

    aiBrier: arred(aiBrier, 4),
    marketBrier: arred(marketBrier, 4),
    skillVsMarket: aiBrier !== null && marketBrier !== null && marketBrier > 0
      ? Number((1 - aiBrier / marketBrier).toFixed(3)) : null,

    bateuMercado: bateu,
    bateuMercadoPct: pct(bateu, r.length),

    divergimos: divergentes.length,
    acertosAoDivergir: ganhouAoDivergir,
    taxaAoDivergir: pct(ganhouAoDivergir, divergentes.length),

    acertos,
    comLado: comLado.length,
    taxaAcerto: pct(acertos, comLado.length),
    acertosMercado: acertosMkt,
    comLadoMercado: comLadoMkt.length,
    taxaAcertoMercado: pct(acertosMkt, comLadoMkt.length),

    oficiais: r.filter((x) => x.resolution_source === "settled").length,

    edgeMedioPp: arred(media(edges), 1),
    intervalo: intervaloWilson(acertos, comLado.length),
    comparacaoMercado: comparaComMercado(acertos, comLado.length, acertosMkt, comLadoMkt.length),
  };
}

export interface Fatia {
  nome: string;
  n: number;
  /** `null` quando a amostra não chega em MIN_AMOSTRA — e aí não há veredito. */
  taxaAcerto: number | null;
  margemPp: number | null;
  taxaAcertoMercado: number | null;
  comparacao: string | null;
  /** Acerto quando divergimos do preço, nesta fatia. Mesma pergunta do resumo. */
  divergimos: number;
  taxaAoDivergir: number | null;
  /** Calibração da fatia. Sai mesmo com amostra fina — o Brier não é porcentagem
   *  de acerto e não sugere veredito; quem mostra é que decide se cabe. */
  aiBrier: number | null;
  marketBrier: number | null;
  skillVsMarket: number | null;
  oficiais: number;
  /** O que fazer com esta fatia na tela: `veredito` ou `insuficiente`. */
  estado: "veredito" | "insuficiente";
}

/**
 * Recorta a amostra por um critério (tema, mês, provedor) aplicando a MESMA
 * régua de amostra mínima em todos os casos.
 *
 * Abaixo de `MIN_AMOSTRA` a fatia sai com `estado: "insuficiente"` e sem
 * porcentagem alguma — não com uma porcentagem em letra miúda. Declarar "ainda
 * não sei" é informação; publicar 100% de acerto sobre 1 caso é ruído com cara
 * de evidência, e foi o que a auditoria fotografou.
 */
export function fatiar(
  linhas: LinhaIA[],
  chave: (l: LinhaIA) => string,
  minimo = MINIMO,
): Fatia[] {
  const grupos = new Map<string, LinhaIA[]>();
  for (const l of linhas) {
    const k = chave(l);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k)!.push(l);
  }

  return Array.from(grupos.entries()).map(([nome, v]) => {
    const comLado = v.filter((x) => n(x.ai_fair_value) !== 50);
    const acertos = comLado.filter((x) => (n(x.ai_fair_value)! > 50) === !!x.outcome).length;
    const comLadoMkt = v.filter((x) => n(x.market_prob) !== 50);
    const acertosMkt = comLadoMkt.filter((x) => (n(x.market_prob)! > 50) === !!x.outcome).length;

    const divergentes = v.filter((x) => n(x.ai_fair_value) !== n(x.market_prob));
    const ganhouAoDivergir = divergentes.filter(
      (x) => (n(x.ai_fair_value)! > n(x.market_prob)!) === !!x.outcome,
    ).length;

    const aiB = media(v.map((x) => n(x.brier)));
    const mktB = media(v.map((x) => n(x.market_brier)));

    const suficiente = v.length >= minimo && comLado.length > 0;
    const ic = suficiente ? intervaloWilson(acertos, comLado.length) : null;

    return {
      nome,
      n: v.length,
      taxaAcerto: ic ? Math.round((acertos / comLado.length) * 100) : null,
      margemPp: ic?.margemPp ?? null,
      taxaAcertoMercado: suficiente && comLadoMkt.length > 0
        ? Math.round((acertosMkt / comLadoMkt.length) * 100) : null,
      comparacao: suficiente
        ? comparaComMercado(acertos, comLado.length, acertosMkt, comLadoMkt.length)?.veredito ?? null
        : null,
      divergimos: divergentes.length,
      taxaAoDivergir: suficiente && divergentes.length > 0
        ? Math.round((ganhouAoDivergir / divergentes.length) * 100) : null,
      aiBrier: aiB === null ? null : Number(aiB.toFixed(4)),
      marketBrier: mktB === null ? null : Number(mktB.toFixed(4)),
      skillVsMarket: aiB !== null && mktB !== null && mktB > 0
        ? Number((1 - aiB / mktB).toFixed(3)) : null,
      oficiais: v.filter((x) => x.resolution_source === "settled").length,
      estado: (suficiente ? "veredito" : "insuficiente") as Fatia["estado"],
    };
  }).sort((a, b) => b.n - a.n);
}
