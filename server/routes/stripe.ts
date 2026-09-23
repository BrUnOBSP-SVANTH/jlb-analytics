/**
 * Stripe — checkout, portal do cliente e webhook.
 *
 * O QUE ESTAVA ERRADO (Auditoria 21/09, SEG-03). Esta é a única rota do site
 * onde alguém entrega dinheiro, e era a mais frouxa:
 *
 *  · `/checkout` não pedia login. Ele confiava em `priceId`, `userId` e
 *    `userEmail` vindos do CORPO da requisição — dava para abrir um checkout de
 *    QUALQUER price da conta Stripe, em nome de QUALQUER usuário;
 *  · o webhook procurava o usuário em `metadata.user_id`, que só existe na
 *    Checkout Session. Nos eventos de assinatura ele vem vazio: ninguém voltava
 *    para o free ao CANCELAR;
 *  · `customer.subscription.updated` era ignorado — assinatura em `past_due` ou
 *    `unpaid` continuava premium;
 *  · `crypto.timingSafeEqual` LANÇA quando os buffers têm tamanhos diferentes,
 *    e uma assinatura forjada de tamanho errado derrubava a rota com 500 em vez
 *    de ser recusada com 400;
 *  · não havia como a pessoa cancelar sozinha (portal do cliente).
 *
 * A regra agora: quem é o usuário sai do JWT, o preço sai do ambiente do
 * SERVIDOR, e o vínculo com o Stripe (`customer`/`subscription`) é guardado no
 * perfil para que todo evento seguinte ache a conta certa.
 */

import { Router, raw } from "express";
import { urlPublica } from "../lib/urlPublica.ts";
import { verifyUser } from "../middleware/aiCredits.ts";
import { lerEventoDoStripe, type EventoDoStripe } from "../lib/stripeEventos.ts";
import crypto from "crypto";
import { log } from "../lib/log.ts";

const router = Router();

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY ?? "";

function supaHeaders() {
  return {
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=minimal",
  };
}

async function setUserPlan(userId: string, plan: "free" | "premium") {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    log.warn("[Stripe] Supabase não configurado — plano não atualizado");
    return;
  }
  const r1 = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
    method: "PATCH",
    headers: supaHeaders(),
    body: JSON.stringify({ plan }),
  });
  if (!r1.ok) log.error(`[Stripe] profiles update HTTP ${r1.status}`);

  const r2 = await fetch(`${SUPABASE_URL}/rest/v1/ai_credits`, {
    method: "POST",
    headers: { ...supaHeaders(), Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ user_id: userId, plan, used_this_month: 0 }),
  });
  if (!r2.ok) log.error(`[Stripe] ai_credits upsert HTTP ${r2.status}`);
  else log.info(`[Stripe] Plano ${plan} ativado para usuário ${userId}`);
}

/** Guarda a ponte com o Stripe — é ela que faz o cancelamento achar a conta. */
async function gravarVinculoStripe(userId: string, customerId?: string, subscriptionId?: string) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || (!customerId && !subscriptionId)) return;
  const corpo: Record<string, string> = {};
  if (customerId) corpo.stripe_customer_id = customerId;
  if (subscriptionId) corpo.stripe_subscription_id = subscriptionId;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
    method: "PATCH", headers: supaHeaders(), body: JSON.stringify(corpo),
  });
  if (!r.ok) log.error(`[Stripe] não consegui guardar o vínculo do cliente: HTTP ${r.status}`);
}

/** Acha o usuário pelo cliente do Stripe — o caminho dos eventos de assinatura. */
async function usuarioPorCliente(customerId?: string, subscriptionId?: string): Promise<string | null> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;
  const filtros = [
    customerId ? `stripe_customer_id=eq.${encodeURIComponent(customerId)}` : null,
    subscriptionId ? `stripe_subscription_id=eq.${encodeURIComponent(subscriptionId)}` : null,
  ].filter(Boolean);
  for (const filtro of filtros) {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/profiles?${filtro}&select=id&limit=1`, {
        headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
        signal: AbortSignal.timeout(8_000),
      });
      if (!r.ok) continue;
      const linhas = await r.json() as Array<{ id: string }>;
      if (linhas[0]?.id) return linhas[0].id;
    } catch { /* tenta o próximo filtro */ }
  }
  return null;
}

/**
 * Assinatura do webhook. Exportada porque é a única barreira entre um POST
 * anônimo e a concessão de plano pago.
 *
 * ⚠️ `timingSafeEqual` LANÇA quando os buffers têm tamanhos diferentes. Sem a
 * conferência de tamanho, uma assinatura forjada com comprimento errado
 * derrubava a rota com 500 — e 500 num webhook faz o Stripe REENVIAR o evento,
 * repetidamente. Recusar é 400.
 */
export function assinaturaValida(payload: Buffer, sigHeader: string, secret: string, agora = Date.now()): boolean {
  if (!secret) return false;
  const parts = String(sigHeader ?? "").split(",").reduce<Record<string, string>>((acc, part) => {
    const [k, v] = part.split("=");
    if (k && v) acc[k.trim()] = v.trim();
    return acc;
  }, {});
  const timestamp = parts["t"];
  const signature = parts["v1"];
  if (!timestamp || !signature) return false;

  // Rejeita webhooks com mais de 5 minutos (proteção contra replay).
  const ts = parseInt(timestamp, 10);
  if (!Number.isFinite(ts) || Math.abs(agora / 1000 - ts) > 300) return false;

  const signed = `${timestamp}.${payload.toString("utf-8")}`;
  const esperado = Buffer.from(crypto.createHmac("sha256", secret).update(signed).digest("hex"), "hex");
  // Hex inválido vira buffer curto ou vazio: compara o tamanho ANTES.
  const recebido = Buffer.from(signature, "hex");
  if (recebido.length !== esperado.length || recebido.length === 0) return false;
  return crypto.timingSafeEqual(esperado, recebido);
}

// ── Checkout ─────────────────────────────────────────────────────────────────

router.post("/checkout", async (req, res) => {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const precoPremium = process.env.STRIPE_PREMIUM_PRICE_ID ?? "";
  if (!stripeKey) {
    return res.status(503).json({ error: "stripe_nao_configurado", message: "Pagamento indisponível neste ambiente." });
  }
  // QUEM É O USUÁRIO sai do token, não do corpo. Antes dava para abrir um
  // checkout em nome de qualquer conta, mandando o `userId` de outra pessoa.
  //
  // ⚠️ E esta conferência vem ANTES da de configuração, de propósito: quem não
  // está logado não precisa ficar sabendo o que falta configurar no servidor.
  const usuario = await verifyUser(String(req.headers.authorization ?? ""));
  if (!usuario) {
    return res.status(401).json({ error: "login_necessario", message: "Entre na sua conta para assinar." });
  }

  // O PREÇO SAI DAQUI, do servidor. Antes vinha no corpo da requisição, e
  // qualquer pessoa podia abrir um checkout de outro price da conta Stripe —
  // inclusive um de um centavo.
  if (!precoPremium) {
    log.error("[Stripe] STRIPE_PREMIUM_PRICE_ID ausente — checkout recusado");
    return res.status(503).json({ error: "preco_nao_configurado", message: "O plano ainda não está disponível para contratação." });
  }

  try {
    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${stripeKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        "payment_method_types[]": "card",
        "mode": "subscription",
        "line_items[0][price]": precoPremium,
        "line_items[0][quantity]": "1",
        ...(usuario.email ? { "customer_email": usuario.email } : {}),
        "metadata[user_id]": usuario.id,
        // ⚠️ O metadata da SESSÃO não viaja para os eventos de assinatura. Sem
        // esta linha, `customer.subscription.deleted` chega sem saber de quem é
        // — e era por isso que ninguém voltava para o free ao cancelar.
        "subscription_data[metadata][user_id]": usuario.id,
        // ⚠️ NÃO ler APP_URL direto: no Render ela está como localhost:3000, e
        // era isto que mandaria quem acabou de PAGAR para o próprio computador
        // (mesmo defeito do retorno do login com Google, medido em 17/09).
        "success_url": `${urlPublica()}/perfil?success=1`,
        "cancel_url": `${urlPublica()}/perfil?cancelled=1`,
      }),
    });

    if (!response.ok) {
      log.error("[Stripe] Checkout error:", await response.text());
      throw new Error("Stripe API error");
    }
    const session = await response.json() as { id: string; url: string };
    res.json({ sessionId: session.id, url: session.url });
  } catch (err) {
    log.error("[Stripe] Checkout error:", err);
    res.status(500).json({ error: "checkout_falhou", message: "Não foi possível abrir o pagamento agora." });
  }
});

// ── Portal do cliente ────────────────────────────────────────────────────────

/**
 * Onde a pessoa cancela, troca o cartão e vê as faturas.
 *
 * Existe porque sem ele o cancelamento só acontecia por e-mail para o suporte —
 * e um plano pago que é difícil de cancelar é uma prática que este produto não
 * vai adotar.
 */
router.post("/portal", async (req, res) => {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) return res.status(503).json({ error: "stripe_nao_configurado" });

  const usuario = await verifyUser(String(req.headers.authorization ?? ""));
  if (!usuario) return res.status(401).json({ error: "login_necessario", message: "Entre na sua conta." });

  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${usuario.id}&select=stripe_customer_id&limit=1`, {
      headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
      signal: AbortSignal.timeout(8_000),
    });
    const linhas = r.ok ? await r.json() as Array<{ stripe_customer_id: string | null }> : [];
    const cliente = linhas[0]?.stripe_customer_id;
    if (!cliente) {
      return res.status(404).json({ error: "sem_assinatura", message: "Não encontramos uma assinatura nesta conta." });
    }

    const portal = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${stripeKey}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ customer: cliente, return_url: `${urlPublica()}/perfil` }),
    });
    if (!portal.ok) {
      log.error("[Stripe] portal error:", await portal.text());
      throw new Error("portal");
    }
    const { url } = await portal.json() as { url: string };
    res.json({ url });
  } catch (err) {
    log.error("[Stripe] portal error:", err);
    res.status(500).json({ error: "portal_falhou", message: "Não foi possível abrir a gestão da assinatura." });
  }
});

// ── Webhook ──────────────────────────────────────────────────────────────────

// O Stripe exige o corpo CRU para conferir a assinatura.
router.post("/webhook", raw({ type: "application/json" }), async (req, res) => {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let evento: EventoDoStripe;
  try {
    evento = JSON.parse(req.body.toString()) as EventoDoStripe;
  } catch {
    return res.status(400).json({ error: "Invalid payload" });
  }

  // FAIL-CLOSED: sem o segredo configurado, NÃO processa. Antes, sem o segredo o
  // bloco era pulado e qualquer POST anônimo concederia premium a um user_id
  // arbitrário (metadata.user_id). Melhor recusar do que conceder sem verificar.
  if (!webhookSecret) {
    log.error("[Stripe] STRIPE_WEBHOOK_SECRET ausente — webhook recusado (fail-closed)");
    return res.status(503).json({ error: "webhook_not_configured" });
  }
  const signature = req.headers["stripe-signature"];
  if (!signature) return res.status(400).json({ error: "Missing stripe-signature header" });
  if (!assinaturaValida(req.body as Buffer, String(signature), webhookSecret)) {
    log.warn("[Stripe] Assinatura inválida — webhook rejeitado");
    return res.status(400).json({ error: "Invalid signature" });
  }

  const leitura = lerEventoDoStripe(evento);

  // Quem é o usuário: pelo metadata (só o checkout tem) ou pelo vínculo que
  // guardamos no perfil. Sem este segundo caminho, cancelar não fazia efeito.
  const userId = leitura.userId ?? await usuarioPorCliente(leitura.customerId, leitura.subscriptionId);

  if (!userId) {
    // Responde 200 de propósito: 4xx/5xx faz o Stripe REENVIAR o evento sem
    // parar. Não achar o usuário é um problema nosso, e fica no log.
    log.warn(`[Stripe] ${evento.type}: não achei a conta (customer=${leitura.customerId ?? "-"})`);
    return res.json({ received: true, aplicado: false });
  }

  if (evento.type === "checkout.session.completed") {
    await gravarVinculoStripe(userId, leitura.customerId, leitura.subscriptionId);
  }

  if (leitura.plano) {
    await setUserPlan(userId, leitura.plano);
    log.info(`[Stripe] ${evento.type} → ${leitura.plano} (${leitura.motivo}) para ${userId}`);
  } else {
    log.info(`[Stripe] ${evento.type}: ${leitura.motivo}`);
  }

  res.json({ received: true, aplicado: leitura.plano !== null });
});

export default router;
