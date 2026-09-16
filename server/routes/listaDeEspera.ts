/**
 * POST /api/lista-de-espera — quem quer ser avisado quando o Premium abrir.
 *
 * Auditoria de 14/09/2026, item 21: a página prometia o campo de e-mail e o
 * botão era um `mailto:`. Em desktop sem cliente de e-mail configurado, o clique
 * não fazia nada visível e o lead sumia.
 *
 * DECISÕES:
 * · O e-mail vai para o banco pelo SERVIDOR (chave de serviço). A tabela nega
 *   tudo para o navegador — ver migration 033.
 * · E-mail repetido responde SUCESSO, sem gravar de novo. Dizer "você já está na
 *   lista" contaria a um desconhecido quem está cadastrado.
 * · Limite por IP: 5 por hora. É formulário público.
 */
import { Router } from "express";
import { isRateLimited } from "../lib/cache.ts";
import { SUPABASE_URL, SUPABASE_KEY, supaWriteHeaders } from "../lib/supabaseRest.ts";
import { log } from "../lib/log.ts";

const router = Router();

/** Validação de e-mail deliberadamente simples: o que decide de verdade é o envio chegar. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

export function emailValido(valor: unknown): valor is string {
  return typeof valor === "string" && valor.length <= 254 && EMAIL_RE.test(valor.trim());
}

router.post("/", async (req, res) => {
  const ip = req.ip ?? "desconhecido";
  if (isRateLimited(`espera:${ip}`, 5, 60 * 60_000)) {
    return res.status(429).json({ error: "muitas_tentativas", message: "Tente de novo daqui a pouco." });
  }

  const { email, origem } = (req.body ?? {}) as { email?: unknown; origem?: unknown };
  if (!emailValido(email)) {
    return res.status(400).json({ error: "email_invalido", message: "Confira o e-mail digitado." });
  }
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(503).json({ error: "indisponivel", message: "Não conseguimos registrar agora. Tente mais tarde." });
  }

  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/lista_de_espera`, {
      method: "POST",
      headers: { ...supaWriteHeaders(), Prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        origem: typeof origem === "string" ? origem.slice(0, 60) : null,
      }),
      signal: AbortSignal.timeout(8_000),
    });
    // 409 é e-mail repetido: para quem está do outro lado, é a mesma coisa que ter entrado.
    if (!r.ok && r.status !== 409) {
      log.warn(`[lista-de-espera] gravação recusada (HTTP ${r.status}): ${(await r.text().catch(() => "")).slice(0, 200)}`);
      return res.status(502).json({ error: "falha", message: "Não conseguimos registrar agora. Tente mais tarde." });
    }
    return res.json({ ok: true });
  } catch (e) {
    log.warn(`[lista-de-espera] falha: ${e instanceof Error ? e.message : String(e)}`);
    return res.status(502).json({ error: "falha", message: "Não conseguimos registrar agora. Tente mais tarde." });
  }
});

export default router;
