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
import { log } from "../lib/log.ts";

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

/**
 * A senha do cadastro já vazou por aí?
 *
 * POR QUE ISTO PASSA PELO SERVIDOR (Auditoria 21/09, SEG-04). O navegador
 * chamava `api.pwnedpasswords.com` direto — e a nossa CSP (`connect-src`) só
 * libera o próprio domínio, o Supabase e o wss. Verificado em produção: a
 * chamada era BLOQUEADA, `countBreaches` caía no `catch`, devolvia `null`, e a
 * regra "falha aberta" deixava passar. Ou seja, a checagem de senha vazada
 * nunca rodou uma vez sequer — e o painel do Supabase mostra a proteção dele
 * desligada, então não havia nenhuma das duas.
 *
 * ⚠️ O K-ANONIMATO CONTINUA INTACTO. Chega aqui só o PREFIXO de 5 caracteres do
 * SHA-1, exatamente como o HaveIBeenPwned espera. Nem a senha nem o hash
 * completo saem do navegador: quem compara o sufixo é a própria tela. Este
 * servidor não tem como saber qual senha foi testada — e não deve ter.
 */
const PREFIXO_SHA1 = /^[0-9A-F]{5}$/;

router.get("/senha-vazada", async (req, res) => {
  if (isRateLimited(`senha-vazada:${req.ip ?? "?"}`, 20, 60_000)) {
    return res.status(429).json({ error: "rate_limited" });
  }
  const prefixo = String(req.query.prefixo ?? "").trim().toUpperCase();
  if (!PREFIXO_SHA1.test(prefixo)) return res.status(400).json({ error: "prefixo_invalido" });

  // ⚠️ DUAS TENTATIVAS, e a razão é a falha aberta. Medido em produção
  // (23/09): uma consulta entre oito voltou 502 sozinha, e cada falha dessas
  // deixa passar uma senha vazada sem ninguém saber — o pedido demora ~300ms,
  // então tentar de novo custa quase nada e derruba muito essa janela.
  const consultar = async () => {
    const r = await fetch(`https://api.pwnedpasswords.com/range/${prefixo}`, {
      headers: { "Add-Padding": "true", "User-Agent": "JLB-Analytics" },
      signal: AbortSignal.timeout(6_000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.text();
  };

  for (const tentativa of [1, 2]) {
    try {
      return res.type("text/plain").send(await consultar());
    } catch (e) {
      if (tentativa === 2) {
        // Falha ABERTA, de propósito: uma checagem de conveniência não pode
        // impedir alguém de criar conta. Quem chama trata 502 como "não deu
        // para verificar" — e é por isso que ela precisa falhar POUCO.
        log.warn("senha-vazada", `HaveIBeenPwned não respondeu: ${String(e)}`);
        return res.status(502).json({ error: "consulta_indisponivel" });
      }
    }
  }
});

export default router;
