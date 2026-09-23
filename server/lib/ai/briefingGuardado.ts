/**
 * O briefing do dia, guardado — para não ser pago duas vezes.
 *
 * POR QUE EXISTE (Auditoria 21/09, SEG-02). O briefing custa uma chamada de IA
 * mais NewsAPI (100 por dia no plano grátis), Polymarket, Kalshi e BCB. Ele
 * ficava só na memória do processo, então cada deploy — e cada vez que o plano
 * grátis do Render deixava o serviço dormir — jogava fora o do dia e a próxima
 * visita pagava tudo de novo.
 *
 * Aqui ele vira uma linha por dia de Brasília, e o deploy deixa de custar.
 *
 * Falha nunca derruba o briefing: se o banco não responder, a tela continua
 * recebendo o conteúdo gerado; só perdemos a economia daquela vez.
 */
import { SUPABASE_URL, SUPABASE_KEY, supaWriteHeaders } from "../supabaseRest.ts";
import { log } from "../log.ts";

export async function lerBriefingDoDia(dia: string): Promise<Record<string, unknown> | null> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/briefing_do_dia?dia=eq.${encodeURIComponent(dia)}&select=conteudo&limit=1`,
      {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
        signal: AbortSignal.timeout(8_000),
      },
    );
    if (!r.ok) return null;
    const linhas = await r.json() as Array<{ conteudo: Record<string, unknown> }>;
    return linhas[0]?.conteudo ?? null;
  } catch { return null; }
}

export async function gravarBriefingDoDia(dia: string, conteudo: Record<string, unknown>): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/briefing_do_dia?on_conflict=dia`, {
      method: "POST",
      headers: supaWriteHeaders(),
      body: JSON.stringify([{ dia, conteudo }]),
      signal: AbortSignal.timeout(8_000),
    });
  } catch (e) {
    log.warn("briefing", `não consegui guardar o briefing de ${dia}: ${String(e)}`);
  }
}
