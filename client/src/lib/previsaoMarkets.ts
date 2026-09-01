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
  source: "polymarket" | "kalshi" | "manifold";
  isBR: boolean;
}

// Termos que sinalizam relevância para o Brasil (macro, política, esporte, mercado).
const BR_TERMS = [
  "brasil", "brazil", "brazilian", "selic", "ipca", "lula", "bolsonaro",
  "petrobras", "petr4", "ibovespa", "copom", "pix", "brasileir", "flamengo",
  "corinthians", "palmeiras", "são paulo", "sao paulo", "cvm", "congresso",
  "stf", "datafolha", "eleic", "eleiç", "dólar", "dolar", "vale3", "itub",
  "neymar", "vini jr", "copa do mundo", "libertadores", "senado", "supremo",
  "haddad", "tarcisio", "tarcísio", "nubank", "itaú", "itau", "câmbio", "cambio",
];

/**
 * Radicais que PRECISAM casar por pedaço, porque existem em várias flexões
 * ("brasileir" → brasileiro/brasileira/brasileirão; "eleic" → eleição/eleições).
 */
const BR_RADICAIS = ["brasileir", "eleic", "eleiç"];

/**
 * Endurecido em 01/09 por prevenção, não por defeito observado: nos 572 títulos
 * reais de hoje não havia nenhum falso positivo. Mas casar por substring já nos
 * mordeu três vezes (Cérebro, categorias, "epl" dentro de "deployer") e aqui a
 * armadilha está armada: "pix" cabe dentro de "Pixar" e "pixel" — e mercado de
 * Oscar/cinema é justamente o que o Polymarket tem de sobra. Bastaria um mercado
 * da Pixar para ele ser rotulado como relevante para o Brasil.
 */
export function isBRtext(t: string): boolean {
  const s = t.toLowerCase();
  if (BR_RADICAIS.some((k) => s.includes(k))) return true;
  return BR_TERMS.some((k) =>
    BR_RADICAIS.includes(k) ? false : new RegExp(`(?<![a-z0-9])${k}(?![a-z0-9])`).test(s));
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

interface ManifoldRaw { id: string; question?: string; probability?: number; volume?: number }

/** Manifold (play-money, MUITA variedade) — só p/ os CHIPS de sugestão, não p/ os
 *  relacionados/âncora, que linkam ao /apostas e não têm detalhe de Manifold. */
async function fetchManifoldHot(): Promise<HotMarket[]> {
  try {
    const r = await fetch("/api/manifold/markets?limit=60");
    if (!r.ok) return [];
    const j = (await r.json()) as { markets?: ManifoldRaw[] };
    return (j.markets ?? []).map((m) => ({
      id: `manifold-${m.id}`,
      title: m.question ?? "",
      prob: null, // play-money: não exibimos a prob como se fosse sinal de mercado real
      volume: num(m.volume),
      source: "manifold" as const,
      isBR: isBRtext(m.question ?? ""),
    }));
  } catch {
    return [];
  }
}

/** Busca os mercados ao vivo de 3 fontes e intercala real-money com Manifold (2:1)
 *  p/ MAIS variedade de opções "em alta". Dedup por título. */
export async function fetchHotMarkets(): Promise<HotMarket[]> {
  const [{ polymarket, kalshi }, manifold] = await Promise.all([
    getAllMarkets<PolyBet, KalshiMarket>(),
    fetchManifoldHot(),
  ]);

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

  // Real-money (Poly + Kalshi) por volume; Manifold já vem por relevância da API.
  const realMoney = [...poly, ...kal].sort((a, b) => b.volume - a.volume);

  // Intercala 2 real-money : 1 Manifold — garante variedade sem afogar em play-money
  // (o volume do Manifold é em outra escala e afundaria num sort por volume).
  const combined: HotMarket[] = [];
  let ri = 0;
  let mi = 0;
  while (ri < realMoney.length || mi < manifold.length) {
    if (realMoney[ri]) combined.push(realMoney[ri++]);
    if (realMoney[ri]) combined.push(realMoney[ri++]);
    if (manifold[mi]) combined.push(manifold[mi++]);
  }

  // Dedup por título (eventos repetem entre/dentro das fontes).
  const seen = new Set<string>();
  return combined.filter((m) => {
    const k = m.title.toLowerCase().slice(0, 50);
    if (m.title.length <= 8 || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
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
    .filter((m) => m.source !== "manifold") // relacionados/âncora linkam pro /apostas — sem Manifold (play-money, sem detalhe)
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
