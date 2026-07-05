/**
 * aiCredits middleware — JLB Analytics
 *
 * Controla consumo de chamadas de IA por usuário/IP.
 * Plano free: 30 análises por mês. Plano premium: ilimitado.
 *
 * Fluxo:
 *   1. Identifica usuário pelo header Authorization (JWT Supabase) ou por IP.
 *   2. Lê registro em ai_credits. Se não existe, cria com defaults (free, 0 usado).
 *   3. Verifica se used_this_month < limite do plano.
 *   4. Incrementa contador.
 *   5. Passa para o próximo handler.
 *
 * Sem Supabase configurado: deixa passar (degradação graciosa).
 */

import type { Request, Response, NextFunction } from "express";
import { createHash } from "crypto";
import { log } from "../lib/log.ts";

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY ?? "";

const FREE_LIMIT = 30;

function supaHeaders() {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
}

async function getOrCreateCredits(userId: string): Promise<{ plan: string; used: number; limit: number } | null> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;

  const url = `${SUPABASE_URL}/rest/v1/ai_credits?user_id=eq.${userId}&select=plan,used_this_month,month_reset`;
  const r = await fetch(url, { headers: supaHeaders() });
  if (!r.ok) return null;

  const rows = await r.json() as Array<{ plan: string; used_this_month: number; month_reset: string }>;

  if (rows.length === 0) {
    // Cria registro para o usuário
    await fetch(`${SUPABASE_URL}/rest/v1/ai_credits`, {
      method: "POST",
      headers: supaHeaders(),
      body: JSON.stringify({ user_id: userId, plan: "free", used_this_month: 0 }),
    });
    return { plan: "free", used: 0, limit: FREE_LIMIT };
  }

  const row = rows[0];
  const creditLimit = row.plan === "premium" ? Infinity : FREE_LIMIT;
  return { plan: row.plan, used: row.used_this_month, limit: creditLimit };
}

async function incrementCredits(userId: string) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;
  // Usa RPC atômica — evita race condition com múltiplas requisições paralelas
  await fetch(`${SUPABASE_URL}/rest/v1/rpc/increment_ai_credits`, {
    method: "POST",
    headers: supaHeaders(),
    body: JSON.stringify({ p_user_id: userId }),
  }).catch((e) => {
    log.warn("[aiCredits] increment RPC failed:", e instanceof Error ? e.message : e);
  });
}

// Verifica o JWT no Supabase Auth (assinatura + expiração) e devolve o user id.
// Decodificar o payload sem verificar permitiria forjar qualquer `sub` e minerar
// cotas ilimitadas — a verificação TEM que acontecer no servidor.
// Cache curto por hash do token evita uma ida ao Auth a cada request.
const tokenCache = new Map<string, { userId: string | null; expiresAt: number }>();
const TOKEN_CACHE_TTL_MS = 5 * 60 * 1000;

export async function verifyUserId(authHeader: string): Promise<string | null> {
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  const cacheKey = createHash("sha256").update(token).digest("hex");
  const hit = tokenCache.get(cacheKey);
  if (hit && hit.expiresAt > Date.now()) return hit.userId;

  let userId: string | null = null;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5_000),
    });
    if (r.ok) {
      const user = await r.json() as { id?: string };
      userId = user.id ?? null;
    }
  } catch { /* Auth indisponível → trata como anônimo */ }

  if (tokenCache.size > 1000) {
    const now = Date.now();
    tokenCache.forEach((v, k) => { if (v.expiresAt <= now) tokenCache.delete(k); });
  }
  tokenCache.set(cacheKey, { userId, expiresAt: Date.now() + TOKEN_CACHE_TTL_MS });
  return userId;
}

export function aiCreditsMiddleware(req: Request, res: Response, next: NextFunction) {
  // Sem Supabase → pass through
  if (!SUPABASE_URL || !SUPABASE_KEY) return next();

  const authHeader = String(req.headers["authorization"] ?? "");

  // Sem token (ou token inválido/forjado, abaixo): anônimo — o isRateLimited
  // por IP das rotas cuida do abuso.
  if (!authHeader) return next();

  verifyUserId(authHeader).then((userId) => {
    if (!userId) return next();

    return getOrCreateCredits(userId).then((credits) => {
      if (!credits) return next(); // Supabase indisponível → pass through

      if (credits.limit !== Infinity && credits.used >= credits.limit) {
        return res.status(429).json({
          error: "credits_exhausted",
          message: `Você usou ${credits.used}/${credits.limit} análises de IA este mês. Faça upgrade para Premium para acesso ilimitado.`,
          used: credits.used,
          limit: credits.limit,
          plan: credits.plan,
        });
      }

      // Incrementa de forma assíncrona — não bloqueia a resposta
      void incrementCredits(userId);

      // Expõe info no header para o cliente poder mostrar contador
      res.setHeader("X-AI-Credits-Used", String(credits.used + 1));
      res.setHeader("X-AI-Credits-Limit", credits.limit === Infinity ? "unlimited" : String(credits.limit));
      res.setHeader("X-AI-Plan", credits.plan);

      next();
    });
  }).catch(() => next()); // Erro (verificação ou Supabase) → pass through
}

// RPC helper — adicionar ao Supabase se quiser atomicidade no incremento
// CREATE OR REPLACE FUNCTION public.increment_ai_credits(p_user_id uuid)
// RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
//   INSERT INTO public.ai_credits (user_id, used_this_month, plan)
//   VALUES (p_user_id, 1, 'free')
//   ON CONFLICT (user_id) DO UPDATE
//   SET used_this_month = ai_credits.used_this_month + 1,
//       updated_at = now();
// $$;
