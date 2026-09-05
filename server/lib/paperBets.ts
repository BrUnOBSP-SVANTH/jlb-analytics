/**
 * Liquidação da banca simulada.
 *
 * O buraco que isto fecha: até aqui, a pessoa registrava uma aposta fictícia e
 * o resultado NUNCA chegava. O "portfólio" só marcava a variação do preço — que
 * balança todo dia e nunca vira veredito. Sem desfecho não há aprendizado: a
 * lição de um mercado de previsão está em ver a conta fechar.
 *
 * Agora o servidor fecha sozinho, contra o resultado OFICIAL da plataforma
 * (Kalshi `result`, Polymarket UMA — nunca chute de preço), o mesmo settlement
 * que já julga a IA e as previsões do usuário. Se a plataforma ainda não pagou,
 * a aposta continua aberta: o pior caso é "ainda não sei", jamais um resultado
 * inventado que credita dinheiro que ninguém pagou.
 *
 * A conta do pagamento vem de shared/banca.ts — a MESMA que o navegador usa para
 * mostrar o retorno antes da aposta. Duas implementações divergiriam em silêncio,
 * e o usuário veria um número na tela e receberia outro na banca.
 */
import { SUPABASE_URL, SUPABASE_KEY, supaWriteHeaders } from "./supabaseRest.ts";
import { fetchRealOutcomesBatch } from "./resolveOutcomes.ts";
import { pushToUser, pushEnabled } from "./push.ts";
// Caminho relativo, não o alias `@shared`: o servidor roda em node cru (dev) e
// em bundle esbuild (produção), e nenhum dos dois conhece o alias do Vite.
import { pagamento, lucroSeAcertar, reais, type Lado } from "../../shared/banca.ts";
import { log } from "./log.ts";

interface ApostaPendente {
  id: string;
  user_id: string;
  market_id: string;
  market_question: string;
  source: string;
  side: Lado;
  entry_price: number;
  stake: number;
}

/**
 * Liquida as apostas abertas cujo mercado já resolveu oficialmente.
 * Idempotente: só toca linhas com resolved=false, e só quando há desfecho oficial.
 */
export async function resolvePaperBets(limite = 300): Promise<{ liquidadas: number; avisadas: number }> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return { liquidadas: 0, avisadas: 0 };

  let pendentes: ApostaPendente[] = [];
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/paper_bets?resolved=eq.false`
      + `&select=id,user_id,market_id,market_question,source,side,entry_price,stake`
      + `&order=created_at.asc&limit=${limite}`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }, signal: AbortSignal.timeout(8_000) },
    );
    if (!r.ok) return { liquidadas: 0, avisadas: 0 };
    pendentes = await r.json() as ApostaPendente[];
  } catch { return { liquidadas: 0, avisadas: 0 }; }

  if (pendentes.length === 0) return { liquidadas: 0, avisadas: 0 };

  // Um lote por mercado distinto — vários usuários apostam no mesmo evento.
  const mercados = Array.from(new Set(pendentes.map((a) => a.market_id)));
  const { outcomes } = await fetchRealOutcomesBatch(mercados);

  let liquidadas = 0, avisadas = 0;
  for (const p of pendentes) {
    const desfecho = outcomes.get(p.market_id);
    // Ainda sem resultado oficial (ou a consulta falhou) → segue aberta, sem chutar.
    if (desfecho !== true && desfecho !== false) continue;

    const aposta = {
      lado: p.side,
      precoEntrada: Number(p.entry_price),
      valor: Number(p.stake),
      desfecho,
    };
    const pago = pagamento(aposta);
    if (pago === null) continue;      // impossível aqui, mas nunca gravamos payout sem desfecho
    const acertou = pago > 0;

    try {
      const up = await fetch(`${SUPABASE_URL}/rest/v1/paper_bets?id=eq.${p.id}&resolved=eq.false`, {
        method: "PATCH",
        headers: supaWriteHeaders(),
        body: JSON.stringify({
          resolved: true,
          outcome: desfecho,
          payout: Number(pago.toFixed(2)),
          // Procedência do número, para o site poder dizer DE ONDE veio o veredito.
          resolution_source: p.source === "kalshi" ? "kalshi_result" : "polymarket_uma",
          settled_at: new Date().toISOString(),
        }),
        signal: AbortSignal.timeout(6_000),
      });
      if (!up.ok) continue;
      liquidadas++;
    } catch { continue; }

    if (!pushEnabled()) continue;
    const lucro = acertou ? lucroSeAcertar(aposta) : -aposta.valor;
    const enviados = await pushToUser(p.user_id, {
      title: acertou ? `🟢 Sua aposta pagou ${reais(pago)}` : "🔴 Sua aposta não pagou",
      body: `${p.market_question.slice(0, 70)} — deu ${desfecho ? "SIM" : "NÃO"}. `
        + `${acertou ? "Lucro" : "Perda"} de ${reais(Math.abs(lucro))} na sua banca.`,
      url: "/portfolio",
    });
    if (enviados > 0) avisadas++;
  }

  if (liquidadas > 0) {
    log.info(`[banca] ${liquidadas} aposta(s) simulada(s) liquidada(s) pelo resultado oficial · ${avisadas} usuário(s) avisado(s)`);
  }
  return { liquidadas, avisadas };
}
