/**
 * trending.ts — camada de domínio de mercados em alta (JLB Analytics)
 *
 * Tipos, normalização de categoria, construtores de TrendingItem e fetchers
 * das fontes (Reddit, Polymarket, Kalshi, Manifold). Extraído de Apostas.tsx
 * para isolar a lógica pura da UI. São funções puras + fetch — sem React.
 */
import { analyzeSentiment } from "@/lib/predictions";
import { dolar, pct, pp } from "@shared/formato";
import { getMarkets } from "@/lib/marketsCache";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RedditPost {
  title: string;
  url: string;
  /** AUSENTES quando a fonte é o feed RSS — o Reddit não publica votos nem
   *  comentários por lá, e preencher com zero seria afirmar algo falso.
   *  Ver o cabeçalho de server/routes/reddit.ts. */
  score?: number;
  num_comments?: number;
  subreddit: string;
  created_utc: number;
  permalink: string;
  selftext?: string;
}

export interface PolyBet {
  id: string;
  slug: string;
  eventSlug?: string;
  question: string;
  eventTitle?: string;
  volume: number | string;
  liquidity: number | string;
  volume24h?: number | string;
  weekPriceChange?: number | string;
  yesProb?: number;
  prevYesProb?: number;
  endDate?: string;
  closeTime?: string;
  active: boolean;
  closed: boolean;
  category?: string;
  featured?: boolean;
  outcomePrices?: string;
  outcomes?: string;
  clobTokenIds?: string;
  externalUrl?: string; // URL canônica computada no servidor (fonte da verdade)
}

export interface ManifoldMarket {
  id: string;
  question: string;
  probability: number;
  volume: number;
  url: string;
  closeTime?: number;
  creatorName?: string;
  lastUpdatedTime?: number;
  createdTime?: number;
  groupSlugs?: string[];
}

export interface KalshiMarket {
  ticker: string;
  eventTicker: string;
  seriesTicker: string;
  title: string;
  yesProb: number;
  prevYesProb?: number;
  volume: number;
  volume24h?: number;
  openInterest?: number;
  liquidity?: number;
  closeTime?: string;
  category?: string;
  externalUrl?: string; // URL canônica computada no servidor (fonte da verdade)
  outcomes?: { label: string; prob: number }[];
}

export type Source = "reddit" | "polymarket" | "kalshi" | "manifold";
/**
 * As categorias, redesenhadas a partir do que o público brasileiro procura
 * (MKT-13, ANL-05).
 *
 * O QUE A AUDITORIA VIU. A decisão do Fed e o Estreito de Ormuz apareciam os
 * dois como "Negócios", e não existia categoria de macro/juros — que é
 * justamente a especialidade do produto. Um grupo chamado "Negócios" que engole
 * ao mesmo tempo balanço de empresa, taxa de juros e conflito no Oriente Médio
 * não ajuda ninguém a achar nada.
 *
 * Três separações que fazem diferença de verdade para quem lê daqui:
 *   · MACRO (Selic, Fed, inflação, câmbio) sai de "Negócios" e ganha nome —
 *     é o assunto que a JLB ensina;
 *   · ELEIÇÕES sai de "Política", porque é o recorte que as pessoas buscam
 *     por nome ("eleição 2026"), não o guarda-chuva;
 *   · GEOPOLÍTICA sai de "Política" também: Ormuz e Irã não são eleição.
 */
export type CategoryFilter =
  | "all" | "macro" | "elections" | "geopolitics" | "sports"
  | "crypto" | "tech" | "business" | "culture" | "other";

export const CATEGORY_LABELS: Record<CategoryFilter, string> = {
  all: "Todas",
  macro: "Macro e Juros",
  elections: "Eleições e Política",
  geopolitics: "Geopolítica",
  sports: "Esportes",
  crypto: "Cripto",
  tech: "Tecnologia",
  business: "Empresas",
  culture: "Cultura",
  other: "Outros",
};

/** Normaliza categoria bruta da API → CategoryFilter */
export function normalizeCategory(raw?: string, source?: Source, subreddit?: string): CategoryFilter {
  if (source === "reddit") {
    if (subreddit === "sportsbook" || subreddit === "futebol" || subreddit === "soccer") return "sports";
    if (subreddit === "geopolitics") return "geopolitics";
    if (subreddit === "wallstreetbets" || subreddit === "investing") return "business";
    return "other";
  }
  if (!raw) return "other";
  const r = raw.toLowerCase();

  // A ORDEM IMPORTA: o primeiro grupo que casar vence, e é isso que resolve as
  // ambiguidades. Macro vem antes de Empresas porque "Fed", "juros" e "inflação"
  // caíam em Negócios; Geopolítica e Eleições vêm antes do resto de Política
  // porque "Iran" e "Military Strikes" caíam no mesmo balde que "midterm".
  if (radical(r, RADICAIS.macro)       || palavra(r, SIGLAS.macro))       return "macro";
  // Geopolítica ANTES de eleições: "Military Strikes" e "Iran" são política,
  // mas não são eleição — e o radical genérico `polit` (que mora em eleições,
  // para a categoria crua "Politics" ter casa) casaria os dois.
  if (radical(r, RADICAIS.geopolitics) || palavra(r, SIGLAS.geopolitics)) return "geopolitics";
  if (radical(r, RADICAIS.elections)   || palavra(r, SIGLAS.elections))   return "elections";
  if (radical(r, RADICAIS.sports)      || palavra(r, SIGLAS.sports))      return "sports";
  if (radical(r, RADICAIS.crypto)      || palavra(r, SIGLAS.crypto))      return "crypto";
  if (radical(r, RADICAIS.tech)        || palavra(r, SIGLAS.tech))        return "tech";
  if (radical(r, RADICAIS.business)    || palavra(r, SIGLAS.business))    return "business";
  if (radical(r, RADICAIS.culture)     || palavra(r, SIGLAS.culture))     return "culture";
  return "other";
}

/**
 * Radical = casa como PEDAÇO da palavra. Só para raízes longas e inequívocas
 * ("polit" pega politics/political/politician).
 */
const radical = (texto: string, raizes: readonly string[]) => raizes.some((t) => texto.includes(t));

/**
 * Sigla/nome = casa como PALAVRA INTEIRA. Existe porque casar sigla por pedaço
 * produz absurdo silencioso: a regra antiga tinha `includes("ai")` e classificava
 * mercado sobre a UCRÂNIA como Ciência/Tech — "ukr(ai)ne". Mesma armadilha de
 * "oil" dentro de "b(oil)ing" e "uk" dentro de "(uk)raine".
 */
const palavra = (texto: string, termos: readonly string[]) =>
  termos.some((t) => new RegExp(`(?<![a-z0-9])${t}(?![a-z0-9])`).test(texto));

// As listas abaixo NÃO são chute: saíram de auditar as 73 categorias cruas que
// caíam em "Outros" com os mercados reais em 01/09/2026 — 48% do catálogo do
// Polymarket era inclassificável, com erros gritantes ("fomc" e "Financials"
// fora de Negócios, "Iran" e "Military Strikes" fora de Política, "MLB" fora de
// Esportes). Ao ampliar o catálogo de 96 para 272 o problema saiu do canto e
// virou quase metade da tela.
const RADICAIS = {
  // A especialidade da casa, e a que não tinha nome: juros, inflação, câmbio,
  // atividade. Vem PRIMEIRO na ordem por isso.
  macro:       ["inflation", "inflaç", "juros", "selic", "econom", "gdp", "pib", "recession", "recess",
                "fomc", "powell", "interest rate", "cpi", "unemployment", "tariff", "câmbio", "cambio",
                "monetary", "central bank", "banco central", "copom"],
  // `polit`, `govern` e companhia moram aqui porque a categoria crua das bolsas
  // costuma ser só "Politics", e a esmagadora maioria desses mercados é
  // eleitoral. O que é geopolítico já foi capturado na linha anterior.
  elections:   ["election", "eleiç", "eleic", "midterm", "primary", "primár", "ballot", "candidate",
                "candidat", "nominee", "poll", "governor", "senate race", "presidential",
                "polit", "govern", "govt", "congress", "senate", "parliament", "minister", "court"],
  geopolitics: ["geopolit", "military", "militar", "war", "guerra", "regime", "sanction", "sanç",
                "unrest", "strike", "invasion", "nato", "treaty", "ceasefire", "hostage", "conflict"],
  sports:      ["sport", "soccer", "football", "futebol", "baseball", "tennis", "boxing", "hockey",
                "basket", "golf", "racing", "cricket", "brasileir", "libertadores"],
  crypto:      ["crypto", "bitcoin", "ethereum", "defi", "web3", "blockchain", "token", "stablecoin"],
  tech:        ["tech", "space", "artificial intelligence", "software", "chip", "semicondut",
                "science", "climate", "clima", "health", "medical", "research", "drug", "pandemic",
                "vaccine", "nasa", "hurricane"],
  business:    ["business", "stock", "financ", "compan", "empresa", "acquisition", "earnings",
                "revenue", "ipo", "merger", "bank", "market cap"],
  culture:     ["entertain", "award", "music", "movie", "film", "celebrity", "culture", "cultura",
                "oscar", "grammy", "emmy", "netflix", "gta"],
} as const;

const SIGLAS = {
  macro:       ["fed", "cpi", "rate", "rates", "davos", "opec", "oil", "bcb", "ipca", "igp"],
  elections:   ["lula", "bolsonaro", "biden", "trump", "harris", "vance", "tse"],
  geopolitics: ["world", "iran", "israel", "china", "russia", "ukraine", "nato", "cuba", "venezuela",
                "putin", "zelensky", "middle east", "gaza", "taiwan", "north korea", "hamas", "resign"],
  sports:      ["nba", "nfl", "mlb", "mls", "nhl", "ufc", "mma", "ucl", "atp", "wta", "us open", "f1", "cbf"],
  crypto:      ["btc", "eth", "xrp", "sol", "solana", "doge", "fdv"],
  tech:        ["ai", "fda", "spacex", "openai", "anthropic", "nvidia", "apple"],
  business:    ["ipo", "s&p", "nasdaq"],
  culture:     ["pop", "tv"],
} as const;

export type DynamicBadge = "viral" | "nova" | "em-alta" | "encerrando";

export interface TrendingItem {
  id: string;
  title: string;
  source: Source;
  subreddit?: string;
  badge?: DynamicBadge;
  endDate?: string;
  score: number;
  comments?: number;
  upvotes?: number;
  volume?: number;
  volume24h?: number;
  liquidity?: number;
  openInterest?: number;
  weekPriceChange?: number;
  /** Always 0–1 decimal (normalized at build time) */
  yesProb?: number;
  prevYesProb?: number;
  /** Parsed multi-outcome list, sorted by prob desc. Only set when outcomes > 2. */
  parsedOutcomes?: { label: string; prob: number }[];
  clobTokenIds?: string;
  externalUrl: string;
  whyTrending: string;
  bestBetNote: string;
  sentiment: ReturnType<typeof analyzeSentiment>;
  ageHours: number;
  category?: string;
  normalizedCategory: CategoryFilter;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function toNum(v: unknown): number {
  const n = parseFloat(String(v));
  return isNaN(n) ? 0 : n;
}

/**
 * Normaliza uma probabilidade para a faixa 0.01–0.99, tratando NaN/Infinity.
 * Crítico: `?? fallback` NÃO pega NaN (só null/undefined), e Math.max/min
 * PROPAGAM NaN — então sem isto um preço inválido vira "NaN%" no card.
 */
export function clampProb(p: number, fallback = 0.5): number {
  if (!isFinite(p)) return fallback;
  return Math.max(0.01, Math.min(0.99, p));
}

export function hoursAgo(utcSeconds: number) {
  return (Date.now() / 1000 - utcSeconds) / 3600;
}

/**
 * Volume em dólar, escrito em português (MKT-09).
 *
 * Saía como `$108.6M`, `$898K`, `Liq: $2K` — formato en-US num produto
 * brasileiro que já formata corretamente em reais na Banca Simulada.
 */
export function formatVolume(v: number) {
  return dolar(v);
}

export function formatOdds(prob: number): string {
  if (prob <= 0 || prob >= 1) return "—";
  return `${(1 / prob).toFixed(2)}x`;
}

export function isClosingSoon(dateStr?: string): boolean {
  if (!dateStr) return false;
  const hoursUntil = (new Date(dateStr).getTime() - Date.now()) / 3_600_000;
  return hoursUntil > 0 && hoursUntil < 72;
}

function whyTrendingReddit(post: RedditPost): string {
  const age = hoursAgo(post.created_utc);
  const snippet = post.title.length > 70 ? post.title.slice(0, 70) + "…" : post.title;

  // Sem métrica de engajamento (caso do feed RSS) não dá para dizer "viral" nem
  // citar votos. O texto passa a falar do que SABEMOS — o assunto e a idade.
  if (post.score === undefined || post.num_comments === undefined) {
    return `"${snippet}" — discussão recente em r/${post.subreddit}, de ${Math.round(age)}h atrás. `
      + `O Reddit não publica a contagem de votos neste feed, então trate como pauta a investigar, `
      + `não como sinal de volume. Expanda para cruzar com notícias e mercados.`;
  }
  const commentRatio = post.num_comments / Math.max(1, post.score);

  if (age < 3 && post.score > 200)
    return `"${snippet}" — viral em ${Math.round(age)}h com ${post.score.toLocaleString()} votos. Crescimento exponencial sugere que o mercado ainda não precificou completamente esta informação. Expanda para ver notícias relacionadas.`;
  if (commentRatio > 0.8)
    return `"${snippet}" — ${post.num_comments} comentários para ${post.score} votos (ratio ${commentRatio.toFixed(1)}x). Alta divergência de opiniões frequentemente cria ineficiências de preço. Expanda para cruzar com notícias recentes.`;
  if (post.score > 1000)
    return `"${snippet}" — ${post.score.toLocaleString()} upvotes. Eventos com este nível de consenso comunitário costumam mover odds nas casas antes do próximo ciclo. Expanda para contexto e notícias.`;
  if (age < 6 && post.score > 100)
    return `"${snippet}" — tração rápida em ${Math.round(age)}h (${post.score} votos). Comunidade absorvendo a informação antes do ajuste de mercado. Expanda para ver o que as notícias dizem.`;
  if (post.num_comments > 200)
    return `"${snippet}" — ${post.num_comments} comentários de apostadores analisando o evento. Alta discussão geralmente precede movimento de odds em 12–24h. Expanda para cruzar com notícias.`;
  return `"${snippet}" — presença mantida no feed quente, interesse acima da média. Expanda para ver análise contextual com notícias relacionadas.`;
}

/**
 * A frase que explica por que o mercado está em destaque.
 *
 * TRÊS CORREÇÕES DA AUDITORIA MORAM AQUI:
 *
 * MKT-08 — a mesma frase aparecia em 12 dos 20 cards: "Volume expressivo de $X
 * no Polymarket — interesse institucional ou de traders avançados." Todo mercado
 * acima de um milhão caía nessa saída, então ela não distinguia nada. Doze
 * frases idênticas ensinam o usuário a pular a leitura, e a partir daí ele
 * também pula a frase que teria algo a dizer. Agora, quando não há nada
 * específico, devolvemos VAZIO e o card não desenha a linha.
 *
 * MKT-06 — "prob. subiu 24% na semana" convivia com "+3pp 7d" no mesmo card.
 * Diferença entre duas probabilidades é PONTO PERCENTUAL. Numa plataforma que
 * ensina calibração, confundir pp com variação relativa é errar exatamente a
 * coisa que ela existe para corrigir.
 *
 * MKT-02 — "mercado dividido (53% SIM)" era escrito também para mercados de
 * múltiplos desfechos, onde não existe SIM: a decisão do Fed tem três resultados
 * possíveis e o US Open tem dezenas. Agora há um texto para cada tipo.
 */
export function whyTrendingMarket(item: {
  volume: number; volume24h?: number; liquidity?: number;
  yesProb: number; prevYesProb?: number; weekPriceChange?: number;
  source: Source;
  /** Mercado de múltiplos desfechos: não existe "SIM" para descrever. */
  multiDesfecho?: boolean;
}): string {
  const { volume, volume24h, liquidity, yesProb, prevYesProb, weekPriceChange, source, multiDesfecho } = item;
  const perto50 = Math.abs(yesProb - 0.5);
  const variacao = prevYesProb !== undefined ? yesProb - prevYesProb : undefined;
  const plataforma = source === "kalshi" ? "Kalshi" : "Polymarket";

  // O que é ESPECÍFICO deste mercado hoje. Se nada aqui casar, não há notícia.
  const especifico: string[] = [];
  if (volume24h && volume24h > 50_000)
    especifico.push(`${dolar(volume24h)} movimentados nas últimas 24 horas`);
  if (weekPriceChange !== undefined && Math.abs(weekPriceChange) > 0.03)
    especifico.push(`probabilidade ${weekPriceChange > 0 ? "subiu" : "caiu"} ${pp(Math.abs(weekPriceChange * 100)).replace("+", "")} na semana`);
  if (variacao !== undefined && Math.abs(variacao) > 0.02)
    especifico.push(`${variacao > 0 ? "alta" : "queda"} de ${pp(Math.abs(variacao * 100)).replace("+", "")} nas últimas horas`);

  const abertura = especifico.length > 0 ? especifico.join(", ") + ". " : "";

  // O líder de um mercado multi-desfecho não é "SIM": é o desfecho na frente.
  const nivel = multiDesfecho
    ? `líder com ${pct(yesProb * 100)}`
    : `${pct(yesProb * 100)} para SIM`;

  if (volume > 1_000_000 && perto50 < 0.1)
    return `${abertura}${dolar(volume)} negociados no ${plataforma} com o resultado em aberto (${nivel}) — dinheiro informado dos dois lados.`;
  if (yesProb > 0.80 || yesProb < 0.20)
    return `${abertura}Consenso forte no ${plataforma} (${nivel}) — o lado minoritário só tem valor se você enxergou um risco que o mercado ignorou.`;
  if (perto50 < 0.12)
    return `${abertura}Mercado equilibrado no ${plataforma} (${nivel}) — é onde a informação de qualidade vale mais.`;

  // Chegou aqui: só há volume, que já aparece no próprio card, ao lado. Repetir
  // em prosa não acrescenta — e era isso que produzia as doze frases iguais.
  // Melhor um card limpo do que uma frase que ninguém precisa ler.
  return abertura.trim();
}

function bestBetNoteReddit(post: RedditPost): string {
  const age = hoursAgo(post.created_utc);
  if (post.num_comments === undefined && age >= 6)
    return "Sem a contagem de engajamento não dá para medir quanta atenção o tema teve. "
      + "Use como ponto de partida de pesquisa e confirme no mercado, que tem preço e volume reais.";
  if (age < 6)
    return "Evento recente — as odds nas casas esportivas podem não ter ajustado ao volume de informação que a comunidade já tem. Este é o momento de maior edge potencial. Pesquise antes que o mercado precifique completamente.";
  if ((post.num_comments ?? 0) > 300)
    return "Alta discussão ativa — leia os comentários mais votados para capturar análises de apostadores experientes. Comentários com muitos upvotes geralmente contêm informação não precificada.";
  return "Evento com engajamento consolidado — as odds já refletem o consenso público. Para ter edge, procure ângulos específicos (desfalques, clima, histórico recente) que a maioria ainda não precificou.";
}

export function bestBetNoteMarket(yesProb: number, vol: number, source: Source): string {
  const platform = source === "kalshi" ? "Kalshi" : "Polymarket";
  if (yesProb > 0.80)
    return `Com ${Math.round(yesProb * 100)}% de probabilidade, o ${platform} precificou quase certeza (odds ${formatOdds(yesProb)}). O lado NÃO paga ${formatOdds(1 - yesProb)} — verifique se há risco sistêmico ignorado.`;
  if (yesProb < 0.20)
    return `${platform} precificou baixa probabilidade (${Math.round(yesProb * 100)}% SIM, odds ${formatOdds(yesProb)}). Investigue se há catalisadores recentes que justifiquem revisão ao alça.`;
  if (Math.abs(yesProb - 0.5) < 0.08)
    return `Resultado genuinamente incerto no ${platform} — use análises fundamentais e aplique Kelly conservador (¼ Kelly). Mercados tão equilibrados raramente têm edge claro.`;
  return `Volume de ${formatVolume(vol)} indica mercado maduro no ${platform}. Busque divergência com casas esportivas — a diferença entre probabilidades implícitas é onde o edge costuma aparecer.`;
}

// ─── Builders ──────────────────────────────────────────────────────────────────

export function buildRedditItem(post: RedditPost): TrendingItem {
  const age = hoursAgo(post.created_utc);
  // Sem votos, a única ordenação honesta é por RECÊNCIA. E "viral" exige medir
  // engajamento: sem número, o selo não pode ser afirmado.
  const temMetrica = post.score !== undefined && post.num_comments !== undefined;
  const rawScore = temMetrica
    ? post.score! + post.num_comments! * 3 - age * 5
    : Math.max(0, 100 - age * 4);
  const normalized = Math.min(100, Math.max(0, temMetrica ? rawScore / 20 : rawScore / 5));
  const badge: DynamicBadge | undefined =
    temMetrica && age < 3 && post.score! > 300 ? "viral" :
    age < 6 ? "nova" : undefined;
  return {
    id: `reddit-${post.permalink.replace(/\//g, "-").replace(/^-|-$/g, "")}`,
    title: post.title,
    source: "reddit",
    subreddit: post.subreddit,
    score: normalized,
    comments: post.num_comments,
    upvotes: post.score,
    externalUrl: `https://reddit.com${post.permalink}`,
    whyTrending: whyTrendingReddit(post),
    bestBetNote: bestBetNoteReddit(post),
    sentiment: analyzeSentiment(post.title + " " + (post.selftext || "")),
    ageHours: age,
    normalizedCategory: normalizeCategory(undefined, "reddit", post.subreddit),
    badge,
  };
}

export function buildPolyItem(bet: PolyBet): TrendingItem | null {
  if (!bet.question) return null;

  let allPrices: number[] = [];
  let allLabels: string[] = [];
  if (bet.outcomePrices) {
    try { allPrices = (JSON.parse(bet.outcomePrices) as string[]).map(parseFloat); } catch { /* skip */ }
  }
  if (bet.outcomes) {
    try { allLabels = JSON.parse(bet.outcomes) as string[]; } catch { /* skip */ }
  }

  let yesProb = bet.yesProb ?? allPrices[0] ?? 0.5;
  if (yesProb > 1) yesProb = yesProb / 100; // NaN > 1 é false → cai no clampProb
  yesProb = clampProb(yesProb);

  const parsedOutcomes: { label: string; prob: number }[] | undefined =
    allLabels.length > 2 && allPrices.length >= allLabels.length
      ? allLabels
          .map((label, i) => ({ label, prob: Math.max(0, allPrices[i] ?? 0) }))
          .filter((o) => o.prob > 0.005)
          .sort((a, b) => b.prob - a.prob)
      : undefined;

  const vol = toNum(bet.volume);
  const vol24h = bet.volume24h !== undefined ? toNum(bet.volume24h) : undefined;
  const liq = bet.liquidity !== undefined ? toNum(bet.liquidity) : undefined;
  const weekChg = bet.weekPriceChange !== undefined ? toNum(bet.weekPriceChange) : undefined;
  // Link canônico: prefere o do servidor; senão SÓ /event/{eventSlug} (market.slug e
  // id numérico dão 404 no Polymarket — era a origem dos "mercados falsos").
  const externalUrl = bet.externalUrl ?? (bet.eventSlug ? `https://polymarket.com/pt/event/${bet.eventSlug}` : "");

  const badge: DynamicBadge | undefined =
    isClosingSoon(bet.closeTime ?? bet.endDate) ? "encerrando" :
    (weekChg !== undefined && Math.abs(weekChg) > 0.07) ? "em-alta" :
    (vol24h !== undefined && vol > 0 && vol24h / vol > 0.2) ? "em-alta" : undefined;

  const displayTitle =
    bet.eventTitle && bet.eventTitle.length > 10 && bet.eventTitle !== bet.question
      ? bet.eventTitle
      : bet.question;

  return {
    id: `poly-${bet.id}`,
    title: displayTitle,
    source: "polymarket",
    score: Math.min(100, (vol / 10_000) + ((liq ?? 0) / 5_000)),
    volume: vol, volume24h: vol24h, liquidity: liq, weekPriceChange: weekChg,
    yesProb, prevYesProb: bet.prevYesProb,
    parsedOutcomes,
    clobTokenIds: bet.clobTokenIds,
    externalUrl,
    whyTrending: whyTrendingMarket({ volume: vol, volume24h: vol24h, liquidity: liq, yesProb, prevYesProb: bet.prevYesProb, weekPriceChange: weekChg, source: "polymarket", multiDesfecho: !!parsedOutcomes }),
    bestBetNote: bestBetNoteMarket(yesProb, vol, "polymarket"),
    sentiment: analyzeSentiment(displayTitle),
    ageHours: 0,
    category: bet.category,
    normalizedCategory: normalizeCategory(bet.category, "polymarket"),
    badge,
    endDate: bet.endDate,
  };
}

export function buildKalshiItem(m: KalshiMarket): TrendingItem | null {
  if (!m.title) return null;
  const yesDecimal = clampProb((m.yesProb ?? 50) / 100);
  const prevDecimal = m.prevYesProb !== undefined ? clampProb(m.prevYesProb / 100) : undefined;

  const badge: DynamicBadge | undefined =
    isClosingSoon(m.closeTime) ? "encerrando" :
    (m.volume24h !== undefined && m.volume > 0 && m.volume24h / m.volume > 0.15) ? "em-alta" : undefined;
  return {
    id: `kalshi-${m.ticker}`,
    title: m.title,
    source: "kalshi",
    score: Math.min(100, (m.volume / 8_000) + ((m.liquidity ?? 0) / 4_000)),
    volume: m.volume, volume24h: m.volume24h, liquidity: m.liquidity,
    openInterest: m.openInterest,
    yesProb: yesDecimal,
    prevYesProb: prevDecimal,
    parsedOutcomes: m.outcomes,
    externalUrl: m.externalUrl ?? `https://kalshi.com/markets/${m.seriesTicker.toLowerCase()}/${m.eventTicker.toLowerCase()}`,
    whyTrending: whyTrendingMarket({ volume: m.volume, volume24h: m.volume24h, liquidity: m.liquidity, yesProb: yesDecimal, prevYesProb: prevDecimal, source: "kalshi", multiDesfecho: !!m.outcomes }),
    bestBetNote: bestBetNoteMarket(yesDecimal, m.volume, "kalshi"),
    sentiment: analyzeSentiment(m.title),
    ageHours: 0,
    category: m.category,
    // Sem categoria, classifica pelo TÍTULO. Os mercados de curto prazo do Kalshi
    // vêm da rota `/markets`, que não devolve categoria (só `/events` devolve) —
    // sem esse recurso, todo jogo da semana cairia em "Outros" e ficaria invisível
    // no filtro. O título costuma dizer ("...college football game?"), e ler o
    // título é honesto; inventar categoria no servidor não seria.
    normalizedCategory: normalizeCategory(m.category ?? m.title, "kalshi"),
    badge,
  };
}

export function buildManifoldItem(m: ManifoldMarket): TrendingItem | null {
  // typeof NaN === "number", então checa isFinite explicitamente — não inventa 0.5
  if (!m.question || typeof m.probability !== "number" || !isFinite(m.probability)) return null;
  const yesProb = clampProb(m.probability);
  const vol = m.volume ?? 0;
  const ageHours = m.createdTime ? hoursAgo(m.createdTime / 1000) : 0;
  const category = (m.groupSlugs ?? []).join(" ");
  return {
    id: `manifold-${m.id}`,
    title: m.question,
    source: "manifold",
    score: Math.min(100, (vol / 500) + (yesProb > 0.4 && yesProb < 0.6 ? 20 : 0)),
    volume: vol,
    yesProb,
    externalUrl: m.url,
    whyTrending: `${dolar(vol)} no Manifold, plataforma de previsões abertas — ${pct(yesProb * 100)} para SIM. O Manifold usa dinheiro fictício: o preço reflete opinião, não dinheiro em risco.`,
    bestBetNote: bestBetNoteMarket(yesProb, vol, "manifold" as Source),
    sentiment: analyzeSentiment(m.question),
    ageHours,
    category,
    normalizedCategory: normalizeCategory(category, "manifold"),
    badge: ageHours < 24 ? "nova" : undefined,
  };
}

// ─── Data fetching ────────────────────────────────────────────────────────────

export const REDDIT_SUBS = ["sportsbook", "futebol", "soccer", "PredictionMarkets", "geopolitics", "wallstreetbets", "investing"];

export async function fetchRedditSub(sub: string): Promise<TrendingItem[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const res = await fetch(`/api/reddit/${sub}?limit=25`, { signal: controller.signal });
    if (!res.ok) return [];
    const json = await res.json() as { posts: RedditPost[] };
    return (json.posts ?? [])
      // ⚠️ Era `p.score > 10`. Com o feed RSS o score não existe, e a comparação
      // `undefined > 10` é falsa: o filtro descartaria TODOS os posts em silêncio.
      .filter((p) => (p.score === undefined || p.score > 10) && !p.title.toLowerCase().includes("[meta]"))
      .map(buildRedditItem);
  } catch { return []; } finally { clearTimeout(timer); }
}

export async function fetchPolymarketSports(): Promise<TrendingItem[]> {
  try {
    const markets = await getMarkets<PolyBet>("polymarket");
    return markets
      .filter((m) => toNum(m.volume) > 500)
      .map(buildPolyItem)
      .filter((x): x is TrendingItem => x !== null)
      .slice(0, 150);
  } catch { return []; }
}

export async function fetchManifold(): Promise<TrendingItem[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch("/api/manifold/markets?limit=60", { signal: controller.signal });
    if (!res.ok) return [];
    const json = await res.json() as { markets: ManifoldMarket[] };
    return (json.markets ?? [])
      .filter((m) => m.volume > 50)
      .map(buildManifoldItem)
      .filter((x): x is TrendingItem => x !== null)
      .slice(0, 20);
  } catch { return []; } finally { clearTimeout(timer); }
}

export async function fetchKalshi(): Promise<TrendingItem[]> {
  try {
    const markets = await getMarkets<KalshiMarket>("kalshi");
    return markets
      .filter((m) => m.volume > 100)
      .map(buildKalshiItem)
      .filter((x): x is TrendingItem => x !== null)
      .slice(0, 150);
  } catch { return []; }
}

/**
 * Intercala as fontes para a visão padrão mostrar a mistura que ela promete.
 *
 * O QUE ISTO CONSERTA (MKT-05). A auditoria mediu: `/api/kalshi/markets` devolve
 * 150 itens (74 KB) e `/api/manifold/markets` 36 (33 KB) a cada carregamento, e
 * NADA disso entrava na visão "Todos" — 20 de 20 cards eram Polymarket, embaixo
 * de um subtítulo que diz "Reddit · Polymarket · Kalshi". Pagava-se a banda sem
 * entregar o conteúdo.
 *
 * A causa não era filtro: era desempate. As três fontes têm fórmulas de `score`
 * que TETAM em 100, e mercado grande de qualquer bolsa chega lá. Com dezenas de
 * empates em 100, quem decide é a ordem do array — e `sort` em JavaScript é
 * ESTÁVEL, então a ordem de concatenação (`[...poly, ...kalshi, ...manifold]`)
 * virava a ordem da tela. Uma decisão de produto tomada por acidente numa linha
 * de concatenação.
 *
 * A régua aqui: dentro de cada fonte a ordem de `score` manda (é o que faz o
 * mercado relevante subir); ENTRE as fontes, rodízio. Quem tem menos itens
 * simplesmente sai do rodízio quando acaba, sem deixar buraco.
 */
export function intercalarPorFonte(itens: TrendingItem[]): TrendingItem[] {
  const porFonte = new Map<Source, TrendingItem[]>();
  for (const it of itens) {
    if (!porFonte.has(it.source)) porFonte.set(it.source, []);
    porFonte.get(it.source)!.push(it);
  }

  // Uma fonte só (ou nenhuma): não há o que intercalar.
  if (porFonte.size <= 1) return itens;

  // Fonte com mais itens começa o rodízio — assim a lista não abre com a fonte
  // que tem três mercados e some.
  const filas = Array.from(porFonte.values()).sort((a, b) => b.length - a.length);

  const saida: TrendingItem[] = [];
  let indice = 0;
  while (saida.length < itens.length) {
    let colocouAlgum = false;
    for (const fila of filas) {
      if (indice < fila.length) { saida.push(fila[indice]); colocouAlgum = true; }
    }
    // Todas as filas acabaram — sai em vez de girar para sempre.
    if (!colocouAlgum) break;
    indice++;
  }
  return saida;
}
