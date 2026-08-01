import type { Request, Response } from "express";
import { getCache, setCache, isRateLimited } from "../cache.ts";
import { parsePolyPrices } from "../aiForecasts.ts";
import { callClaude } from "../anthropic.ts";
import { extractJson } from "../extractJson.ts";
import { clampFairValue } from "./guardrails.ts";
import { log } from "../log.ts";

export async function crossrefHandler(req: Request, res: Response) {
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: "ANTHROPIC_API_KEY não configurada." });

  const ip = req.ip ?? "unknown";
  if (isRateLimited(`article-crossref:${ip}`, 6, 60_000)) {
    return res.status(429).json({ error: "rate_limited", message: "Muitas análises. Aguarde um momento." });
  }

  interface CrossRefRequest { title: string; description?: string }
  const { title, description = "" } = req.body as CrossRefRequest;
  if (!title?.trim()) return res.status(400).json({ error: "title required" });

  const cacheKey = `article-crossref:${title.slice(0, 80)}`;
  const cached = getCache<object>(cacheKey);
  if (cached) return res.json({ ...cached, cached: true });

  // Busca mercados do cache (populados pelas rotas /polymarket/markets e /kalshi/markets)
  let polyMarkets = getCache<Array<{ id: string; question: string; outcomePrices?: string; category?: string; volume?: number; eventSlug?: string; slug?: string }>>("polymarket:markets:active") ?? [];
  const kalshiMarkets = getCache<Array<{ ticker: string; eventTicker: string; seriesTicker: string; title: string; yesProb: number; category?: string }>>("kalshi:markets") ?? [];

  // Cache frio (ninguém abriu /apostas ainda) → aquece via a própria rota,
  // senão o cruzamento devolvia sempre lista vazia com cara de "sem relação".
  if (polyMarkets.length === 0 && kalshiMarkets.length === 0) {
    try {
      const port = process.env.PORT ?? "3001";
      const r = await fetch(`http://localhost:${port}/api/polymarket/markets?limit=40`, { signal: AbortSignal.timeout(10_000) });
      if (r.ok) {
        const data = await r.json() as { markets?: typeof polyMarkets };
        polyMarkets = data.markets ?? [];
      }
    } catch { /* segue com o que tiver */ }
  }

  // Monta lista compacta de mercados para o Claude (máx 60 mercados)
  interface MarketEntry { idx: number; source: "Polymarket" | "Kalshi"; title: string; prob: number; id: string }
  const allMarkets: MarketEntry[] = [];

  for (const m of polyMarkets.slice(0, 40)) {
    const prices = parsePolyPrices(m.outcomePrices);
    const prob = prices[0] !== undefined ? Math.round(prices[0] * 100) : 50;
    allMarkets.push({ idx: allMarkets.length, source: "Polymarket", title: m.question, prob, id: m.id });
  }
  for (const m of kalshiMarkets.slice(0, 20)) {
    allMarkets.push({ idx: allMarkets.length, source: "Kalshi", title: m.title, prob: Math.round(m.yesProb), id: m.ticker });
  }

  const marketsList = allMarkets
    .map((m) => `[${m.idx}] (${m.source}) "${m.title}" — mercado: ${m.prob}%`)
    .join("\n");

  const prompt = `Você é um analista honesto de mercados preditivos da JLB Analytics.
Analise o artigo abaixo e identifique até 4 mercados preditivos diretamente relacionados.
Para cada mercado relacionado, dê sua estimativa HONESTA da probabilidade real — você PODE e DEVE discordar do preço do mercado se o artigo sugerir isso.
Seja direto e sincero: se o mercado está superestimado ou subestimado, diga.
CALIBRAÇÃO: o desvio deve ser proporcional à força da evidência DO ARTIGO — desvios acima de 15pp exigem fato concreto citado; nunca desvie mais de 20pp do preço.

ARTIGO:
Título: "${title}"
Descrição: "${description || "sem descrição adicional"}"

DATA: ${new Date().toLocaleDateString("pt-BR")}

MERCADOS DISPONÍVEIS:
${marketsList || "Nenhum mercado carregado no momento."}

Retorne JSON exato (sem markdown):
{
  "relatedMarkets": [
    {
      "idx": 0,
      "jlbProb": 72,
      "verdict": "higher",
      "reasoning": "1-2 frases diretas explicando por que a probabilidade real é essa",
      "confidence": "medium"
    }
  ],
  "overallContext": "1-2 frases conectando o artigo ao cenário de apostas"
}

Onde:
- idx: índice do mercado na lista acima
- jlbProb: sua estimativa honesta (5-95)
- verdict: "higher" se jlbProb > mercado+3pp, "lower" se jlbProb < mercado-3pp, "aligned" caso contrário
- confidence: "low" | "medium" | "high"
- relatedMarkets: lista vazia [] se nenhum mercado for relevante`;

  try {
    const raw = await callClaude({
      model: "claude-haiku-4-5-20251001",
      maxTokens: 800,
      messages: [{ role: "user", content: prompt }],
      timeoutMs: 20_000,
    });

    interface CrossRefParsed {
      relatedMarkets?: Array<{ idx: number; jlbProb: number; verdict: string; reasoning: string; confidence: string }>;
      overallContext?: string;
    }
    const parsed = extractJson(raw) as CrossRefParsed;

    const relatedRaw = parsed.relatedMarkets ?? [];
    const relatedMarkets = relatedRaw
      .filter((r) => r.idx >= 0 && r.idx < allMarkets.length)
      .map((r) => {
        const m = allMarkets[r.idx];
        // Guardrail de calibração no código (como no fair value): ±20pp do mercado
        const jlbProb = clampFairValue(Math.round(r.jlbProb), m.prob, 20);
        return {
          source: m.source,
          marketTitle: m.title,
          marketProb: m.prob,
          id: m.id,
          jlbProb,
          // Verdict derivado dos números finais — o do modelo às vezes contradiz
          // a própria estimativa (e o clamp pode movê-la)
          verdict: jlbProb > m.prob + 3 ? "higher" : jlbProb < m.prob - 3 ? "lower" : "aligned",
          reasoning: r.reasoning ?? "",
          confidence: r.confidence ?? "medium",
        };
      });

    const result = {
      relatedMarkets,
      overallContext: parsed.overallContext ?? "",
      marketsAvailable: allMarkets.length,
    };
    setCache(cacheKey, result, 1800);
    res.json({ ...result, cached: false });
  } catch (err) {
    log.error("[article-crossref] error:", err);
    res.status(500).json({ error: "crossref_failed", message: err instanceof Error ? err.message : "unknown" });
  }
}
