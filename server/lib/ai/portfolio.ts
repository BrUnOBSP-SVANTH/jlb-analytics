import type { Request, Response } from "express";
import { callClaude } from "../anthropic.ts";
import { extractJson } from "../extractJson.ts";
import { log } from "../log.ts";
import { parseBody, portfolioBodySchema } from "./schemas.ts";
import { getCache, setCache } from "../cache.ts";

export async function portfolioHandler(req: Request, res: Response) {
  // Validação de shape na borda (fail-fast) — impede posição malformada de
  // quebrar em runtime (.slice/.toFixed de undefined viravam 500 genérico).
  const parsed = parseBody(portfolioBodySchema, req.body);
  if (!parsed.ok) return res.status(400).json({ error: "invalid_body", message: parsed.message });
  const { positions } = parsed.data;

  try {
    // Cache compartilhado (cache.ts) — expiry-on-read, sem o vazamento do Map próprio.
    const cacheKey = `portfolio:${positions.map(p => `${p.title.slice(0, 20)}${Math.round(p.entryProb * 100)}`).join("|")}`;
    const cached = getCache<object>(cacheKey);
    if (cached) { res.locals.aiCacheHit = true; return res.json({ ...cached, cached: true }); }

    const positionsList = positions.map(p =>
      `- "${p.title.slice(0, 60)}": ${p.position.toUpperCase()} @ ${Math.round(p.entryProb * 100)}% entrada, atual ${Math.round((p.currentProb ?? p.entryProb) * 100)}%, USD ${p.betSize.toFixed(0)}, P&L: ${p.pnl != null ? (p.pnl >= 0 ? "+" : "") + p.pnl.toFixed(2) : "N/A"}`
    ).join("\n");

    const prompt = `Você é um analista educacional de mercados preditivos (Polymarket/Kalshi). Analise este portfólio simulado de forma educacional. NÃO é recomendação financeira.

Posições:
${positionsList}

Responda em JSON com exatamente estes campos:
{
  "analysis": "parágrafo resumindo saúde geral do portfólio",
  "risks": ["risco 1", "risco 2", "risco 3"],
  "suggestions": ["sugestão 1", "sugestão 2", "sugestão 3"]
}`;

    const raw = await callClaude({
      model: "claude-haiku-4-5-20251001",
      maxTokens: 600,
      messages: [{ role: "user", content: prompt }],
      timeoutMs: 20_000,
    });

    interface ParsedPortfolioAnalysis { analysis?: string; risks?: string[]; suggestions?: string[] }
    let parsed: ParsedPortfolioAnalysis;
    try {
      parsed = extractJson(raw) as ParsedPortfolioAnalysis;
    } catch {
      parsed = { analysis: raw, risks: [], suggestions: [] };
    }

    const result = {
      analysis: parsed.analysis ?? "",
      risks: parsed.risks ?? [],
      suggestions: parsed.suggestions ?? [],
    };

    setCache(cacheKey, result, 1800); // 30 min
    res.json({ ...result, cached: false });
  } catch (err) {
    log.error("[portfolio-analysis]", err);
    res.status(500).json({ error: "Análise indisponível" });
  }
}
