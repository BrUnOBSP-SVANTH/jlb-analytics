// ── Duelos de Previsão — Fase 1 (pontos, sem dinheiro real). Ver DUELOS.md ───
// A tabela `duels` NÃO tem policies públicas de propósito: todo acesso passa
// por aqui (service key). É o que garante a SELAGEM — o oponente nunca vê as
// previsões do outro antes do lock, e ninguém vê ambas antes de resolver.
import { Router } from "express";
import { SUPABASE_URL, SUPABASE_KEY, supaWriteHeaders } from "../lib/supabaseRest.ts";
import { verifyUserId } from "../middleware/aiCredits.ts";
import { getLiveMarketPrices, getSnapshotExtremes } from "../lib/aiForecasts.ts";
import { isRateLimited } from "../lib/cache.ts";
import { log } from "../lib/log.ts";

const router = Router();

interface DuelMarket { marketId: string; source: string; title: string; probAtCreate?: number }
interface DuelPred { marketId: string; prob: number }

interface DuelRow {
  id: string; creator_id: string; creator_name: string;
  opponent_id: string | null; opponent_name: string | null;
  status: "open" | "active" | "resolved" | "cancelled";
  stake_pts: number; markets: DuelMarket[];
  creator_preds: DuelPred[]; opponent_preds: DuelPred[] | null;
  creator_brier: number | null; opponent_brier: number | null;
  resolved_legs: number | null; winner_id: string | null;
  created_at: string; locked_at: string | null; resolved_at: string | null;
}

const headers = () => ({ apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` });

function ready(res: import("express").Response): boolean {
  if (!SUPABASE_URL || !SUPABASE_KEY) { res.status(503).json({ error: "supabase_unavailable" }); return false; }
  return true;
}

/** O que cada um pode ver: previsões do oponente só depois de resolvido. */
function sanitize(d: DuelRow, viewerId: string | null) {
  const isCreator = viewerId === d.creator_id;
  const isOpponent = viewerId !== null && viewerId === d.opponent_id;
  const resolved = d.status === "resolved";
  return {
    id: d.id, status: d.status, stakePts: d.stake_pts,
    creatorName: d.creator_name, opponentName: d.opponent_name,
    markets: d.markets, createdAt: d.created_at, lockedAt: d.locked_at, resolvedAt: d.resolved_at,
    isCreator, isOpponent,
    myPreds: isCreator ? d.creator_preds : isOpponent ? d.opponent_preds : null,
    theirPreds: resolved ? (isCreator ? d.opponent_preds : d.creator_preds) : null,
    creatorBrier: resolved ? d.creator_brier : null,
    opponentBrier: resolved ? d.opponent_brier : null,
    resolvedLegs: d.resolved_legs,
    winnerId: d.winner_id,
    won: resolved && viewerId !== null && d.winner_id === viewerId,
  };
}

function validPreds(markets: DuelMarket[], preds: unknown): preds is DuelPred[] {
  if (!Array.isArray(preds) || preds.length !== markets.length) return false;
  const ids = new Set(markets.map((m) => m.marketId));
  const seen = new Set<string>();
  for (const p of preds as DuelPred[]) {
    if (!p || typeof p.marketId !== "string" || !ids.has(p.marketId) || seen.has(p.marketId)) return false;
    const prob = Number(p.prob);
    if (!Number.isFinite(prob) || prob < 1 || prob > 99) return false;
    seen.add(p.marketId);
  }
  return true;
}

// ── Lobby: duelos abertos (público, sem previsões) ──────────────────────────
router.get("/open", async (_req, res) => {
  if (!ready(res)) return;
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/duels?status=eq.open&select=id,creator_name,stake_pts,markets,created_at&order=created_at.desc&limit=30`,
      { headers: headers(), signal: AbortSignal.timeout(8_000) },
    );
    if (!r.ok) throw new Error(`supabase ${r.status}`);
    const rows = await r.json() as Array<Pick<DuelRow, "id" | "creator_name" | "stake_pts" | "markets" | "created_at">>;
    res.json({
      duels: rows.map((d) => ({
        id: d.id, creatorName: d.creator_name, stakePts: d.stake_pts,
        markets: d.markets, createdAt: d.created_at,
      })),
    });
  } catch (err) {
    log.error("[duels/open] error:", err);
    res.status(500).json({ error: "internal" });
  }
});

// ── Meus duelos (auth) ──────────────────────────────────────────────────────
router.get("/mine", async (req, res) => {
  if (!ready(res)) return;
  const userId = await verifyUserId(String(req.headers.authorization ?? ""));
  if (!userId) return res.status(401).json({ error: "auth_required" });
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/duels?or=(creator_id.eq.${userId},opponent_id.eq.${userId})&select=*&order=created_at.desc&limit=50`,
      { headers: headers(), signal: AbortSignal.timeout(8_000) },
    );
    if (!r.ok) throw new Error(`supabase ${r.status}`);
    const rows = await r.json() as DuelRow[];
    res.json({ duels: rows.map((d) => sanitize(d, userId)) });
  } catch (err) {
    log.error("[duels/mine] error:", err);
    res.status(500).json({ error: "internal" });
  }
});

// ── Criar duelo (auth) — previsões do criador seladas na criação ────────────
router.post("/", async (req, res) => {
  if (!ready(res)) return;
  const userId = await verifyUserId(String(req.headers.authorization ?? ""));
  if (!userId) return res.status(401).json({ error: "auth_required" });
  if (isRateLimited(`duel-create:${userId}`, 5, 60_000)) {
    return res.status(429).json({ error: "rate_limited" });
  }

  const { stakePts, markets, preds, displayName } = req.body as {
    stakePts?: number; markets?: DuelMarket[]; preds?: DuelPred[]; displayName?: string;
  };
  const stake = Math.round(Number(stakePts ?? 50));
  if (!Number.isFinite(stake) || stake < 10 || stake > 500) return res.status(400).json({ error: "stake_invalid", message: "Pontos em jogo: 10 a 500." });
  if (!Array.isArray(markets) || markets.length < 2 || markets.length > 5) return res.status(400).json({ error: "markets_invalid", message: "Escolha de 2 a 5 mercados." });
  for (const m of markets) {
    if (!m?.marketId || !m?.title || !/^(poly|kalshi)-/.test(m.marketId)) return res.status(400).json({ error: "markets_invalid", message: "Mercado inválido no baralho." });
  }
  if (!validPreds(markets, preds)) return res.status(400).json({ error: "preds_invalid", message: "Envie uma probabilidade (1-99) para cada mercado." });

  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/duels`, {
      method: "POST",
      headers: { ...supaWriteHeaders(), Prefer: "return=representation" },
      body: JSON.stringify({
        creator_id: userId,
        creator_name: String(displayName ?? "Desafiante").slice(0, 40) || "Desafiante",
        stake_pts: stake,
        markets: markets.map((m) => ({ marketId: m.marketId, source: m.source, title: String(m.title).slice(0, 200), probAtCreate: m.probAtCreate })),
        creator_preds: preds,
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!r.ok) throw new Error(`supabase ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const [row] = await r.json() as DuelRow[];
    res.json({ duel: sanitize(row, userId) });
  } catch (err) {
    log.error("[duels/create] error:", err);
    res.status(500).json({ error: "internal" });
  }
});

// ── Entrar num duelo (auth) — sela as previsões do oponente e trava ─────────
router.post("/:id/join", async (req, res) => {
  if (!ready(res)) return;
  const userId = await verifyUserId(String(req.headers.authorization ?? ""));
  if (!userId) return res.status(401).json({ error: "auth_required" });
  const id = String(req.params.id);
  const { preds, displayName } = req.body as { preds?: DuelPred[]; displayName?: string };

  try {
    const r0 = await fetch(`${SUPABASE_URL}/rest/v1/duels?id=eq.${id}&select=*`, { headers: headers(), signal: AbortSignal.timeout(8_000) });
    const [duel] = await r0.json() as DuelRow[];
    if (!duel) return res.status(404).json({ error: "not_found" });
    if (duel.status !== "open") return res.status(409).json({ error: "not_open", message: "Este duelo já foi aceito ou encerrado." });
    if (duel.creator_id === userId) return res.status(400).json({ error: "own_duel", message: "Você não pode duelar contra si mesmo." });
    if (!validPreds(duel.markets, preds)) return res.status(400).json({ error: "preds_invalid", message: "Envie uma probabilidade (1-99) para cada mercado do duelo." });

    // Guarda de corrida: só entra se ainda estiver open (filtro na própria escrita)
    const r = await fetch(`${SUPABASE_URL}/rest/v1/duels?id=eq.${id}&status=eq.open`, {
      method: "PATCH",
      headers: { ...supaWriteHeaders(), Prefer: "return=representation" },
      body: JSON.stringify({
        opponent_id: userId,
        opponent_name: String(displayName ?? "Oponente").slice(0, 40) || "Oponente",
        opponent_preds: preds,
        status: "active",
        locked_at: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!r.ok) throw new Error(`supabase ${r.status}`);
    const rows = await r.json() as DuelRow[];
    if (rows.length === 0) return res.status(409).json({ error: "not_open", message: "Alguém entrou primeiro." });
    res.json({ duel: sanitize(rows[0], userId) });
  } catch (err) {
    log.error("[duels/join] error:", err);
    res.status(500).json({ error: "internal" });
  }
});

// ── Cancelar duelo aberto (auth, só o criador) ──────────────────────────────
router.post("/:id/cancel", async (req, res) => {
  if (!ready(res)) return;
  const userId = await verifyUserId(String(req.headers.authorization ?? ""));
  if (!userId) return res.status(401).json({ error: "auth_required" });
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/duels?id=eq.${String(req.params.id)}&status=eq.open&creator_id=eq.${userId}`, {
      method: "PATCH",
      headers: { ...supaWriteHeaders(), Prefer: "return=representation" },
      body: JSON.stringify({ status: "cancelled" }),
      signal: AbortSignal.timeout(8_000),
    });
    const rows = await r.json() as DuelRow[];
    if (rows.length === 0) return res.status(409).json({ error: "cannot_cancel" });
    res.json({ ok: true });
  } catch (err) {
    log.error("[duels/cancel] error:", err);
    res.status(500).json({ error: "internal" });
  }
});

// ── Resolver (qualquer participante dispara; idempotente) ───────────────────
// Uma perna resolve quando o mercado bate preço extremo (≥97 SIM / ≤3 NÃO),
// ao vivo ou nos snapshots — o MESMO critério do track record da IA.
// O duelo finaliza quando TODAS as pernas resolvem; menor Brier vence.
router.post("/:id/resolve", async (req, res) => {
  if (!ready(res)) return;
  const userId = await verifyUserId(String(req.headers.authorization ?? ""));
  if (!userId) return res.status(401).json({ error: "auth_required" });
  const id = String(req.params.id);

  try {
    const r0 = await fetch(`${SUPABASE_URL}/rest/v1/duels?id=eq.${id}&select=*`, { headers: headers(), signal: AbortSignal.timeout(8_000) });
    const [duel] = await r0.json() as DuelRow[];
    if (!duel) return res.status(404).json({ error: "not_found" });
    if (duel.status === "resolved") return res.json({ duel: sanitize(duel, userId) });
    if (duel.status !== "active" || !duel.opponent_preds) return res.status(409).json({ error: "not_active" });
    if (userId !== duel.creator_id && userId !== duel.opponent_id) return res.status(403).json({ error: "not_participant" });

    const priceMap = getLiveMarketPrices();
    const extremeMap = await getSnapshotExtremes();
    const outcomes = new Map<string, boolean>();
    for (const m of duel.markets) {
      const live = priceMap.get(m.marketId);
      if (live !== undefined) {
        if (live >= 97) { outcomes.set(m.marketId, true); continue; }
        if (live <= 3) { outcomes.set(m.marketId, false); continue; }
      }
      const rawId = m.marketId.replace(/^(poly-|kalshi-)/, "");
      const hist = extremeMap.get(`${m.source}:${rawId}`);
      if (hist !== undefined) outcomes.set(m.marketId, hist);
    }

    if (outcomes.size < duel.markets.length) {
      // Parcial: registra progresso, mantém ativo
      await fetch(`${SUPABASE_URL}/rest/v1/duels?id=eq.${id}`, {
        method: "PATCH", headers: supaWriteHeaders(),
        body: JSON.stringify({ resolved_legs: outcomes.size }),
        signal: AbortSignal.timeout(6_000),
      }).catch(() => {});
      return res.json({ pending: true, resolvedLegs: outcomes.size, totalLegs: duel.markets.length });
    }

    const brier = (preds: DuelPred[]) => {
      const errs = preds.map((p) => {
        const o = outcomes.get(p.marketId)! ? 1 : 0;
        return (p.prob / 100 - o) ** 2;
      });
      return errs.reduce((a, b) => a + b, 0) / errs.length;
    };
    const cb = brier(duel.creator_preds);
    const ob = brier(duel.opponent_preds);
    // Menor Brier vence; empate exato → ninguém ganha (winner_id null)
    const winnerId = cb < ob ? duel.creator_id : ob < cb ? duel.opponent_id : null;

    const r = await fetch(`${SUPABASE_URL}/rest/v1/duels?id=eq.${id}&status=eq.active`, {
      method: "PATCH",
      headers: { ...supaWriteHeaders(), Prefer: "return=representation" },
      body: JSON.stringify({
        status: "resolved",
        creator_brier: Number(cb.toFixed(4)),
        opponent_brier: Number(ob.toFixed(4)),
        resolved_legs: duel.markets.length,
        winner_id: winnerId,
        resolved_at: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(8_000),
    });
    const rows = await r.json() as DuelRow[];
    res.json({ duel: sanitize(rows[0] ?? duel, userId) });
  } catch (err) {
    log.error("[duels/resolve] error:", err);
    res.status(500).json({ error: "internal" });
  }
});

export default router;
