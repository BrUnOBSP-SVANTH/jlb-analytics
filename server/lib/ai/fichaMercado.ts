/**
 * Ficha do mercado — o chão que NENHUMA análise pode deixar de ter.
 *
 * O QUE ISTO CONSERTA (05/09). Um mercado de CS2 abriu com a análise dizendo
 * "não temos notícias recentes ou dados proprietários sobre este confronto". Do
 * ponto de vista do leitor, é uma página em branco com um selo de IA. E era
 * evitável duas vezes: as notícias existiam no nosso banco (a busca é que não as
 * achava), e mesmo se não existissem, ainda tínhamos o que dizer.
 *
 * A regra que passa a valer: SEMPRE há o que dizer. Não porque inventamos, mas
 * porque três coisas existem para qualquer mercado, sem exceção:
 *
 *   1. O PREÇO, traduzido. "62%" não diz nada a quem chega; "quem aposta R$ 100
 *      recebe R$ 161 se acertar" diz.
 *   2. NOSSO HISTÓRICO da categoria. Não a base rate genérica que estava escrita
 *      à mão no código ("esportes: 50%, neutro"), mas o que MEDIMOS: em 220
 *      mercados de e-sports acompanhados até a liquidação oficial, o favorito
 *      venceu 84% das vezes. Isso é dado nosso, e é o tipo de coisa que o leitor
 *      não acha em outro lugar.
 *   3. O RELÓGIO. Quanto falta para fechar muda o que importa: em mercado que
 *      resolve amanhã, notícia de ontem é tudo; em um de 2028, é ruído.
 *
 * Nada aqui é estimativa nossa sobre o resultado — é descrição do que existe.
 * Por isso pode ir para a tela mesmo quando a IA não tem convicção nenhuma.
 */
import { SUPABASE_URL, SUPABASE_KEY } from "../supabaseRest.ts";
import { buscarTudo } from "../supaPaginado.ts";
import { getCache, setCache } from "../cache.ts";
import { log } from "../log.ts";

/** O que medimos numa categoria, olhando só o que já resolveu oficialmente. */
export interface HistoricoCategoria {
  categoria: string;
  resolvidos: number;
  /** % das vezes em que o lado favorito (preço > 50%) acabou vencendo. */
  favoritoVenceuPct: number;
  /** Preço médio que o favorito tinha. Comparar com o de cima é o insight. */
  precoMedioFavorito: number;
  /** % das vezes em que o SIM aconteceu — a taxa-base crua da categoria. */
  simAconteceuPct: number;
}

/**
 * Amostra mínima para publicar um número. Abaixo disto a porcentagem oscila
 * demais para significar algo: com 10 casos, um único resultado move 10 pontos.
 */
const MIN_AMOSTRA = 25;

/**
 * FAMÍLIAS. As plataformas não têm taxonomia: os mercados políticos chegam como
 * "trump", "primary elections", "Politics", "politics", "United States",
 * "Trump-Machado"… Medido em 05/09: separados, nenhum desses passava de 18
 * resolvidos e TODOS ficavam abaixo do mínimo — a categoria mais visitada do
 * site (26 dos 200 mercados de maior volume) era justamente a que não tinha
 * histórico para mostrar. Juntos passam de 60.
 *
 * Agrupar não é maquiar amostra: são mercados do mesmo tipo, e a pergunta que a
 * estatística responde ("o favorito costuma vencer nesta área?") é a mesma.
 * A categoria específica continua tendo preferência quando ela sozinha tem
 * amostra — é sempre mais informativa que a família.
 */
const FAMILIAS: Record<string, string[]> = {
  política: ["politics", "trump", "primary elections", "united states", "president",
             "elections", "election", "us election", "world elections", "midterms",
             "senate", "macro geopolitics", "trump-machado", "iran", "israel", "gaza",
             "denmark", "canada", "spain", "france", "french election", "brazil",
             "military strikes", "middle east", "china", "geopolitics", "world",
             "world affairs", "ukraine", "russia", "venezuela", "epstein",
             "california midterm", "alaska midterm", "senate races", "shah",
             "reza pahlavi", "cuba", "mexico cartel war", "pandemics"],
  "e-sports": ["esports", "lol", "league of legends", "cs2", "counter-strike", "dota", "valorant"],
  esportes: ["sports", "soccer", "football", "tennis", "mlb", "nba", "nfl", "nhl",
             "baseball", "basketball", "epl", "mls", "formula 1", "world series",
             "nba finals", "qualification", "golf", "mma", "boxing"],
  cripto: ["crypto", "bitcoin", "ethereum", "solana", "xrp", "token launch", "fdv",
           "crypto legal", "crypto culture"],
  economia: ["finance", "economics", "economy", "oil", "gold", "usd", "global rates",
             "fomc", "ipo", "acquisitions", "tech", "ai", "business", "inflation",
             "rates", "stocks", "earnings", "davos", "financials", "companies",
             "markets", "commodities"],
  cultura: ["culture", "movies", "awards", "music", "gta vi", "gta 6", "avatar",
            "oscars", "best picture", "pop", "celebrities", "tv", "books",
            "entertainment", "film", "cinema", "gaming", "games"],
};

/** Índice invertido: categoria crua → família. Montado uma vez. */
const FAMILIA_DE: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const [familia, membros] of Object.entries(FAMILIAS)) {
    for (const c of membros) m[c] = familia;
  }
  return m;
})();

/** A família de uma categoria crua, ou `null` quando não reconhecemos. */
export function familiaDaCategoria(categoria?: string): string | null {
  return FAMILIA_DE[(categoria ?? "").toLowerCase().trim()] ?? null;
}

const CACHE_KEY = "ficha:historico-categorias";
const CACHE_S = 6 * 60 * 60; // o histórico anda devagar; 6h basta e poupa a rota

/**
 * O histórico medido de cada categoria. Uma consulta só, cacheada — é chamada em
 * toda análise, e não pode custar uma ida ao banco por mercado aberto.
 */
export async function historicoPorCategoria(): Promise<Map<string, HistoricoCategoria>> {
  const cacheado = getCache<Array<HistoricoCategoria>>(CACHE_KEY);
  if (cacheado) return new Map(cacheado.map((h) => [h.categoria, h]));
  if (!SUPABASE_URL || !SUPABASE_KEY) return new Map();

  try {
    // buscarTudo, e não um `limit` grande: o PostgREST corta a resposta em 1.000
    // linhas SEM avisar, por mais que se peça mais. Já erramos assim uma vez, nas
    // estatísticas do track record — o número saía plausível e estava truncado.
    const linhas = await buscarTudo<{ category: string | null; market_prob: number; outcome: boolean }>(
      "ai_forecasts",
      "resolved=eq.true&outcome=not.is.null&select=category,market_prob,outcome&order=id.asc",
    );

    const acc = new Map<string, { n: number; favAcertou: number; somaPrecoFav: number; sim: number }>();
    const somar = (chave: string, preco: number, outcome: boolean) => {
      const a = acc.get(chave) ?? { n: 0, favAcertou: 0, somaPrecoFav: 0, sim: 0 };
      a.n += 1;
      if (preco !== 50) {
        if ((preco > 50) === outcome) a.favAcertou += 1;
        a.somaPrecoFav += preco > 50 ? preco : 100 - preco;
      }
      if (outcome) a.sim += 1;
      acc.set(chave, a);
    };

    for (const l of linhas) {
      const cat = (l.category ?? "other").toLowerCase();
      const preco = Number(l.market_prob);
      if (!Number.isFinite(preco)) continue;
      somar(cat, preco, l.outcome);
      // A mesma linha conta para a família. Não é contagem dobrada: são duas
      // agregações distintas, e só uma delas vai para a tela de cada mercado.
      const fam = familiaDaCategoria(cat);
      if (fam) somar(fam, preco, l.outcome);
    }
    const saida: HistoricoCategoria[] = [];
    for (const [categoria, a] of Array.from(acc)) {
      if (a.n < MIN_AMOSTRA) continue;
      saida.push({
        categoria,
        resolvidos: a.n,
        favoritoVenceuPct: Math.round((a.favAcertou / a.n) * 1000) / 10,
        precoMedioFavorito: Math.round((a.somaPrecoFav / a.n) * 10) / 10,
        simAconteceuPct: Math.round((a.sim / a.n) * 1000) / 10,
      });
    }
    setCache(CACHE_KEY, saida, CACHE_S);
    return new Map(saida.map((h) => [h.categoria, h]));
  } catch {
    log.warn("[ficha] histórico por categoria indisponível — a ficha sai sem ele");
    return new Map();
  }
}

export interface DadosFicha {
  titulo: string;
  precoPct: number;
  categoria: string;
  plataforma: string;
  fechaEm?: string | null;
  volume?: number;
  /** Texto de trajetória já pronto (vem de fetchMarketMomentum), se houver. */
  trajetoria?: string;
}

/** Quanto volta ao apostar R$ 100 num lado, ao preço atual. */
function retornoDe100(precoPct: number): number {
  const p = precoPct / 100;
  return p > 0 ? Math.round((100 / p) * 100) / 100 : 0;
}

function diasAte(iso?: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  const d = (t - Date.now()) / 86_400_000;
  return d > 0 ? d : null;
}

/**
 * Monta a ficha. NUNCA devolve vazio: o preço sempre existe, e do preço já saem
 * duas frases verdadeiras. É esse piso que impede a análise de sair em branco.
 */
export async function montarFicha(d: DadosFicha): Promise<string> {
  const linhas: string[] = [];
  const simPct = Math.round(d.precoPct);
  const naoPct = 100 - simPct;

  linhas.push(
    `PREÇO E O QUE ELE PAGA: o mercado dá ${simPct}% de chance ao SIM. `
    + `Quem apostar R$ 100 no SIM recebe R$ ${retornoDe100(simPct).toFixed(2)} se acertar; `
    + `no NÃO (cotado a ${naoPct}%), recebe R$ ${retornoDe100(naoPct).toFixed(2)}.`,
  );

  const dias = diasAte(d.fechaEm);
  if (dias !== null) {
    linhas.push(
      dias < 2
        ? `RELÓGIO: fecha em menos de 2 dias — o preço já absorveu quase tudo que era público; só notícia de última hora ainda move.`
        : dias < 15
          ? `RELÓGIO: fecha em ${Math.round(dias)} dias — janela em que notícia recente ainda muda o preço.`
          : `RELÓGIO: fecha em ${Math.round(dias)} dias — prazo longo, o preço tende a andar devagar e em semanas, não em horas.`,
    );
  }

  if (typeof d.volume === "number" && d.volume > 0) {
    linhas.push(
      `LIQUIDEZ: US$ ${Math.round(d.volume).toLocaleString("pt-BR")} negociados. `
      + (d.volume >= 100_000
        ? `Volume alto — muita gente apostando, então o preço carrega mais informação.`
        : `Volume baixo — poucos participantes, então o preço é menos confiável como consenso.`),
    );
  }

  if (d.trajetoria) linhas.push(d.trajetoria);

  // A categoria exata primeiro (sempre mais informativa), a família como
  // segunda chance. É o que dá histórico a política, que chega picada em
  // "trump", "primary elections", "United States" e nunca junta amostra sozinha.
  const tabela = await historicoPorCategoria();
  const chaveExata = (d.categoria ?? "").toLowerCase().trim();
  const familia = familiaDaCategoria(chaveExata);
  const hist = tabela.get(chaveExata) ?? (familia ? tabela.get(familia) : undefined);
  if (hist) {
    // O par (venceu %, preço médio) é o que ensina: se o favorito ganha MAIS do
    // que o preço dizia, a categoria vinha subestimando o favorito na amostra.
    const diferenca = hist.favoritoVenceuPct - hist.precoMedioFavorito;
    const leitura = Math.abs(diferenca) < 4
      ? `o preço acertou de perto — o mercado desta categoria vem bem calibrado na nossa amostra`
      : diferenca > 0
        ? `o favorito venceu MAIS do que o preço dizia (${diferenca.toFixed(0)}pp acima), ou seja, nesta amostra a categoria vinha subestimando o favorito`
        : `o favorito venceu MENOS do que o preço dizia (${Math.abs(diferenca).toFixed(0)}pp abaixo), ou seja, nesta amostra pagava-se caro pelo favorito`;
    linhas.push(
      `NOSSO HISTÓRICO EM ${hist.categoria.toUpperCase()}: acompanhamos ${hist.resolvidos} mercados desta área até a liquidação oficial. `
      + `O favorito venceu ${hist.favoritoVenceuPct}% das vezes, com preço médio de ${hist.precoMedioFavorito}% — ${leitura}. `
      + `O SIM aconteceu em ${hist.simAconteceuPct}% deles. `
      + `(Amostra nossa, não projeção: descreve o passado desta categoria, não este mercado.)`,
    );
  }

  return linhas.join("\n");
}

/**
 * O que a tela mostra quando NENHUM provedor de IA responde.
 *
 * Não é detalhe raro: em 05/09 os três estavam fora ao mesmo tempo (Anthropic sem
 * crédito, Gemini em 429, Groq no teto diário), e toda análise do site caía aqui.
 * O texto de então tinha 93 caracteres e dizia "sem notícias recentes" — a página
 * em branco que o produto não aceita, servida justamente no pior momento.
 *
 * A ficha não depende de modelo nenhum. A primeira linha (o preço em dinheiro)
 * vira o parágrafo, as demais viram os marcadores — repetir tudo nos dois lugares
 * encheria a tela com o mesmo texto duas vezes.
 */
export function analiseDeEmergencia(
  ficha: string,
  probPct: number,
  plataforma: string,
): { analysis: string; keyFactors: string[] } {
  const linhas = ficha.split("\n").map((l) => l.trim()).filter(Boolean);
  const primeira = linhas[0] ?? `O mercado está em ${probPct}% no ${plataforma}.`;
  return {
    analysis: `${primeira} A leitura da IA não pôde ser gerada agora — os dados abaixo `
      + `são do nosso banco e não dependem dela. Tente de novo em alguns minutos.`,
    keyFactors: linhas.slice(1),
  };
}
