/**
 * /api/settlements — resolução OFICIAL em lote das apostas do usuário.
 *
 * O cliente manda os marketIds das previsões pendentes; devolvemos o resultado
 * liquidado de verdade na plataforma (Kalshi `result` / Polymarket UMA), reusando
 * a MESMA função testada do track record da IA (fetchRealOutcome). Só entra no
 * mapa quem já resolveu oficialmente — nunca um palpite.
 *
 * Cache por mercado: settled é imutável (1h); "pending" re-checa em 5min. Isso
 * deduplica entre usuários e remounts, e um teto de chamadas por requisição
 * respeita o rate limit das APIs públicas (o resto vem na próxima chamada).
 */
import { Router } from "express";
import { fetchRealOutcome } from "../lib/resolveOutcomes.ts";
import { getCache, setCache } from "../lib/cache.ts";

const router = Router();

const MAX_IDS = 60;        // teto de ids aceitos por requisição
const MAX_CHECKS = 40;     // teto de chamadas externas por requisição (rate limit)
const SETTLED_TTL = 3600;  // resultado oficial não muda → cache longo
const PENDING_TTL = 300;   // ainda não resolveu → re-checa em 5min

// POST /api/settlements  { ids: string[] }  → { settlements: { [id]: boolean } }
router.post("/", async (req, res) => {
  const raw: unknown = (req.body as { ids?: unknown } | undefined)?.ids;
  const ids = Array.isArray(raw)
    ? Array.from(new Set(raw.filter((x): x is string => typeof x === "string"))).slice(0, MAX_IDS)
    : [];
  if (ids.length === 0) return res.json({ settlements: {} });

  const settlements: Record<string, boolean> = {};
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  let checks = 0;

  for (const id of ids) {
    const source = id.startsWith("poly-") ? "polymarket" : id.startsWith("kalshi-") ? "kalshi" : null;
    if (!source) continue;  // manifold (play-money) e ids sem prefixo não pontuam

    const cacheKey = `settle:${id}`;
    const cached = getCache<{ outcome: boolean } | "pending">(cacheKey);
    if (cached === "pending") continue;
    if (cached && typeof cached === "object") { settlements[id] = cached.outcome; continue; }

    if (checks >= MAX_CHECKS) continue;  // orçamento estourado — próxima chamada pega o resto
    checks++;
    const real = await fetchRealOutcome(source, id);
    if (real) {
      settlements[id] = real.outcome;
      setCache(cacheKey, { outcome: real.outcome }, SETTLED_TTL);
    } else {
      setCache(cacheKey, "pending", PENDING_TTL);
    }
    await sleep(120);  // throttle gentil com as APIs públicas
  }

  res.json({ settlements });
});

export default router;
