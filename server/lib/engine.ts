/**
 * Motor de previsão como SERVIÇO (B2B). Recebe uma pergunta (+ opcional preço de
 * mercado/contexto) e devolve uma PROBABILIDADE CALIBRADA + confiança + edge, usando
 * os NOSSOS parâmetros (protocolo Superforecaster + clamp de cauda de guardrails.ts).
 * É o mesmo motor do seed/Previsão, empacotado num contrato limpo pra parceiros.
 *
 * As partes de decisão são puras/testáveis (prompt, modelagem, validação, auth);
 * só forecastMarket faz I/O (chama o modelo).
 */
import { callClaude } from "./anthropic.ts";
import { extractJson } from "./extractJson.ts";
import { clampFairValue } from "./ai/guardrails.ts";

export interface EngineInput { question: string; marketProbability?: number; category?: string; context?: string }
export type EngineConfidence = "low" | "medium" | "high";
export interface EngineForecast { probability: number; confidence: EngineConfidence; edge: number | null; rationale: string; model: string }

export const ENGINE_METHODOLOGY =
  "Protocolo Superforecaster + guardrails de calibração: o preço de mercado é a âncora; o desvio é limitado (e mais apertado na cauda, onde pontos percentuais enganam); a confiança é limitada por domínio. Histórico auditável, sem cherry-picking.";
export const ENGINE_DISCLAIMER =
  "Estimativa probabilística para fins analíticos e educacionais. Não é recomendação de investimento ou aposta. A acurácia histórica é pública e auditável — e ainda em amadurecimento.";

export function normalizeConfidence(raw: unknown): EngineConfidence {
  const s = String(raw ?? "").toLowerCase().trim();
  if (s === "alta" || s === "high") return "high";
  if (s === "baixa" || s === "low") return "low";
  return "medium";
}

/** Constrói o prompt do motor. Puro/testável. */
export function buildEnginePrompt(input: EngineInput, anchor: number | null): string {
  const lines = [
    "Você é um motor de previsão calibrado (protocolo Superforecaster). Estime a probabilidade REAL de SIM.",
    "",
    `PERGUNTA: "${input.question}"`,
  ];
  if (anchor !== null) lines.push(`ÂNCORA DE MERCADO: ${anchor}% — só desvie com evidência concreta; sem ela, fique a ±3pp.`);
  if (input.category) lines.push(`CATEGORIA: ${input.category}`);
  if (input.context) lines.push(`\nCONTEXTO:\n${input.context.slice(0, 1500)}`);
  lines.push(
    "",
    'Responda SÓ JSON: {"fairValue": <inteiro 5-95>, "confidence": "baixa|media|alta", "rationale": "<1 frase objetiva>"}',
  );
  return lines.join("\n");
}

/**
 * Modela a resposta bruta do modelo num forecast calibrado. Puro/testável.
 * Com âncora → clampFairValue (5-95 + banda que aperta na cauda); sem âncora → 5-95.
 */
export function shapeForecast(rawFairValue: unknown, rawConfidence: unknown, rawRationale: unknown, anchor: number | null): Omit<EngineForecast, "model"> {
  const n = Math.round(Number(rawFairValue));
  if (isNaN(n)) throw new Error("engine_no_result");
  const probability = anchor !== null ? clampFairValue(n, anchor) : Math.max(5, Math.min(95, n));
  return {
    probability,
    confidence: normalizeConfidence(rawConfidence),
    edge: anchor !== null ? probability - anchor : null,
    rationale: String(rawRationale ?? "").slice(0, 500),
  };
}

/** Chaves de parceiro do env (ENGINE_API_KEYS, separadas por vírgula). Puro. */
export function parseKeys(env: string | undefined): string[] {
  return (env ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}
/** Valida a chave apresentada. Sem chaves configuradas → tudo negado (fail-closed). */
export function isValidPartnerKey(key: string | undefined, keys: string[]): boolean {
  return !!key && key.length >= 8 && keys.includes(key);
}

/** Valida/normaliza o corpo da requisição. Puro/testável. */
export function validateEngineInput(body: unknown): { ok: true; input: EngineInput } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.question !== "string" || b.question.trim().length < 8) return { ok: false, error: "question obrigatória (mín. 8 caracteres)" };
  if (b.question.length > 500) return { ok: false, error: "question muito longa (máx. 500 caracteres)" };
  let marketProbability: number | undefined;
  if (b.marketProbability != null) {
    const num = Number(b.marketProbability);
    if (isNaN(num) || num < 0 || num > 100) return { ok: false, error: "marketProbability deve ser um número entre 0 e 100" };
    marketProbability = num;
  }
  return {
    ok: true,
    input: {
      question: b.question.trim(),
      marketProbability,
      category: typeof b.category === "string" ? b.category.slice(0, 40) : undefined,
      context: typeof b.context === "string" ? b.context.slice(0, 4000) : undefined,
    },
  };
}

export async function forecastMarket(input: EngineInput): Promise<EngineForecast> {
  const anchor = typeof input.marketProbability === "number"
    ? Math.max(0, Math.min(100, Math.round(input.marketProbability)))
    : null;
  const raw = await callClaude({
    model: "claude-haiku-4-5-20251001", maxTokens: 220,
    messages: [{ role: "user", content: buildEnginePrompt(input, anchor) }],
    timeoutMs: 25_000,
  });
  const parsed = extractJson(raw) as { fairValue?: number; confidence?: string; rationale?: string };
  const shaped = shapeForecast(parsed.fairValue, parsed.confidence, parsed.rationale, anchor);
  return { ...shaped, model: "jlb-engine-v1" }; // marca do produto — não expõe o provedor
}
