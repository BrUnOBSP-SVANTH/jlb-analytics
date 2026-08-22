/**
 * /api/engine — o MOTOR de previsão exposto pra parceiros (B2B, "Probabilidade-como-
 * Serviço"). Auth por chave de parceiro (ENGINE_API_KEYS, fail-closed: sem chaves
 * configuradas, tudo é negado) + rate limit por chave. Reusa lib/engine.ts.
 */
import { Router } from "express";
import { log } from "../lib/log.ts";
import { recordSecurityEvent } from "../lib/security.ts";
import {
  forecastMarket, validateEngineInput, parseKeys, isValidPartnerKey,
  ENGINE_METHODOLOGY, ENGINE_DISCLAIMER,
} from "../lib/engine.ts";

const router = Router();

// Rate limit simples por chave (janela deslizante em memória).
const hits = new Map<string, number[]>();
function limited(key: string, max = 30, windowMs = 60_000): boolean {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= max) { hits.set(key, arr); return true; }
  arr.push(now); hits.set(key, arr);
  return false;
}

function extractKey(req: { headers: Record<string, unknown> }): string {
  const x = req.headers["x-api-key"];
  if (typeof x === "string" && x.trim()) return x.trim();
  const auth = String(req.headers["authorization"] ?? "");
  return auth.replace(/^Bearer\s+/i, "").trim();
}

// POST /api/engine/forecast — o produto: pergunta → probabilidade calibrada.
router.post("/forecast", async (req, res) => {
  const key = extractKey(req);
  if (!isValidPartnerKey(key, parseKeys(process.env.ENGINE_API_KEYS))) {
    recordSecurityEvent("auth_fail", req.ip); // força-bruta de chave → detecção
    return res.status(401).json({ error: "invalid_api_key", message: "Forneça uma chave de parceiro válida em X-API-Key." });
  }
  if (limited(key)) {
    return res.status(429).json({ error: "rate_limited", message: "Limite de 30 requisições por minuto por chave." });
  }
  const v = validateEngineInput(req.body);
  if (!v.ok) return res.status(400).json({ error: "invalid_input", message: v.error });
  try {
    const forecast = await forecastMarket(v.input);
    res.json({ ...forecast, methodology: ENGINE_METHODOLOGY, disclaimer: ENGINE_DISCLAIMER });
  } catch (err) {
    log.error("[engine/forecast]", err instanceof Error ? err.message : err);
    res.status(502).json({ error: "engine_unavailable", message: "O motor está indisponível no momento. Tente novamente." });
  }
});

// GET /api/engine — contrato/documentação mínima (público, sem chave).
router.get("/", (_req, res) => {
  res.json({
    name: "JLB Forecasting Engine",
    version: "v1",
    auth: "Header X-API-Key: <sua-chave-de-parceiro>",
    endpoint: {
      method: "POST",
      path: "/api/engine/forecast",
      body: {
        question: "string (obrigatória, 8–500 chars)",
        marketProbability: "number 0–100 (opcional — vira a âncora e habilita o 'edge')",
        category: "string (opcional)",
        context: "string (opcional, até 4000 chars)",
      },
      returns: {
        probability: "0–100 (probabilidade calibrada de SIM)",
        confidence: "low | medium | high",
        edge: "pontos percentuais vs. o mercado (null se marketProbability não for enviado)",
        rationale: "1 frase de justificativa",
        model: "jlb-engine-v1",
        methodology: "string",
        disclaimer: "string",
      },
    },
    proof: "Acurácia histórica auditável em /track-record.",
    disclaimer: ENGINE_DISCLAIMER,
  });
});

export default router;
