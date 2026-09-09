/**
 * Histórico de calibração DO USUÁRIO, reconstruído no servidor.
 *
 * O QUE ISTO CONSERTA. A série que alimenta o gráfico de evolução no Dashboard
 * era montada no navegador e guardada em `localStorage`: um retrato por dia,
 * acumulado ao longo de meses. Trocar de aparelho ou limpar o navegador apagava
 * a série inteira — e ela não tinha como ser reconstruída, porque cada ponto era
 * um retrato do passado que ninguém mais guardava.
 *
 * O detalhe que torna isto melhor, e não só "igual porém no servidor": a série
 * é RECALCULADA a partir das previsões, que já vivem na conta com a data de
 * resolução e o Brier de cada uma. Ou seja, dá para reconstruir a história
 * inteira — inclusive de quem nunca teve o histórico local, ou de quem o perdeu.
 * A versão do navegador só sabia registrar dali para a frente.
 *
 * A conta é acumulada de propósito: o ponto do dia D é o Brier médio de TUDO que
 * resolveu até D, não só do que resolveu naquele dia. É o que mostra a
 * calibração melhorando (ou piorando) com o tempo; um Brier diário isolado
 * oscilaria demais com 2 ou 3 resoluções e não diria nada.
 */
import { SUPABASE_URL, SUPABASE_KEY } from "./supabaseRest.ts";

/** Um ponto da série — mesmo formato que o gráfico já consome. */
export interface PontoCalibracao {
  date: string;              // AAAA-MM-DD
  meanBrier: number | null;
  skillScore: number | null;
  resolvedCount: number;
  totalCount: number;
}

/** ~3 meses, como na versão local: além disso o gráfico vira borrão. */
export const MAX_PONTOS = 90;

/**
 * O Brier de uma previsão perfeita é 0 e o de um chute (50%) é 0,25. O skill
 * compara com o chute: 1 = perfeito, 0 = tão bom quanto chutar, negativo = pior
 * que chutar. É o número que diz se estudar adiantou.
 */
const BRIER_DO_CHUTE = 0.25;

export interface LinhaPrevisao {
  brier_score: number | string | null;
  resolved_at: string | null;
  resolved: boolean;
}

/**
 * Monta a série acumulada. Função pura: recebe as linhas, devolve os pontos —
 * o que permite testá-la sem banco, e é onde mora a regra que importa.
 */
export function montarSerie(linhas: LinhaPrevisao[]): PontoCalibracao[] {
  const total = linhas.length;

  // Só o que resolveu E tem nota entra na série; o resto não tem o que dizer
  // sobre calibração.
  const resolvidas = linhas
    .filter((l) => l.resolved && l.resolved_at && l.brier_score !== null)
    .map((l) => ({ dia: String(l.resolved_at).slice(0, 10), brier: Number(l.brier_score) }))
    .filter((l) => Number.isFinite(l.brier) && /^\d{4}-\d{2}-\d{2}$/.test(l.dia))
    .sort((a, b) => a.dia.localeCompare(b.dia));

  if (resolvidas.length === 0) return [];

  const pontos: PontoCalibracao[] = [];
  let soma = 0, n = 0;

  for (let i = 0; i < resolvidas.length; i++) {
    soma += resolvidas[i].brier;
    n += 1;

    // Um ponto por DIA, não por previsão: se três resolveram no mesmo dia, o
    // ponto do dia já sai com as três dentro. Sem isto o gráfico teria três
    // pontos empilhados na mesma data.
    const ehUltimaDoDia = i === resolvidas.length - 1 || resolvidas[i + 1].dia !== resolvidas[i].dia;
    if (!ehUltimaDoDia) continue;

    const media = soma / n;
    pontos.push({
      date: resolvidas[i].dia,
      meanBrier: Number(media.toFixed(4)),
      skillScore: Number((1 - media / BRIER_DO_CHUTE).toFixed(4)),
      resolvedCount: n,
      totalCount: total,
    });
  }

  return pontos.slice(-MAX_PONTOS);
}

/** Busca as previsões do usuário e devolve a série pronta. */
export async function serieDoUsuario(userId: string): Promise<PontoCalibracao[]> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return [];
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/predictions?user_id=eq.${encodeURIComponent(userId)}`
      + `&select=brier_score,resolved_at,resolved&order=resolved_at.asc&limit=2000`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }, signal: AbortSignal.timeout(8_000) },
    );
    if (!r.ok) return [];
    return montarSerie(await r.json() as LinhaPrevisao[]);
  } catch {
    return [];
  }
}
