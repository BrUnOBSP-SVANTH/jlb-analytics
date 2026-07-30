import { emailEnabled, sendEmail, renderWeeklyDigestHtml } from "../email.ts";
import { SUPABASE_URL, SUPABASE_KEY } from "../supabaseRest.ts";
import { computeDivergences, getTrackRecordData, getClosingSoon } from "../aiForecasts.ts";
import { log } from "../log.ts";

/** Monta o digest semanal — usado tanto pelo endpoint quanto pelo email. */
export async function buildDigest() {
  const [divergences, trackRecord] = await Promise.all([computeDivergences(), getTrackRecordData()]);
  return {
    generatedAt: new Date().toISOString(),
    trackRecord,
    topDivergences: divergences.slice(0, 5),
    closingSoon: getClosingSoon(),
  };
}

/** Envia o Resumo Semanal por email aos usuários que optaram. No-op sem RESEND_API_KEY. */
export async function sendWeeklyDigests(): Promise<{ sent: number; skipped: string }> {
  if (!emailEnabled()) return { sent: 0, skipped: "RESEND_API_KEY ausente" };
  if (!SUPABASE_URL || !SUPABASE_KEY) return { sent: 0, skipped: "supabase ausente" };
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_digest_recipients`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(8_000),
    });
    if (!r.ok) return { sent: 0, skipped: `rpc HTTP ${r.status}` };
    const recipients = await r.json() as Array<{ user_id: string; email: string }>;
    if (recipients.length === 0) return { sent: 0, skipped: "nenhum inscrito" };

    const digest = await buildDigest();
    const appUrl = process.env.APP_URL ?? "http://localhost:3000";
    const html = renderWeeklyDigestHtml(digest, appUrl);
    const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

    let sent = 0;
    for (const rec of recipients) {
      const result = await sendEmail({ to: rec.email, subject: "Seu resumo semanal — JLB Analytics", html });
      if (result.ok) {
        sent++;
        // marca como enviado
        await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${rec.user_id}`, {
          method: "PATCH",
          headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
          body: JSON.stringify({ last_digest_sent_at: new Date().toISOString() }),
        }).catch(() => {});
      }
      await sleep(400); // throttle (Resend free: ~2 req/s)
    }
    log.info(`[weekly-digest] ${sent}/${recipients.length} emails enviados`);
    return { sent, skipped: "" };
  } catch (e) {
    return { sent: 0, skipped: e instanceof Error ? e.message : "erro" };
  }
}
