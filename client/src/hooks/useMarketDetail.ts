/**
 * useMarketDetail — toda a camada de DADOS da tela de detalhe de mercado.
 *
 * Extraído de pages/MarketDetail.tsx (que passou de 722 → ~460 linhas). A escolha
 * de mover os hooks/efeitos em vez de recortar o JSX é deliberada: o risco de
 * regressão numa tela central mora na renderização, e aqui ela fica intacta —
 * o componente só passou a ler daqui.
 *
 * Cuida de: identificar a fonte pelo id, carregar o mercado (com fallback para
 * mercados já resolvidos), histórico de snapshots, artigos do Cérebro, consenso
 * da comunidade, track record da IA e a chamada de análise por IA.
 */
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { getMarkets } from "@/lib/marketsCache";
import { maybeAuthGate } from "@/lib/upgrade";
import { useSEO } from "@/hooks/useSEO";
import type { MarketBasic, CerebroArticleSnippet, AiResult, CommunityForecast } from "@/components/marketDetail/types";
import { apiFetch } from "@/lib/api";

export function useMarketDetail(marketId: string) {
  const source = marketId.startsWith("kalshi-") ? "kalshi"
    : marketId.startsWith("manifold-") ? "manifold"
    : "polymarket";
  const rawId = marketId.replace(/^(poly-|kalshi-|manifold-)/, "");

  const [market, setMarket] = useState<MarketBasic | null>(null);
  const [snapshotRows, setSnapshotRows] = useState<{ t: number; p: number }[]>([]);
  const [aiAnalysis, setAiAnalysis] = useState<AiResult | null>(null);
  const [loadingMarket, setLoadingMarket] = useState(true);
  const [loadingAi, setLoadingAi] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [communityForecast, setCommunityForecast] = useState<CommunityForecast | null>(null);
  const [cerebroArticles, setCerebroArticles] = useState<CerebroArticleSnippet[]>([]);
  const [trackRecord, setTrackRecord] = useState<{ skillVsMarket: number | null; resolvedCount: number } | null>(null);

  useSEO(
    market?.title ?? "Detalhe do Mercado",
    "Probabilidades ao vivo, histórico de preços, consenso da comunidade e análise quantitativa deste mercado preditivo.",
  );

  // Track record da IA — usado para ponderar o voto da IA no consenso
  useEffect(() => {
    fetch("/api/ai/track-record")
      .then((r) => r.ok ? r.json() as Promise<{ available: boolean; skillVsMarket: number | null; resolvedCount: number }> : null)
      .then((d) => { if (d?.available) setTrackRecord({ skillVsMarket: d.skillVsMarket, resolvedCount: d.resolvedCount }); })
      .catch(() => {});
  }, []);

  // ── Fetch market data ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!rawId) return;
    setLoadingMarket(true);

    async function loadMarket() {
      try {
        if (source === "kalshi") {
          const data = await getMarkets<{
            ticker: string; title: string; yesProb: number;
            volume?: number; volume24h?: number; openInterest?: number;
            closeTime?: string; category?: string; status?: string;
            seriesTicker?: string; eventTicker?: string; externalUrl?: string;
            outcomes?: { label: string; prob: number }[];
          }>("kalshi");
          // ⚠️ SÓ igualdade exata. Havia um `|| m.ticker.includes(rawId)` aqui, e o
          // `.find` avalia o OU por ELEMENTO: bastava um ticker que CONTIVESSE o id
          // aparecer antes do idêntico para vencer a disputa, e a tela mostrava
          // outro mercado. Provado nos 300 tickers ao vivo em 01/09:
          //   pedir "KXBOND-30-JAC"  devolvia "KXBOND-30-JACK" (outro candidato)
          //   pedir "…EMAR-P5"       devolvia "…EMAR-P50" — a margem de 5% exibindo
          //                          os dados da de 50%: outro preço, outro mercado.
          // Sem correspondência exata o `else` abaixo busca o mercado único na API,
          // que é a fonte autoritativa (e ainda cobre os resolvidos). Um palpite por
          // substring não é fallback: é atalho para o dado errado.
          const found = data.find((m) => m.ticker === rawId);
          if (found) {
            setMarket({
              id: found.ticker,
              title: found.title,
              // Kalshi devolve yesProb em 0-100; o resto da tela espera decimal 0-1
              // (o *100 dava "2200%" no header/consenso/edge de todo mercado Kalshi).
              yesProb: found.yesProb / 100,
              volume: found.volume,
              volume24h: found.volume24h,
              liquidity: found.openInterest,
              externalUrl: found.externalUrl ?? "https://kalshi.com",
              source: "kalshi",
              category: found.category,
              status: found.status,
              parsedOutcomes: found.outcomes,
            });
          } else {
            // Fora da lista ao vivo — provável mercado resolvido. Busca o mercado único
            // (inclui resolvidos) para mostrá-lo como "Resolvido", não "não encontrado".
            const r = await fetch(`/api/kalshi/market/${encodeURIComponent(rawId)}`);
            if (r.ok) {
              const fb = await r.json() as { ticker: string; title: string; yesProb: number; volume?: number; volume24h?: number; openInterest?: number; category?: string; status?: string; resolvedOutcome?: string };
              setMarket({
                id: fb.ticker, title: fb.title, yesProb: fb.yesProb / 100,
                volume: fb.volume, volume24h: fb.volume24h, liquidity: fb.openInterest,
                externalUrl: "https://kalshi.com", source: "kalshi",
                category: fb.category, status: fb.status, resolvedOutcome: fb.resolvedOutcome,
              });
            }
          }
        } else {
          const data = await getMarkets<{
            id: string; question: string; eventTitle?: string; slug?: string; eventSlug?: string;
            externalUrl?: string; yesProb?: number;
            volume?: number | string; liquidity?: number | string;
            volume24h?: number | string; weekPriceChange?: number | string;
            outcomePrices?: string; outcomes?: string; category?: string; clobTokenIds?: string; endDate?: string;
            closed?: boolean; active?: boolean;
          }>("polymarket");
          const found = data.find((m) => m.id === rawId || m.slug === rawId);
          if (found) {
            const yesProb = found.yesProb ?? (() => {
              try {
                const prices = JSON.parse(found.outcomePrices ?? "[]") as string[];
                return prices[0] ? parseFloat(prices[0]) : 0.5;
              } catch { return 0.5; }
            })();
            const displayTitle =
              found.eventTitle && found.eventTitle.length > 10 && found.eventTitle !== found.question
                ? found.eventTitle
                : found.question;
            // Multi-resultado (negRisk): o servidor manda outcomes/outcomePrices já
            // agregados. >2 rótulos ⇒ mostramos o breakdown de desfechos, não SIM/NÃO.
            let parsedOutcomes: { label: string; prob: number }[] | undefined;
            try {
              const labels = JSON.parse(found.outcomes ?? "[]") as string[];
              const prices = (JSON.parse(found.outcomePrices ?? "[]") as string[]).map(Number);
              if (labels.length > 2 && prices.length >= labels.length) {
                parsedOutcomes = labels
                  .map((label, i) => ({ label, prob: prices[i] ?? 0 }))
                  .filter((o) => o.prob > 0.005)
                  .sort((a, b) => b.prob - a.prob);
              }
            } catch { /* segue binário */ }
            setMarket({
              id: found.id,
              title: displayTitle,
              yesProb,
              volume: found.volume !== undefined ? Number(found.volume) : undefined,
              volume24h: found.volume24h !== undefined ? Number(found.volume24h) : undefined,
              liquidity: found.liquidity !== undefined ? Number(found.liquidity) : undefined,
              weekPriceChange: found.weekPriceChange !== undefined ? Number(found.weekPriceChange) : undefined,
              externalUrl: found.externalUrl ?? (found.eventSlug ? `https://polymarket.com/pt/event/${found.eventSlug}` : "https://polymarket.com/pt"),
              source: "polymarket",
              category: found.category,
              endDate: found.endDate,
              closed: found.closed,
              active: found.active,
              parsedOutcomes,
            });
          } else {
            // Idem Kalshi: mercado provavelmente resolvido → busca o mercado único.
            const r = await fetch(`/api/polymarket/market/${encodeURIComponent(rawId)}`);
            if (r.ok) {
              const fb = await r.json() as { id: string; question?: string; outcomePrices?: string; volume?: number; volume24h?: number; liquidity?: number; weekPriceChange?: number; endDate?: string; category?: string; closed?: boolean; active?: boolean; resolvedOutcome?: string };
              const yp = (() => { try { const p = JSON.parse(fb.outcomePrices ?? "[]") as string[]; return p[0] ? parseFloat(p[0]) : 0.5; } catch { return 0.5; } })();
              setMarket({
                id: fb.id, title: fb.question ?? "Mercado", yesProb: yp,
                volume: fb.volume, volume24h: fb.volume24h, liquidity: fb.liquidity,
                weekPriceChange: fb.weekPriceChange,
                externalUrl: "https://polymarket.com/pt", source: "polymarket",
                category: fb.category, endDate: fb.endDate, closed: fb.closed, active: fb.active,
                resolvedOutcome: fb.resolvedOutcome,
              });
            }
          }
        }
      } catch {
        // market stays null — show not found state
      } finally {
        setLoadingMarket(false);
      }
    }

    void loadMarket();
  }, [rawId, source]);

  // ── Fetch snapshot history ────────────────────────────────────────────────────

  useEffect(() => {
    if (!rawId) return;
    fetch(`/api/snapshots/history/${source}/${encodeURIComponent(rawId)}?days=90`)
      .then((r) => r.ok ? r.json() as Promise<{ rows: { yes_prob: number; snapped_at: string }[] }> : null)
      .then((data) => {
        if (!data?.rows) return;
        const mapped = data.rows.map((r) => ({
          t: Math.floor(new Date(r.snapped_at).getTime() / 1000),
          p: r.yes_prob,
        }));
        if (mapped.length >= 4) setSnapshotRows(mapped);
      })
      .catch(() => {});
  }, [rawId, source]);

  // ── AI analysis ───────────────────────────────────────────────────────────────

  async function handleAnalyzeAi() {
    if (!market) return;
    if (aiAnalysis) { setAiAnalysis(null); return; }
    setLoadingAi(true);
    setAiError(null);
    try {
      const res = await apiFetch("/api/ai/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: market.title, yesProb: market.yesProb, source: market.source,
          marketId: `${source}-${rawId}`, category: market.category,
          // Alimentam a FICHA do mercado no servidor (relógio e liquidez) — é o
          // que garante análise com substância mesmo sem notícia casada.
          closeTime: market.endDate, volume: market.volume,
        }),
        signal: AbortSignal.timeout(50_000),
      });
      if (await maybeAuthGate(res)) { setLoadingAi(false); return; }
      if (res.status === 429) throw new Error("RATE_LIMIT");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as AiResult;
      setAiAnalysis(data);
    } catch (e) {
      const isTimeout = (e instanceof DOMException && e.name === "TimeoutError")
        || (e instanceof Error && /timed out|abort/i.test(e.message));
      const msg = e instanceof Error ? e.message : "Erro ao gerar análise";
      setAiError(msg === "RATE_LIMIT"
        ? "Limite de requisições atingido. Aguarde ~1 minuto e tente novamente."
        : isTimeout
        ? "A análise demorou mais que o esperado. Tente novamente."
        : msg);
    } finally {
      setLoadingAi(false);
    }
  }

  // ── Cerebro articles related to this market ──────────────────────────────────

  useEffect(() => {
    if (!market?.title) return;
    // Extract 2-3 keywords from market title for FTS search
    const keywords = market.title
      .replace(/[^a-zA-ZÀ-ú0-9 ]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .slice(0, 3)
      .join(" & ");
    if (!keywords) return;

    void supabase
      .from("cerebro_articles")
      .select("id, title, source, category, url, published_at, summary")
      .textSearch("fts", keywords, { config: "portuguese" })
      .eq("status", "active")
      .order("published_at", { ascending: false })
      .limit(3)
      .then(({ data }) => {
        if (data && data.length > 0) setCerebroArticles(data as CerebroArticleSnippet[]);
      });
  }, [market?.title]);

  // ── Community forecast ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!rawId) return;
    void supabase
      .from("market_community_forecast")
      .select("*")
      .eq("market_id", rawId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setCommunityForecast(data as CommunityForecast);
      });
  }, [rawId]);

  // ── Chart data ────────────────────────────────────────────────────────────────

  const chartData = snapshotRows.map((pt) => ({
    date: new Date(pt.t * 1000).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }),
    // yes_prob dos snapshots já é 0-100 (não 0-1) — o *100 dava "8720%" no eixo
    prob: Math.round(pt.p),
  }));

  const currentProb = market?.yesProb ?? 0;
  const probPct = Math.round(currentProb * 100);
  const probColor = probPct >= 60 ? "text-positive" : probPct >= 40 ? "text-primary" : "text-negative";
  // Cor do gráfico via token (adapta claro/escuro) e coerente com o herói — nada de hex fixo.
  const chartStroke = probPct >= 60 ? "var(--color-positive)" : probPct >= 40 ? "var(--color-primary)" : "var(--color-negative)";
  // Fidelidade: o status real da fonte (closed/active/status) vale mais que a endDate
  // nominal — um mercado que a Polymarket/Kalshi já resolveu nunca mostra "faltam Xh".
  const isResolved = !!market && (market.closed === true || market.active === false
    || (!!market.status && market.status !== "active"));

  return {
    source, rawId,
    market, snapshotRows, aiAnalysis, loadingMarket, loadingAi, aiError,
    communityForecast, cerebroArticles, trackRecord,
    handleAnalyzeAi,
    chartData, currentProb, probPct, probColor, chartStroke, isResolved,
  };
}
