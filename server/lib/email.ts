/**
 * email.ts — envio de email via Resend (JLB Analytics)
 *
 * Degrada graciosamente: sem RESEND_API_KEY, vira no-op e loga um aviso.
 * Adicione ao .env para ativar:
 *   RESEND_API_KEY=re_xxxxx
 *   EMAIL_FROM="JLB Analytics <briefing@seudominio.com>"
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY ?? "";
const EMAIL_FROM = process.env.EMAIL_FROM ?? "JLB Analytics <onboarding@resend.dev>";

export function emailEnabled(): boolean {
  return RESEND_API_KEY.length > 0;
}

export async function sendEmail(opts: { to: string; subject: string; html: string }): Promise<{ ok: boolean; reason?: string }> {
  if (!RESEND_API_KEY) return { ok: false, reason: "RESEND_API_KEY ausente" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: EMAIL_FROM, to: opts.to, subject: opts.subject, html: opts.html }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { ok: false, reason: `Resend HTTP ${res.status}: ${t.slice(0, 120)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "unknown" };
  }
}

// ── Template do Resumo Semanal ────────────────────────────────────────────────

interface DigestData {
  trackRecord: { resolvedCount: number; aiBrier: number | null; marketBrier: number | null; beatMarketPct: number | null } | null;
  topDivergences: Array<{ marketId: string; source: string; title: string; currentProb: number; aiFairValue: number; edge: number }>;
  closingSoon: Array<{ title: string; prob: number; daysLeft: number }>;
}

export function renderWeeklyDigestHtml(d: DigestData, appUrl: string): string {
  const tr = d.trackRecord;
  const trackBlock = tr && tr.resolvedCount >= 5 && tr.aiBrier != null
    ? `<tr><td style="padding:16px;background:#16161a;border-radius:10px">
         <p style="margin:0 0 6px;color:#c8a227;font-weight:700;font-size:13px">📊 Track record da nossa IA</p>
         <p style="margin:0;color:#aaa;font-size:13px">Brier da IA <b style="color:#fff">${tr.aiBrier.toFixed(3)}</b> vs mercado <b>${tr.marketBrier?.toFixed(3) ?? "—"}</b> · bateu o mercado em <b style="color:#22c55e">${tr.beatMarketPct}%</b> das ${tr.resolvedCount} previsões resolvidas.</p>
       </td></tr><tr><td style="height:12px"></td></tr>`
    : "";

  const divRows = d.topDivergences.map((x) => {
    const slug = x.marketId.replace(/^(poly-|kalshi-)/, "");
    const href = `${appUrl}/apostas/${x.source === "kalshi" ? "kalshi-" : "poly-"}${slug}`;
    const color = x.edge > 0 ? "#22c55e" : "#ef4444";
    return `<tr><td style="padding:10px 0;border-bottom:1px solid #26262c">
      <a href="${href}" style="color:#eee;text-decoration:none;font-size:13px;font-weight:600">${x.title.slice(0, 70)}</a>
      <div style="color:#888;font-size:12px;margin-top:3px">Mercado ${x.currentProb}% · JLB ${x.aiFairValue}% · <b style="color:${color}">${x.edge > 0 ? "+" : ""}${x.edge}pp</b></div>
    </td></tr>`;
  }).join("");

  const closingRows = d.closingSoon.map((x) =>
    `<tr><td style="padding:6px 0;color:#aaa;font-size:12px">⏳ ${x.daysLeft}d — ${x.title.slice(0, 60)} <b style="color:#fff">${x.prob}%</b></td></tr>`
  ).join("");

  return `<!doctype html><html><body style="margin:0;background:#0d0d0f;font-family:-apple-system,Segoe UI,Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;padding:24px">
    <tr><td>
      <p style="color:#c8a227;font-weight:800;font-size:18px;margin:0 0 4px">JLB Analytics</p>
      <p style="color:#888;font-size:13px;margin:0 0 20px">Seu resumo semanal de mercados preditivos</p>
    </td></tr>
    ${trackBlock}
    <tr><td><p style="color:#c8a227;font-weight:700;font-size:13px;margin:0 0 8px">🎯 Onde a JLB discorda do mercado</p></td></tr>
    <tr><td><table width="100%">${divRows || '<tr><td style="color:#666;font-size:12px;padding:8px 0">Sem divergências relevantes esta semana.</td></tr>'}</table></td></tr>
    <tr><td style="height:18px"></td></tr>
    ${d.closingSoon.length > 0 ? `<tr><td><p style="color:#c8a227;font-weight:700;font-size:13px;margin:0 0 8px">Encerrando em breve</p></td></tr><tr><td><table width="100%">${closingRows}</table></td></tr>` : ""}
    <tr><td style="height:24px"></td></tr>
    <tr><td style="text-align:center">
      <a href="${appUrl}/apostas" style="display:inline-block;background:#c8a227;color:#0d0d0f;text-decoration:none;font-weight:700;font-size:13px;padding:10px 22px;border-radius:8px">Ver mercados ao vivo</a>
    </td></tr>
    <tr><td style="padding-top:20px">
      <p style="color:#555;font-size:11px;margin:0;text-align:center">Caráter educacional — não é recomendação de investimento ou aposta.<br/>
      Para parar de receber, ajuste em Perfil → Notificações no app.</p>
    </td></tr>
  </table></body></html>`;
}
