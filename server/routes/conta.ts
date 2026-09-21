/**
 * /api/conta — perguntas sobre a conta que o navegador não responde sozinho.
 *
 * GET /api/conta/dominio-temporario?dominio=mailinator.com → { temporario }
 *
 * POR QUE EXISTE (21/09/2026). A IA não fica disponível para e-mail temporário
 * (middleware/aiCredits.ts) — e quem se cadastrava com um só descobria isso
 * depois, ao tentar a primeira análise. O cadastro precisa avisar ANTES. A
 * lista tem 121 mil domínios e não cabe no navegador, então a pergunta vem aqui.
 *
 * Recebe só o DOMÍNIO, nunca o e-mail: o endereço da pessoa não pode parar em
 * log de acesso por causa de uma checagem de conveniência. Domínio sozinho não
 * é dado pessoal.
 */
import { Router } from "express";
import { isRateLimited } from "../lib/cache.ts";
import { ehEmailDescartavel } from "../lib/identidadeCota.ts";

const router = Router();

const DOMINIO = /^[a-z0-9.-]+\.[a-z]{2,}$/i;

router.get("/dominio-temporario", (req, res) => {
  if (isRateLimited(`dominio-temporario:${req.ip ?? "?"}`, 30, 60_000)) {
    return res.status(429).json({ error: "rate_limited" });
  }
  const dominio = String(req.query.dominio ?? "").trim().toLowerCase().slice(0, 253);
  if (!DOMINIO.test(dominio)) return res.status(400).json({ error: "dominio_invalido" });
  res.json({ temporario: ehEmailDescartavel(`x@${dominio}`) });
});

export default router;
