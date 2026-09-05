/**
 * calibrationData.ts — a ponte BANCO ↔ calibração.
 *
 * Contrapartida "suja" (faz I/O) do calibration.ts, que é puro. Aqui ficam as
 * leituras de ai_forecasts que alimentam: o memo de auto-calibração no prompt, o
 * mapa de viés por categoria (loop de calibração em shadow), a régua do go-live
 * e os pesos de déficit que dizem ao seed ONDE a prova ainda é fina.
 *
 * Extraído de aiForecasts.ts, que passou de 781 linhas ao ganhar estas funções.
 *
 * Invariante comum a todas: DEDUPLICAR por mercado (1 forecast, o mais antigo),
 * a mesma regra da view do track record (019). Sem isso, um mercado previsto em
 * 6 dias conta 6× e distorce viés, déficit e medição.
 */
import { buscarTudo } from "./supaPaginado.ts";
import { SUPABASE_URL, SUPABASE_KEY } from "./supabaseRest.ts";
import { getCache, setCache } from "./cache.ts";
import {
  computeCategoryBiases, normalizeCategory, deficitWeight,
  type BiasMap, type CanonicalCategory,
} from "./ai/calibration.ts";

/**
 * A INVARIANTE do módulo: 1 previsão por mercado, a mais ANTIGA — mesma regra da
 * view do track record (migration 019).
 *
 * Estava copiada em QUATRO funções deste arquivo, palavra por palavra. É o tipo de
 * duplicação que não dá erro: se uma cópia divergir, os números continuam saindo,
 * só que errados e diferentes entre si. E o custo de errar aqui já foi medido — o
 * backtest sem dedup deu +5,4% e o correto, +3,1%: um mercado previsto em 6 dias
 * contava 6 vezes.
 *
 * Desempate por `created_at` quando a data da previsão empata, para a escolha ser
 * determinística em vez de depender da ordem que o banco devolveu.
 */
export function dedupPorMercado<T extends { market_id: string; forecast_date: string; created_at: string }>(
  rows: T[],
): T[] {
  const maisAntiga = new Map<string, T>();
  for (const r of rows) {
    const atual = maisAntiga.get(r.market_id);
    if (!atual
      || r.forecast_date < atual.forecast_date
      || (r.forecast_date === atual.forecast_date && r.created_at < atual.created_at)) {
      maisAntiga.set(r.market_id, r);
    }
  }
  return Array.from(maisAntiga.values());
}

/**
 * Régua do go-live da calibração. Extraída para poder ser testada sem banco: é
 * ela que encoda a lição de 29/08 — promover exige ganhar do CRU **e** do MERCADO,
 * com amostra. Naquela vez promovemos com "melhora o cru" e perdemos 7,7%.
 */
export function vereditoCalibracao(n: number, shadow: number, cru: number, mercado: number): string {
  if (n < 30) return `amostra pequena (${n}/30) — ainda medindo`;
  if (shadow < cru && shadow < mercado) return "calibração VENCE cru e mercado — candidata a go-live";
  if (shadow < cru) return "melhora o cru, mas ainda não bate o mercado";
  return "não melhorou — NÃO promover";
}

/** Régua do experimento da divergência. Mesma ideia: testável sem banco. */
export function vereditoBold(n: number, nDiverged: number, bold: number, prod: number, mercado: number): string {
  if (n < 30) return `amostra pequena (${n}/30) — ainda medindo`;
  if (nDiverged < 10) return `divergiu pouco (${nDiverged} de ${n}) — o modelo concorda com o mercado mesmo SEM a trava, o que já é uma resposta`;
  if (bold < mercado && bold < prod) return "DIVERGIR PAGOU — bateu o mercado e a versão travada. Candidato a virar produção.";
  if (bold < prod) return "melhor que a versão travada, mas ainda não bate o mercado";
  return "divergir PIOROU — a trava estava certa. Não promover.";
}

// ── Auto-calibração: o viés medido nas resolvidas volta para o prompt ────────
// Erro médio assinado (estimativa − resultado) é a medida padrão de viés de
// calibração. Injetado nos prompts de fair value, fecha o loop: a IA corrige
// na direção oposta ao erro que ELA MESMA cometeu no track record público.
export async function getCalibrationMemo(): Promise<string> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return "";
  const cached = getCache<string>("ai-calibration-memo");
  if (cached !== null) return cached;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/ai_forecasts?resolved=eq.true&select=ai_fair_value,market_prob,outcome&order=resolved_at.desc&limit=200`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }, signal: AbortSignal.timeout(6_000) },
    );
    if (!res.ok) return "";
    const rows = await res.json() as Array<{ ai_fair_value: number; market_prob: number; outcome: boolean }>;
    if (rows.length < 5) { setCache("ai-calibration-memo", "", 3600); return ""; }

    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const aiErr = mean(rows.map((r) => r.ai_fair_value - (r.outcome ? 100 : 0)));
    const mktErr = mean(rows.map((r) => r.market_prob - (r.outcome ? 100 : 0)));
    const aiBrier = mean(rows.map((r) => (r.ai_fair_value / 100 - (r.outcome ? 1 : 0)) ** 2));
    const dir = aiErr > 2 ? "SUPERESTIMAR probabilidades" : aiErr < -2 ? "SUBESTIMAR probabilidades" : "viés direcional pequeno";
    const sign = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}`;

    const memo = `AUTO-CALIBRAÇÃO (medida no nosso track record público, ${rows.length} previsões resolvidas):
- Erro médio assinado da nossa IA: ${sign(aiErr)}pp (tendência histórica a ${dir}); do mercado: ${sign(mktErr)}pp.
- Brier da nossa IA: ${aiBrier.toFixed(3)} (mercado costuma ser mais calibrado).
- Antes de responder, corrija seu palpite na direção OPOSTA ao viés medido acima.`;
    setCache("ai-calibration-memo", memo, 3600);
    return memo;
  } catch { return ""; }
}

/**
 * Mapa de viés POR CATEGORIA (shadow do loop de calibração). Upgrade do memo
 * global acima: aquele é agregado (~0, porque crypto −15pp e política +21pp se
 * cancelam) e via prompt (a LLM não obedece "desloque Xpp"); este é por categoria
 * e determinístico. Lê os resolvidos e aplica o gating de calibration.ts. Cache 6h.
 */
export async function getCategoryBiasMap(): Promise<BiasMap> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return {};
  const cached = getCache<BiasMap>("ai-category-bias-map");
  if (cached !== null) return cached;
  try {
    // ⚠️ Paginado: o PostgREST corta em 1.000 linhas EM SILÊNCIO (pedir 2000
    // devolve 200 OK com 1000). Ver lib/supaPaginado.ts.
    const rows = await buscarTudo<{ market_id: string; ai_fair_value: number; outcome: boolean; category: string | null; forecast_date: string; created_at: string }>(
      "ai_forecasts",
      "resolved=eq.true&outcome=not.is.null&select=market_id,ai_fair_value,outcome,category,forecast_date,created_at&order=resolved_at.desc",
    );
    if (rows.length === 0) return {};
    // Dedup: 1 forecast por mercado (o mais ANTIGO), igual à view do track record
    // (019). Sem isso, um mercado previsto em 6 dias contaria 6× e distorceria o
    // viés — foi o que o item #3 revelou (backtest bruto +5,4% vs deduplicado +3,1%).
    const deduped = dedupPorMercado(rows).map((r) => ({ fairValue: Number(r.ai_fair_value), outcome: r.outcome, category: r.category }));
    const map = computeCategoryBiases(deduped);
    setCache("ai-category-bias-map", map, 6 * 3600);
    return map;
  } catch { return {}; }
}

/**
 * Status do loop de calibração em SHADOW — a régua do go-live, sem SQL na mão.
 *
 * Devolve (a) o mapa de viés ativo (quais categorias estão sendo corrigidas) e
 * (b) a medição do shadow: Brier cru vs calibrado vs mercado, DEDUPLICADO por
 * mercado (1 forecast, o mais antigo — igual à view do track record; sem isso a
 * repetição do mesmo mercado infla o resultado). Só conta linhas que têm shadow
 * gravado, ou seja, forecasts criados DEPOIS do shadow ligar = out-of-sample real.
 */
/**
 * Veredito do EXPERIMENTO DA DIVERGÊNCIA (migration 024).
 *
 * Responde a pergunta que hoje não tem resposta: divergir do mercado PAGA? A
 * estimativa "bold" pode se afastar do preço (com motivo); a de produção não pode.
 * Comparamos as duas contra o resultado real, no MESMO conjunto — e só nos
 * mercados em que ela de fato divergiu, senão estaríamos medindo concordância.
 */
export async function getBoldExperimentStatus(): Promise<{
  available: boolean;
  n?: number; nDiverged?: number;
  boldBrier?: number; prodBrier?: number; marketBrier?: number;
  avgDeviationPp?: number; verdict?: string;
}> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return { available: false };
  try {
    // ⚠️ SÓ v2. O prompt v1 não explicava a convenção do título e o modelo
    // respondia a pergunta errada ("o jogo vai acontecer?" em vez de "A vence?"),
    // gerando desvios de ~38pp que mediam um bug, não a hipótese. As linhas v1
    // ficam no banco como registro, mas fora da medição.
    const rows = await buscarTudo<{ market_id: string; ai_fair_value: number; ai_fair_value_bold: number; market_prob: number; outcome: boolean; forecast_date: string; created_at: string }>(
      "ai_forecasts",
      "resolved=eq.true&outcome=not.is.null&ai_fair_value_bold=not.is.null&bold_prompt_v=gte.2"
      + "&select=market_id,ai_fair_value,ai_fair_value_bold,market_prob,outcome,forecast_date,created_at&order=created_at.asc",
    );
    if (rows.length === 0) return { available: false };

    // Dedup por mercado (regra da view 019) — repetição infla o resultado.
    const d = dedupPorMercado(rows);
    if (d.length === 0) return { available: true, n: 0, verdict: "nenhuma previsão ousada resolvida ainda" };

    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const sq = (p: number, y: number) => (Number(p) / 100 - y) ** 2;
    const ys = d.map((x) => (x.outcome ? 1 : 0));
    const round = (v: number, p = 4) => Number(v.toFixed(p));

    const boldBrier = mean(d.map((x, i) => sq(x.ai_fair_value_bold, ys[i])));
    const prodBrier = mean(d.map((x, i) => sq(x.ai_fair_value, ys[i])));
    const marketBrier = mean(d.map((x, i) => sq(x.market_prob, ys[i])));
    const devs = d.map((x) => Math.abs(Number(x.ai_fair_value_bold) - Number(x.market_prob)));
    // Só conta como "divergiu" um afastamento maior que a trava da produção (3pp).
    const nDiverged = devs.filter((v) => v >= 3).length;

    const verdict = vereditoBold(d.length, nDiverged, boldBrier, prodBrier, marketBrier);

    return {
      available: true, n: d.length, nDiverged,
      boldBrier: round(boldBrier), prodBrier: round(prodBrier), marketBrier: round(marketBrier),
      avgDeviationPp: round(mean(devs), 1), verdict,
    };
  } catch { return { available: false }; }
}

export async function getCalibrationStatus(): Promise<{
  available: boolean;
  biasMap?: BiasMap;
  measured?: { n: number; rawBrier: number; shadowBrier: number; marketBrier: number; skillVsMarket: number; verdict: string };
}> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return { available: false };
  try {
    const biasMap = await getCategoryBiasMap();
    const rows = await buscarTudo<{ market_id: string; ai_fair_value: number; ai_fair_value_calibrated: number; market_prob: number; outcome: boolean; forecast_date: string; created_at: string }>(
      "ai_forecasts",
      "resolved=eq.true&outcome=not.is.null&ai_fair_value_calibrated=not.is.null"
      + "&select=market_id,ai_fair_value,ai_fair_value_calibrated,market_prob,outcome,forecast_date,created_at&order=created_at.asc",
    );
    if (rows.length === 0) return { available: true, biasMap };

    // Dedup por mercado (o mais antigo) — mesma regra da view 019.
    const d = dedupPorMercado(rows);
    if (d.length === 0) return { available: true, biasMap };

    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const sq = (p: number, y: number) => (p / 100 - y) ** 2;
    const ys = d.map((x) => (x.outcome ? 1 : 0));
    const rawBrier = mean(d.map((x, i) => sq(Number(x.ai_fair_value), ys[i])));
    const shadowBrier = mean(d.map((x, i) => sq(Number(x.ai_fair_value_calibrated), ys[i])));
    const marketBrier = mean(d.map((x, i) => sq(Number(x.market_prob), ys[i])));
    const skill = marketBrier > 0 ? 1 - shadowBrier / marketBrier : 0;

    const round = (v: number, p = 4) => Number(v.toFixed(p));
    return {
      available: true,
      biasMap,
      measured: {
        n: d.length,
        rawBrier: round(rawBrier), shadowBrier: round(shadowBrier), marketBrier: round(marketBrier),
        skillVsMarket: round(skill, 3),
        // Régua honesta do go-live: precisa ganhar do CRU e do MERCADO, com amostra.
        verdict: vereditoCalibracao(d.length, shadowBrier, rawBrier, marketBrier),
      },
    };
  } catch { return { available: false }; }
}

/**
 * Peso de DÉFICIT por categoria — onde a amostra ainda é fina.
 *
 * O gargalo real (medido em 2026-08-27): esports já tem 82 resolvidos e economia
 * tem 2, mas o seed não sabia disso e continuava enchendo o que já estava
 * saturado. Sem n≥30 por categoria (o mesmo limiar que a plataforma exige para
 * Brier estável) não dá para calibrar por segmento — trava os itens 01 e 05.
 *
 * Peso contínuo: categoria zerada vale ~4×, categoria já em 30+ vale 1× (sem
 * boost). Deduplicado por mercado, como a view do track record.
 */
export async function getCategoryDeficitWeights(target = 30): Promise<Map<CanonicalCategory, number>> {
  const cached = getCache<Array<[CanonicalCategory, number]>>("ai-category-deficits");
  if (cached !== null) return new Map(cached);
  const weights = new Map<CanonicalCategory, number>();
  if (!SUPABASE_URL || !SUPABASE_KEY) return weights;
  try {
    const rows = await buscarTudo<{ market_id: string; category: string | null; forecast_date: string; created_at: string }>(
      "ai_forecasts",
      "resolved=eq.true&outcome=not.is.null&select=market_id,category,forecast_date,created_at&order=created_at.asc",
    );
    if (rows.length === 0) return weights;

    const counts = new Map<CanonicalCategory, number>();
    for (const row of dedupPorMercado(rows)) {
      const b = normalizeCategory(row.category);
      counts.set(b, (counts.get(b) ?? 0) + 1);
    }
    // Toda categoria conhecida entra: as ausentes (n=0) são justamente as que mais precisam.
    for (const b of ["crypto", "politics", "sports", "tennis", "esports", "culture", "economy", "science", "climate", "other"] as CanonicalCategory[]) {
      weights.set(b, deficitWeight(counts.get(b) ?? 0, target));
    }
    setCache("ai-category-deficits", Array.from(weights.entries()), 6 * 3600);
    return weights;
  } catch { return weights; }
}
