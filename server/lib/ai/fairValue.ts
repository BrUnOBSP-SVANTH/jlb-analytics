import type { Request, Response } from "express";
import { getCache, setCache, isRateLimited } from "../cache.ts";
import { CATEGORY_BASE_RATES } from "../categoryRates.ts";
import { fetchBcbSerie } from "../bcb.ts";
import { fetchCerebroContext } from "../cerebro.ts";
import { getCalibrationMemo } from "../aiForecasts.ts";
import { callClaude } from "../anthropic.ts";
import { extractJson } from "../extractJson.ts";
import { clampFairValue, quantFairValue } from "./guardrails.ts";
import { recordClamp } from "./metrics.ts";
import { INJECTION_GUARD } from "./promptSafety.ts";
import { log } from "../log.ts";

export async function fairValueHandler(req: Request, res: Response) {
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: "ANTHROPIC_API_KEY não configurada." });

  const ip = req.ip ?? "unknown";
  if (isRateLimited(`fair-value:${ip}`, 10, 60_000)) {
    return res.status(429).json({ error: "rate_limited", message: "Muitas análises. Aguarde." });
  }

  interface FairValueRequest {
    title: string;
    marketProb: number;       // 0-100
    source: string;
    category?: string;
    volume24h?: number;
    weekPriceChange?: number; // delta em pp na última semana
    liquidity?: number;
  }
  const { title, marketProb, source, category = "other", volume24h, weekPriceChange, liquidity } = req.body as FairValueRequest;
  if (!title || marketProb === undefined) return res.status(400).json({ error: "title e marketProb são obrigatórios" });

  const cacheKey = `fair-value:${source}:${title.slice(0, 60)}:${Math.round(marketProb)}`;
  const cached = getCache<object>(cacheKey);
  if (cached) return res.json({ ...cached, cached: true });

  const catKey = (category ?? "other").toLowerCase().replace(/[^a-z]/g, "") || "other";
  const catInfo = CATEGORY_BASE_RATES[catKey] ?? CATEGORY_BASE_RATES["other"];

  // Cerebro em paralelo com BCB — o fair value era calculado às cegas (só base
  // rate + macro); contexto real é o que separa estimativa de chute calibrado.
  const [selic, ipca, cerebroSettled, memoSettled] = await Promise.allSettled([
    fetchBcbSerie(432), fetchBcbSerie(13522), fetchCerebroContext(title), getCalibrationMemo(),
  ]);
  const selicVal = selic.status === "fulfilled" ? selic.value : null;
  const ipcaVal  = ipca.status === "fulfilled"  ? ipca.value  : null;
  const cerebroCtx = cerebroSettled.status === "fulfilled" ? cerebroSettled.value.context : "";
  const calibMemo = memoSettled.status === "fulfilled" ? memoSettled.value : "";

  // Fair value quantitativo (pré-IA / fallback): base rate + mercado ponderados
  // por liquidez, com ajuste de momentum. Lógica pura e testada em guardrails.ts.
  const { clampedPreFV } = quantFairValue(marketProb, catInfo.baseRate, { liquidity, weekPriceChange });

  const prompt = `Você é um analista quantitativo calculando o fair value independente de um mercado preditivo.

MERCADO: "${title}"
FONTE: ${source} | CATEGORIA: ${category}
PROB. DO MERCADO: ${marketProb}%
BASE RATE DA CATEGORIA: ${catInfo.baseRate}% (${catInfo.note})
MOMENTUM (variação 7d): ${weekPriceChange !== undefined ? (weekPriceChange > 0 ? "+" : "") + weekPriceChange.toFixed(1) + "pp" : "desconhecido"}
LIQUIDEZ: ${liquidity !== undefined ? "$" + liquidity.toLocaleString() : "desconhecida"}
VOLUME 24h: ${volume24h !== undefined ? "$" + volume24h.toLocaleString() : "desconhecido"}
NOSSO PRÉ-CÁLCULO: ${clampedPreFV}%
MACRO BR: Selic ${selicVal ?? "~10.5"}% | IPCA ${ipcaVal ?? "~4.8"}%
DATA: ${new Date().toLocaleDateString("pt-BR")}

CONTEXTO DO CEREBRO (base de conhecimento curada própria):
${cerebroCtx || "— sem artigos relacionados encontrados —"}
${calibMemo ? `\n${calibMemo}\n` : ""}
REGRAS DE CALIBRAÇÃO (críticas — nosso Brier Score é medido publicamente):
- O preço de um mercado líquido já agrega a informação disponível. Desvie dele APENAS com evidência concreta no contexto acima, e proporcional à força da evidência.
- Sem evidência relevante: fique dentro de ±3pp do mercado e use signal "neutral".
- NUNCA desvie mais de 15pp do preço de mercado.

${INJECTION_GUARD}

Ajuste o fair value considerando o contexto real do mercado. Retorne JSON exato:
{"fairValue":65,"confidence":"medium","edge":5,"reasoning":"2-3 frases explicando a diferença entre o fair value e a prob do mercado","factors":["fator positivo","fator negativo"],"signal":"bullish|bearish|neutral","caveat":"limitação principal desta análise"}

Onde:
- fairValue: 5-95 (número inteiro)
- confidence: "low"|"medium"|"high" (baseado em liquidez e qualidade dos dados)
- edge: fairValue - marketProb (pode ser negativo)
- signal: "bullish" se fairValue > marketProb+3, "bearish" se fairValue < marketProb-3, "neutral" caso contrário`;

  try {
    const raw = await callClaude({
      model: "claude-haiku-4-5-20251001",
      maxTokens: 500,
      messages: [{ role: "user", content: prompt }],
      timeoutMs: 15_000,
      prefillJson: false,
    });

    interface FVParsed { fairValue?: number; confidence?: string; edge?: number; reasoning?: string; factors?: string[]; signal?: string; caveat?: string }
    const parsed = extractJson(raw) as FVParsed;

    // Clamp duplo: faixa 5-95 E ±15pp do mercado — guardrail de calibração no
    // código, não só no prompt (mercado líquido raramente erra por >15pp)
    const rawFV = Math.round(Number(parsed.fairValue ?? clampedPreFV));
    const fairValue = clampFairValue(rawFV, marketProb);
    const fvClamped = fairValue !== rawFV; // o guardrail moveu o valor?
    if (fvClamped) recordClamp();
    const result = {
      fairValue,
      confidence: parsed.confidence ?? "medium",
      edge: Number((fairValue - marketProb).toFixed(1)),
      signal: parsed.signal ?? (fairValue > marketProb + 3 ? "bullish" : fairValue < marketProb - 3 ? "bearish" : "neutral"),
      // Quando o clamp mordeu, o texto do modelo pode citar o valor BRUTO — anexa nota
      // honesta para não contradizer o número exibido (que é o ajustado).
      reasoning: fvClamped
        ? `${parsed.reasoning ?? ""} (Fair value ajustado ao limite de ±15pp vs. mercado — a estimativa exibida é a ajustada.)`.trim()
        : (parsed.reasoning ?? ""),
      factors: parsed.factors ?? [],
      caveat: parsed.caveat ?? catInfo.note,
      categoryBaseRate: catInfo.baseRate,
      marketProb,
      source,
      cached: false,
    };

    setCache(cacheKey, result, 1800); // cache 30 min
    res.json(result);
  } catch (err) {
    log.error("[fair-value] error:", err);
    // Fallback sem Claude: retorna estimativa quantitativa pura
    res.json({
      fairValue: clampedPreFV,
      confidence: "low",
      edge: Number((clampedPreFV - marketProb).toFixed(1)),
      signal: clampedPreFV > marketProb + 3 ? "bullish" : clampedPreFV < marketProb - 3 ? "bearish" : "neutral",
      reasoning: `Estimativa baseada em base rate histórico de ${catInfo.baseRate}% para a categoria ${category} e liquidez do mercado.`,
      factors: [catInfo.note],
      caveat: "Análise qualitativa indisponível — usando apenas modelo quantitativo.",
      categoryBaseRate: catInfo.baseRate,
      marketProb,
      source,
      cached: false,
    });
  }
}
