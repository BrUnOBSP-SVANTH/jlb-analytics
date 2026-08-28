/**
 * Resolução server-side das previsões DO USUÁRIO + push de re-engajamento.
 *
 * O buraco que isto fecha: as previsões do usuário só eram resolvidas no CLIENTE,
 * quando ele abria o Dashboard. Ou seja — se ele não voltasse, nada resolvia; e
 * sem resolver, não havia nada para trazê-lo de volta. Laço morto: justamente o
 * usuário que sumiu é o que nunca recebia o gancho de retorno.
 *
 * Agora o servidor resolve sozinho, pelo MESMO settlement oficial que a IA usa
 * (Kalshi `result`, Polymarket UMA — nunca chute de preço), e avisa por push:
 * "seu palpite bateu o mercado?". O cliente continua funcionando igual — a
 * sincronia (predictionsSync) já sabe mesclar o que veio resolvido do servidor.
 */
import { SUPABASE_URL, SUPABASE_KEY, supaWriteHeaders } from "./supabaseRest.ts";
import { fetchRealOutcomesBatch } from "./resolveOutcomes.ts";
import { pushToUser, pushEnabled } from "./push.ts";
import { log } from "./log.ts";

interface PendingPrediction {
  id: string;
  user_id: string;
  market_id: string;
  market_question: string;
  market_prob: number;
  user_prob: number;
}

/**
 * Resolve as previsões pendentes contra o resultado OFICIAL e notifica o usuário.
 * Idempotente: só toca linhas com resolved=false, e só quando há resultado oficial.
 */
export async function resolveUserPredictions(limit = 200): Promise<{ resolved: number; notified: number }> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return { resolved: 0, notified: 0 };

  let pending: PendingPrediction[] = [];
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/predictions?resolved=eq.false&select=id,user_id,market_id,market_question,market_prob,user_prob&order=created_at.asc&limit=${limit}`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }, signal: AbortSignal.timeout(8_000) },
    );
    if (!r.ok) return { resolved: 0, notified: 0 };
    pending = await r.json() as PendingPrediction[];
  } catch { return { resolved: 0, notified: 0 }; }

  if (pending.length === 0) return { resolved: 0, notified: 0 };

  // Um lote por mercado distinto (vários usuários podem ter previsto o mesmo).
  const uniqueIds = Array.from(new Set(pending.map((p) => p.market_id)));
  const { outcomes } = await fetchRealOutcomesBatch(uniqueIds);

  let resolved = 0, notified = 0;
  for (const p of pending) {
    const outcome = outcomes.get(p.market_id);
    // Sem resultado oficial ainda (ou consulta falhou) → fica pendente, sem chutar.
    if (outcome !== true && outcome !== false) continue;

    try {
      const up = await fetch(`${SUPABASE_URL}/rest/v1/predictions?id=eq.${p.id}`, {
        method: "PATCH",
        headers: supaWriteHeaders(),
        body: JSON.stringify({
          resolved: true,
          outcome,
          resolution_price: outcome ? 100 : 0,
          resolution_source: "settled",       // procedência: liquidação oficial, não preço inferido
          resolved_at: new Date().toISOString(),
        }),
        signal: AbortSignal.timeout(6_000),
      });
      if (!up.ok) continue;
      resolved++;
    } catch { continue; }

    // Push de re-engajamento: o usuário acertou o LADO? E bateu o mercado?
    if (!pushEnabled()) continue;
    const userSaidYes = Number(p.user_prob) > 50;
    const marketSaidYes = Number(p.market_prob) > 50;
    const userHit = userSaidYes === outcome;
    const marketHit = marketSaidYes === outcome;
    // O gancho forte é ter batido o mercado — não só ter acertado.
    const beatMarket = userHit && !marketHit;

    const sent = await pushToUser(p.user_id, {
      title: beatMarket ? "🎯 Você bateu o mercado!" : userHit ? "✅ Você acertou" : "❌ Não foi dessa vez",
      body: `${p.market_question.slice(0, 70)} — deu ${outcome ? "SIM" : "NÃO"}. `
        + `Você disse ${Math.round(Number(p.user_prob))}%, o mercado ${Math.round(Number(p.market_prob))}%.`,
      url: "/dashboard",
    });
    if (sent > 0) notified++;
  }

  if (resolved > 0) log.info(`[user-preds] ${resolved} previsão(ões) resolvida(s) pelo settlement oficial · ${notified} usuário(s) notificado(s)`);
  return { resolved, notified };
}
