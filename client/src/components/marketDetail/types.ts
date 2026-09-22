/**
 * Tipos compartilhados da tela de detalhe de mercado (/apostas/:id).
 * Extraido de pages/MarketDetail.tsx.
 */
/** Um desfecho de mercado multi-resultado. `prob` vem em 0..1 com a precisão
 *  ORIGINAL da fonte — arredondar aqui é o que fazia a calculadora ler 19% onde
 *  o preço praticado era 18,5%, e anunciar edge onde não havia. */
export interface Desfecho {
  id: string;
  label: string;
  prob: number;
}

export interface MarketBasic {
  id: string;
  title: string;
  yesProb: number;
  volume?: number;
  volume24h?: number;
  liquidity?: number;
  weekPriceChange?: number;
  externalUrl: string;
  source: string;
  category?: string;
  endDate?: string;
  closed?: boolean;   // status real da fonte — fidelidade acima da endDate nominal
  active?: boolean;
  status?: string;    // Kalshi: "active" | "closed" | "settled" | "finalized" | …
  /**
   * Mercados multi-resultado (negRisk). `id` é o que LIQUIDA aquele desfecho:
   * o ticker no Kalshi, o id do MERCADO aninhado no Polymarket. Ele viaja junto
   * com o rótulo por uma razão prática: a previsão registrada guarda o id, não o
   * nome. Nome de time ou de candidato muda, e um histórico preso ao rótulo muda
   * de dono.
   *
   * ⚠️ No Polymarket isto já foi o token CLOB, e era o defeito DAD-03: token é
   * identificador de NEGOCIAÇÃO, não um mercado — não tem resultado oficial,
   * então `idDeLiquidacao` devolvia `null` e a previsão de desfecho nunca
   * resolvia. O token continua existindo, em `outcomeTokens`, para o gráfico.
   */
  parsedOutcomes?: Desfecho[];
  /** Os TOKENS dos mesmos desfechos, na MESMA ordem de `parsedOutcomes` — o
   *  gráfico de histórico consome nesta forma. Derivado da mesma lista, nunca
   *  montado à parte, senão o histórico troca de dono. */
  outcomeTokens?: string[];
  resolvedOutcome?: string; // desfecho vencedor quando o mercado já resolveu (SIM/NÃO/rótulo)
}

export interface CerebroArticleSnippet {
  id: string;
  title: string;
  source: string;
  category: string;
  url: string | null;
  published_at: string | null;
  summary: string | null;
}

export interface AiResult {
  analysis: string;
  /** O ASSUNTO explicado para quem nunca ouviu falar — vem antes da análise. */
  contexto?: string | null;
  /** O gatilho concreto de cada desfecho. Só existe com os DOIS lados. */
  cenarios?: { sim: string; nao: string } | null;
  keyFactors: string[];
  watchFor?: string;
  biasAlert?: string | null;
  probabilityAssessment?: "fair" | "underpriced" | "overpriced" | "uncertain";
  edgeSignal?: string | null;
  fairValue?: number | null;
  edgePp?: number | null;
  confidence?: "baixa" | "media" | "alta";
  referenceClass?: string | null;
  cerebroHits?: number;
  hasMomentum?: boolean;
  articles?: { title: string; description: string | null; url: string; source: string; publishedAt: string; urlToImage: string | null }[];
  cached: boolean;
}

export interface CommunityForecast {
  n_forecasters: number;
  median_prob: number;
  mean_prob: number;
  std_prob: number | null;
  min_prob: number;
  max_prob: number;
}
