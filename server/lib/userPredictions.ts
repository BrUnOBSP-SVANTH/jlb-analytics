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
import { idDeLiquidacao } from "../../shared/liquidacao.ts";

interface PendingPrediction {
  id: string;
  user_id: string;
  market_id: string;
  market_question: string;
  market_prob: number;
  user_prob: number;
  /** Desfecho analisado em mercado de vários (migration 030). Nulo = binária. */
  outcome_id: string | null;
}

/**
 * Resolve as previsões pendentes contra o resultado OFICIAL e notifica o usuário.
 * Idempotente: só toca linhas com resolved=false, e só quando há resultado oficial.
 */
export async function resolveUserPredictions(limit = 200): Promise<{ resolved: number; notified: number }> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return { resolved: 0, notified: 0 };

  let pending: PendingPrediction[];
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/predictions?resolved=eq.false&select=id,user_id,market_id,market_question,market_prob,user_prob,outcome_id&order=created_at.asc&limit=${limit}`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }, signal: AbortSignal.timeout(8_000) },
    );
    if (!r.ok) return { resolved: 0, notified: 0 };
    pending = await r.json() as PendingPrediction[];
  } catch { return { resolved: 0, notified: 0 }; }

  if (pending.length === 0) return { resolved: 0, notified: 0 };

  /**
   * ⚠️ O id que liquida CADA previsão, e não o market_id de todas.
   *
   * Até 14/09 este job resolvia tudo pelo market_id. Com previsão de DESFECHO no
   * banco (migration 030), isso aplicaria o SIM/NÃO do LÍDER a uma previsão de
   * "Aston Villa" — Brier errado, gravado como oficial, e um push de "✅ Você
   * acertou" no dia em que o Barcelona fosse campeão. A regra mora em
   * shared/liquidacao.ts, a MESMA que o cliente aplica: binária pelo mercado,
   * desfecho do Kalshi pelo ticker do desfecho, desfecho do Polymarket fica
   * pendente (resolve à mão).
   */
  const alvos = pending
    .map((p) => ({ p, id: idDeLiquidacao({ marketId: p.market_id, outcomeId: p.outcome_id }) }))
    .filter((x): x is { p: PendingPrediction; id: string } => x.id !== null);
  if (alvos.length === 0) return { resolved: 0, notified: 0 };

  // Um lote por id distinto (vários usuários podem ter previsto o mesmo).
  const uniqueIds = Array.from(new Set(alvos.map((x) => x.id)));
  const { outcomes } = await fetchRealOutcomesBatch(uniqueIds);

  let resolved = 0, notified = 0;
  for (const { p, id } of alvos) {
    const outcome = outcomes.get(id);
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
