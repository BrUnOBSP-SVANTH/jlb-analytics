import { Router } from "express";
import { fetchBcbSerie } from "../lib/bcb.ts";
import { fetchYahooHistory } from "../lib/yahoo.ts";
import { getCache, setCache } from "../lib/cache.ts";

const router = Router();

router.get("/rates", async (_req, res) => {
  const cacheKey = "bcb:all";
  const cached = getCache<object>(cacheKey);
  if (cached) return res.json(cached);
  const [selic, cdi, ipca, usdBrl, eurBrl] = await Promise.all([
    fetchBcbSerie(432), fetchBcbSerie(4389), fetchBcbSerie(13522), fetchBcbSerie(1), fetchBcbSerie(21619),
  ]);
  const data = { selic, cdi, ipca, usdBrl, eurBrl, updatedAt: new Date().toISOString() };
  setCache(cacheKey, data, 3600);
  res.json(data);
});

/**
 * 🔴 QUATRO ROTAS DE COTAÇÃO SAÍRAM DAQUI (Auditoria 21/09, DES-04).
 *
 * `/quotes/br`, `/quotes/us`, `/quotes/indices` e `/quotes/ticker/:symbol`
 * tinham ZERO referências no repositório inteiro — cliente, servidor, scripts e
 * Python. Cada uma chamava BRAPI ou Yahoo, ou seja: eram portas abertas para
 * queimar cota de API externa em nome de ninguém.
 *
 * Ficam `/rates` (o painel macro usa) e `/quotes/history/:symbol` (a aba de
 * correlação do Nível 2 usa). Essas duas foram medidas em uso, não supostas.
 */
router.get("/quotes/history/:symbol", async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const months = Math.min(24, Math.max(3, parseInt(String(req.query.months ?? "12"), 10)));
  const cacheKey = `history:${symbol}:${months}`;
  const cached = getCache<object>(cacheKey);
  if (cached) return res.json(cached);
  try {
    const points = await fetchYahooHistory(symbol, months);
    const result = { ticker: symbol, points, updatedAt: new Date().toISOString() };
    if (points.length > 0) setCache(cacheKey, result, 3600);
    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    res.status(502).json({ error: "history_unavailable", message: msg });
  }
});

/**
 * 🔴 `/ticker-tape` SAIU (DES-04). Também sem uso nenhum, e era a mais caneta:
 * juntava BRAPI + Yahoo + duas séries do Banco Central por chamada, para uma
 * fita de cotações que nenhuma tela desenha.
 */

export default router;
