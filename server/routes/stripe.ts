/**
 * Stripe routes — JLB Analytics
 * Checkout session + webhook que atualiza plan no Supabase.
 */

import { Router, raw } from "express";
import crypto from "crypto";

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
    console.warn("[Stripe] Supabase não configurado — plano não atualizado");
    return;
  }
  // Atualiza profiles.plan
  const r1 = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
    method: "PATCH",
    headers: supaHeaders(),
    body: JSON.stringify({ plan }),
  });
  if (!r1.ok) console.error(`[Stripe] profiles update HTTP ${r1.status}`);

  // Atualiza ai_credits.plan (upsert)
  const r2 = await fetch(`${SUPABASE_URL}/rest/v1/ai_credits`, {
    method: "POST",
    headers: { ...supaHeaders(), Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ user_id: userId, plan, used_this_month: 0 }),
  });
  if (!r2.ok) console.error(`[Stripe] ai_credits upsert HTTP ${r2.status}`);
  else console.log(`[Stripe] Plano ${plan} ativado para usuário ${userId}`);
}

// Verifica assinatura HMAC-SHA256 do webhook Stripe
function verifyStripeSignature(payload: Buffer, sigHeader: string, secret: string): boolean {
  const parts = sigHeader.split(",").reduce<Record<string, string>>((acc, part) => {
    const [k, v] = part.split("=");
    if (k && v) acc[k] = v;
    return acc;
  }, {});
  const timestamp = parts["t"];
  const signature = parts["v1"];
  if (!timestamp || !signature) return false;

  // Rejeita webhooks com mais de 5 minutos (replay protection)
  const ts = parseInt(timestamp, 10);
  if (Math.abs(Date.now() / 1000 - ts) > 300) return false;

  const signed = `${timestamp}.${payload.toString("utf-8")}`;
  const expected = crypto.createHmac("sha256", secret).update(signed).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
}

router.post("/checkout", async (req, res) => {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return res.status(503).json({ error: "Stripe not configured. Add STRIPE_SECRET_KEY to .env" });
  }

  interface CheckoutRequest { priceId: string; userId: string; userEmail: string }
  const { priceId, userId, userEmail } = req.body as CheckoutRequest;
  if (!priceId || !userId) return res.status(400).json({ error: "priceId and userId are required" });

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
        "line_items[0][price]": priceId,
        "line_items[0][quantity]": "1",
        "customer_email": userEmail,
        "metadata[user_id]": userId,
        "success_url": `${process.env.APP_URL ?? "http://localhost:3000"}/perfil?success=1`,
        "cancel_url": `${process.env.APP_URL ?? "http://localhost:3000"}/perfil?cancelled=1`,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("[Stripe] Checkout error:", errText);
      throw new Error("Stripe API error");
    }
    interface StripeSession { id: string; url: string }
    const session = await response.json() as StripeSession;
    res.json({ sessionId: session.id, url: session.url });
  } catch (err) {
    console.error("[Stripe] Checkout error:", err);
    res.status(500).json({ error: "Failed to create checkout session" });
  }
});

// Stripe requires raw body for signature verification
router.post("/webhook", raw({ type: "application/json" }), async (req, res) => {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  interface StripeEvent {
    type: string;
    data: {
      object: {
        metadata?: { user_id?: string };
        customer?: string;
        status?: string;
        subscription?: string;
        cancel_at_period_end?: boolean;
      };
    };
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(req.body.toString()) as StripeEvent;
  } catch {
    return res.status(400).json({ error: "Invalid payload" });
  }

  // Verifica assinatura quando STRIPE_WEBHOOK_SECRET está configurado
  if (webhookSecret) {
    const signature = req.headers["stripe-signature"];
    if (!signature) return res.status(400).json({ error: "Missing stripe-signature header" });
    const valid = verifyStripeSignature(req.body as Buffer, String(signature), webhookSecret);
    if (!valid) {
      console.warn("[Stripe] Assinatura inválida — webhook rejeitado");
      return res.status(400).json({ error: "Invalid signature" });
    }
  }

  const userId = event.data.object.metadata?.user_id;

  switch (event.type) {
    case "checkout.session.completed":
      if (userId) await setUserPlan(userId, "premium");
      break;

    case "customer.subscription.deleted":
    case "customer.subscription.paused":
      if (userId) await setUserPlan(userId, "free");
      break;

    case "invoice.payment_failed":
      console.warn(`[Stripe] Pagamento falhou para usuário ${userId ?? "desconhecido"}`);
      break;

    default:
      // Outros eventos ignorados
      break;
  }

  res.json({ received: true });
});

export default router;
