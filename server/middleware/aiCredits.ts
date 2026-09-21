/**
 * aiCredits middleware — JLB Analytics
 *
 * Controla consumo de chamadas de IA por usuário.
 * Plano free: a cota de shared/planos.ts por mês (EXIGE login). Premium: ilimitado.
 *
 * Fluxo:
 *   1. Sem token → 401 (IA exige conta). Token inválido → 401.
 *   2. RESERVA 1 crédito no banco, num passo só (reservar_credito_ia, migração
 *      036): confere o saldo E debita juntos. Sem saldo → 429.
 *   3. Passa para o handler.
 *   4. Ao terminar: se foi acerto de cache ou erro, DEVOLVE o crédito.
 *
 * Por que reservar antes e não debitar depois: debitar depois deixava pedidos
 * simultâneos passarem todos (medido: 5 de 5 com 1 de saldo).
 *
 * Banco inacessível → 503, nunca "deixa passar". Sem Supabase CONFIGURADO
 * (ambiente de desenvolvimento) → deixa passar, como sempre foi.
 */

import type { Request, Response, NextFunction } from "express";
import { createHash } from "crypto";
import { log } from "../lib/log.ts";

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY ?? "";

/** Cota mensal do plano grátis. A constante mora em `shared/planos.ts` porque a
 *  página /planos ANUNCIA este número para quem ainda não pagou: servidor e
 *  vitrine precisam do mesmo símbolo. Duplicá-la já fez a UI mostrar 30
 *  enquanto o servidor bloqueava em 4. */
export { COTA_GRATIS_MENSAL as FREE_LIMIT } from "../../shared/planos.ts";
import { COTA_GRATIS_MENSAL as FREE_LIMIT } from "../../shared/planos.ts";

/**
 * O reset mensal no banco é um trigger BEFORE UPDATE — só dispara quando o
 * contador é incrementado. Usuário que esgotou a cota leva 429 ANTES do
 * incremento, então o UPDATE nunca roda e o mês nunca vira para ele
 * (bloqueio permanente). Por isso o mês PRECISA ser conferido aqui na
 * leitura: mês antigo = cota zerada, independente do que a linha diga.
 */
export function isStaleMonth(monthReset: string, now: Date = new Date()): boolean {
  const current = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  return monthReset.slice(0, 7) < current;
}

function supaHeaders() {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
}

/**
 * RESERVA o crédito antes da análise — confere e debita num passo só, no banco
 * (migração 036). Devolve `null` quando não conseguiu falar com o banco.
 *
 * ⚠️ A ordem antiga era CONFERIR antes e DEBITAR depois da análise (5 a 25s
 * depois). Nesse intervalo todo pedido lia o mesmo saldo: com 3 de 4 usadas,
 * 5 pedidos simultâneos passaram os 5. Duas abas bastavam para furar a cota.
 */
async function reservarCredito(userId: string): Promise<{ reservado: boolean; usado: number; plano: string } | null> {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/reservar_credito_ia`, {
      method: "POST",
      headers: supaHeaders(),
      body: JSON.stringify({ p_user_id: userId, p_limite: FREE_LIMIT }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!r.ok) return null;
    const [linha] = await r.json() as Array<{ reservado: boolean; usado: number; plano: string }>;
    return linha ?? null;
  } catch {
    return null;
  }
}

/** Devolve a reserva de quem não gerou nada (acerto de cache ou erro). */
async function devolverCredito(userId: string) {
  await fetch(`${SUPABASE_URL}/rest/v1/rpc/devolver_credito_ia`, {
    method: "POST",
    headers: supaHeaders(),
    body: JSON.stringify({ p_user_id: userId }),
  }).catch((e) => {
    log.warn("[aiCredits] devolução falhou:", e instanceof Error ? e.message : e);
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

// IA exige conta: resposta padrão para requisição sem login válido.
function loginRequired(res: Response) {
  return res.status(401).json({
    error: "login_required",
    message: `Crie uma conta grátis para usar a IA — ${FREE_LIMIT} análises por mês no plano gratuito.`,
  });
}

export function aiCreditsMiddleware(req: Request, res: Response, next: NextFunction) {
  // Sem Supabase configurado → não há auth nem cota para conferir: deixa passar
  // (degradação graciosa em dev / ambiente sem backend).
  if (!SUPABASE_URL || !SUPABASE_KEY) return next();

  const authHeader = String(req.headers["authorization"] ?? "");

  // IA agora EXIGE conta: sem token (anônimo) → 401 login_required. O limite
  // grátis de 4/mês só vale de verdade se o anônimo não puder burlar apenas
  // não logando. Rate-limit por IP das rotas segue como defesa extra.
  if (!authHeader) return loginRequired(res);

  verifyUserId(authHeader).then(async (userId) => {
    // Token presente mas sem usuário válido (expirado/forjado) → pedir login.
    if (!userId) return loginRequired(res);

    // RESERVA ANTES, devolve depois se não houve geração. Ver reservarCredito.
    const reserva = await reservarCredito(userId);

    // ⚠️ Fechado, não aberto. Antes, qualquer falha ao falar com o banco
    // deixava passar SEM COTA — com o Supabase instável, a IA virava ilimitada
    // para qualquer conta. Sem conseguir contar, não gasta (mesma regra do
    // orçamento das tarefas automáticas, lib/orcamentoIA.ts).
    if (!reserva) {
      return res.status(503).json({
        error: "cota_indisponivel",
        message: "Não conseguimos conferir sua cota de análises agora. Tente de novo em instantes.",
      });
    }

    const premium = reserva.plano === "premium";
    if (!reserva.reservado) {
      return res.status(429).json({
        error: "credits_exhausted",
        message: `Você usou as ${FREE_LIMIT} análises de IA grátis deste mês. Faça upgrade para Premium para acesso ilimitado.`,
        used: reserva.usado,
        limit: FREE_LIMIT,
        plan: reserva.plano,
      });
    }

    // Cobrança JUSTA: a reserva é devolvida quando não houve geração de
    // verdade — acerto de cache (o handler marca res.locals.aiCacheHit) ou erro
    // (status fora de 2xx). Com 4 por mês, cobrar por um 503 ou pela mesma
    // resposta já pronta seria injusto.
    //
    // Conexão que cai no meio NÃO devolve: a geração já aconteceu (custou) e a
    // resposta fica no cache. Devolver abriria o truque de pedir, abortar no
    // último segundo e pegar do cache de graça logo depois.
    const gerou = () => !res.locals.aiCacheHit && res.statusCode >= 200 && res.statusCode < 300;
    res.on("finish", () => { if (!gerou()) void devolverCredito(userId); });

    // Cota nos headers — o chat (ChatPanel) mostra o contador a partir deles.
    // Escritos no ÚLTIMO instante: só na hora de enviar se sabe se o crédito
    // reservado vai ficar ou ser devolvido.
    const escreverCota = () => {
      if (res.headersSent) return;
      res.setHeader("X-AI-Credits-Used", String(gerou() ? reserva.usado : Math.max(0, reserva.usado - 1)));
      res.setHeader("X-AI-Credits-Limit", premium ? "unlimited" : String(FREE_LIMIT));
      res.setHeader("X-AI-Plan", reserva.plano);
    };
    // `writeHead` é por onde TODA resposta passa — JSON e stream (SSE) —
    // inclusive quando o Express a chama por baixo dos panos.
    const writeHeadOriginal = res.writeHead.bind(res);
    res.writeHead = ((...args: Parameters<typeof res.writeHead>) => {
      escreverCota();
      return writeHeadOriginal(...args);
    }) as typeof res.writeHead;

    next();
  }).catch(() => {
    // Falha inesperada na verificação: também fechado.
    if (!res.headersSent) res.status(503).json({ error: "cota_indisponivel", message: "Não conseguimos conferir sua cota de análises agora. Tente de novo em instantes." });
  });
}

// HISTÓRICO — substituída em 21/09/2026 por reservar_credito_ia/devolver_credito_ia
// (migração 036), porque debitar DEPOIS da análise deixava pedidos simultâneos
// passarem todos. Fica documentada aqui porque ainda existe no banco.
// RPC atômica no Supabase (migration 020). O reset mensal mora AQUI: se a linha
// é de um mês antigo, a chamada atual já conta como a 1ª do novo mês (=1) e
// month_reset vira o mês corrente; senão, +1. Sem off-by-one (a 1ª chamada do
// mês conta). O trigger reset_monthly_credits vira no-op de segurança.
// CREATE OR REPLACE FUNCTION public.increment_ai_credits(p_user_id uuid)
// RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
//   INSERT INTO public.ai_credits (user_id, used_this_month, plan, month_reset)
//   VALUES (p_user_id, 1, 'free', date_trunc('month', now())::date)
//   ON CONFLICT (user_id) DO UPDATE
//   SET used_this_month = CASE
//         WHEN ai_credits.month_reset < date_trunc('month', now())::date THEN 1
//         ELSE ai_credits.used_this_month + 1 END,
//       month_reset = date_trunc('month', now())::date,
//       updated_at = now();
// $$;
