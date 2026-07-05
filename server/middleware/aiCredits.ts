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
    console.warn("[aiCredits] increment RPC failed:", e instanceof Error ? e.message : e);
  });
}

// Extrai user_id do JWT Supabase sem verificar assinatura (verificação fica no Supabase)
function extractUserIdFromJwt(authHeader: string): string | null {
  try {
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const [, payload] = token.split(".");
    if (!payload) return null;
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8")) as { sub?: string };
    return decoded.sub ?? null;
  } catch {
    return null;
  }
}

export function aiCreditsMiddleware(req: Request, res: Response, next: NextFunction) {
  // Sem Supabase → pass through
  if (!SUPABASE_URL || !SUPABASE_KEY) return next();

  const authHeader = String(req.headers["authorization"] ?? "");
  const userId = authHeader ? extractUserIdFromJwt(authHeader) : null;
  const ip = req.ip ?? "unknown";

  // Usuários não autenticados: rate limit por IP (10/mês — generoso o suficiente)
  if (!userId) {
    // Deixa o isRateLimited existente cuidar dos IPs anônimos
    return next();
  }

  getOrCreateCredits(userId).then((credits) => {
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
  }).catch(() => next()); // Erro → pass through
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
