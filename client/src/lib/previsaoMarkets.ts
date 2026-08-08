/**
 * previsaoMarkets — liga a Previsão Guiada aos mercados AO VIVO.
 * Alimenta (a) sugestões de perguntas "em alta agora" (mundo + Brasil) e
 * (b) mercados relacionados ao que o usuário pesquisou. Reaproveita o
 * marketsCache (mesma resposta já compartilhada com Apostas/Notícias) —
 * então as sugestões nunca ficam velhas: vêm dos mercados vivos.
 */
import { getAllMarkets } from "./marketsCache";
import type { PolyBet, KalshiMarket } from "./trending";

export interface HotMarket {
  id: string;          // rota do detalhe: poly-<id> | kalshi-<ticker>
  title: string;
  prob: number | null; // 0-100 quando disponível
  volume: number;
  source: "polymarket" | "kalshi";
  isBR: boolean;
}

// Termos que sinalizam relevância para o Brasil (macro, política, esporte, mercado).
const BR_TERMS = [
  "brasil", "brazil", "brazilian", "selic", "ipca", "lula", "bolsonaro",
  "petrobras", "petr4", "ibovespa", "copom", "pix", "brasileir", "flamengo",
  "corinthians", "palmeiras", "são paulo", "sao paulo", "cvm", "congresso",
  "stf", "datafolha", "eleic", "eleiç", "dólar", "dolar", "vale3", "itub",
];

function isBRtext(t: string): boolean {
  const s = t.toLowerCase();
  return BR_TERMS.some((k) => s.includes(k));
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function polyProb(m: PolyBet): number | null {
  if (typeof m.yesProb === "number") return Math.round(m.yesProb * 100);
  if (m.outcomePrices) {
    try {
      const arr = JSON.parse(m.outcomePrices) as string[];
      const p = parseFloat(arr?.[0]);
      if (Number.isFinite(p)) return Math.round(p * 100);
    } catch { /* ignore */ }
  }
  return null;
}

/** Busca os mercados ao vivo, normaliza e ordena por volume (proxy de "em alta"). */
export async function fetchHotMarkets(): Promise<HotMarket[]> {
  const { polymarket, kalshi } = await getAllMarkets<PolyBet, KalshiMarket>();

  const poly: HotMarket[] = polymarket
    .filter((m) => m.active && !m.closed)
    .map((m) => {
      const title = m.eventTitle && m.eventTitle.length > 10 && m.eventTitle !== m.question
        ? m.eventTitle
        : m.question ?? "";
      return { id: `poly-${m.id}`, title, prob: polyProb(m), volume: num(m.volume), source: "polymarket" as const, isBR: isBRtext(title) };
    });

  const kal: HotMarket[] = kalshi.map((m) => ({
    id: `kalshi-${m.ticker}`,
    title: m.title ?? "",
    prob: typeof m.yesProb === "number" ? Math.round(m.yesProb * 100) : null,
    volume: num(m.volume),
    source: "kalshi" as const,
    isBR: isBRtext(m.title ?? ""),
  }));

  // Dedup por título (eventos do Polymarket repetem) e ordena por volume.
  const seen = new Set<string>();
  return [...poly, ...kal]
    .filter((m) => {
      const k = m.title.toLowerCase().slice(0, 50);
      if (m.title.length <= 8 || seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => b.volume - a.volume);
}

// ── Match de mercados relacionados ao que o usuário pesquisou ──
const STOP = new Set([
  "que", "qual", "quais", "como", "para", "por", "com", "dos", "das", "nos", "nas",
  "até", "mais", "menos", "sobre", "proximos", "próximos", "meses", "anos", "dias",
  "probabilidade", "modelo", "vai", "sera", "será", "the", "and", "for", "will", "what",
]);

function tokens(s: string): Set<string> {
  return new Set(
    s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
      .filter((w) => w.length > 3 && !STOP.has(w)),
  );
}

/** Mercados ao vivo cujo título compartilha palavras-chave com a pergunta. */
export function relatedMarkets(query: string, markets: HotMarket[], n = 3): HotMarket[] {
  const q = tokens(query);
  if (q.size === 0) return [];
  return markets
    .map((m) => {
      const t = tokens(m.title);
      let score = 0;
      q.forEach((w) => { if (t.has(w)) score++; });
      return { m, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.m.volume - a.m.volume)
    .slice(0, n)
    .map((x) => x.m);
}
