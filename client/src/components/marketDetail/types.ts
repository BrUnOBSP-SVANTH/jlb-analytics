/**
 * Tipos compartilhados da tela de detalhe de mercado (/apostas/:id).
 * Extraido de pages/MarketDetail.tsx.
 */
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
  parsedOutcomes?: { label: string; prob: number }[]; // mercados multi-resultado (negRisk)
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
