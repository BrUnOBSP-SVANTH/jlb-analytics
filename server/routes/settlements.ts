/**
 * /api/settlements — resolução OFICIAL em lote das apostas do usuário.
 *
 * O cliente manda os marketIds das previsões pendentes; devolvemos o resultado
 * liquidado de verdade na plataforma (Kalshi `result` / Polymarket UMA), reusando
 * a MESMA função testada do track record da IA (fetchRealOutcomesBatch). Só entra
 * no mapa quem já resolveu oficialmente — nunca um palpite.
 *
 * Cache por mercado: settled é imutável (1h); "pending" re-checa em 5min. Isso
 * deduplica entre usuários e remounts; a busca dos não-cacheados é EM LOTE (poucas
 * chamadas às APIs públicas, sem throttle por-mercado).
 */
import { Router } from "express";
import { fetchRealOutcomesBatch } from "../lib/resolveOutcomes.ts";
import { getCache, setCache } from "../lib/cache.ts";

const router = Router();

const MAX_IDS = 60;        // teto de ids aceitos por requisição
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
  const toFetch: string[] = [];

  for (const id of ids) {
    if (!id.startsWith("poly-") && !id.startsWith("kalshi-")) continue; // manifold/sem prefixo não pontua
    const cached = getCache<{ outcome: boolean } | "pending">(`settle:${id}`);
    if (cached === "pending") continue;
    if (cached && typeof cached === "object") { settlements[id] = cached.outcome; continue; }
    toFetch.push(id);
  }

  // Busca EM LOTE só os não-cacheados; grava cache por-mercado (settled longo / pending curto).
  if (toFetch.length > 0) {
    const { outcomes, unavailable } = await fetchRealOutcomesBatch(toFetch);
    for (const id of toFetch) {
      const outcome = outcomes.get(id);
      if (outcome !== undefined) {
        settlements[id] = outcome;
        setCache(`settle:${id}`, { outcome }, SETTLED_TTL);
      } else if (!unavailable.has(id)) {
        // Consultamos e ainda não liquidou → 'pending' por 5min. Se o chunk FALHOU
        // (unavailable), NÃO cacheia: a próxima requisição re-tenta em vez de esperar.
        setCache(`settle:${id}`, "pending", PENDING_TTL);
      }
    }
  }

  res.json({ settlements });
});

export default router;
