/**
 * own-estimate.mjs — uma estimativa NOSSA, sem copiar o preço do mercado.
 *
 * POR QUE EXISTE. A estimativa de produção fica a ±3pp do preço por projeto, e o
 * experimento cego provou (n=46, t=−2,12, IC sem cruzar zero) que soltar uma LLM
 * do preço piora 34%. Mas "LLM chutando sozinha" não é a única forma de ter número
 * próprio. Este script tenta a outra: um modelo estatístico treinado no NOSSO banco
 * de resolvidos, usando só variáveis que NÃO são o preço atual.
 *
 * O QUE ELE PODE E O QUE NÃO PODE. Sem o preço, as variáveis disponíveis
 * (categoria, confiança, horizonte, fonte) descrevem o SEGMENTO, não o evento. Um
 * modelo assim aprende taxa-base por segmento — "mercados de esporte com este
 * horizonte resolvem SIM 46% das vezes" — e não sabe distinguir dois jogos da mesma
 * categoria. É o teto teórico da abordagem, não uma falha de execução, e o número
 * abaixo mede exatamente esse teto.
 *
 * MÉTODO. Corte TEMPORAL (treina no passado, testa no futuro) — leave-one-out
 * inflaria, como já aconteceu aqui. Suavização de Laplace para segmento com pouca
 * amostra não virar 0% ou 100%. Comparado contra três réguas: o mercado, a taxa-base
 * global (o "chute constante") e a nossa produção.
 *
 * Uso: pnpm own:estimate
 */
import { readFileSync } from "node:fs";

const env = Object.fromEntries(readFileSync(".env", "utf8").split("\n")
  .filter((l) => l.trim() && !l.startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const URL = env.VITE_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

const rows = await (await fetch(
  `${URL}/rest/v1/ai_forecasts?select=market_id,category,confidence,source,market_prob,ai_fair_value,outcome,forecast_date,created_at,resolved_at`
  + `&resolved=eq.true&outcome=not.is.null&order=forecast_date.asc&limit=5000`, { headers: H })).json();

// 1 previsão por mercado, a mais antiga (regra da view 019)
const porMercado = new Map();
for (const r of rows) {
  const c = porMercado.get(r.market_id);
  if (!c || r.forecast_date < c.forecast_date || (r.forecast_date === c.forecast_date && r.created_at < c.created_at)) {
    porMercado.set(r.market_id, r);
  }
}
const d = Array.from(porMercado.values()).sort((a, b) => a.forecast_date.localeCompare(b.forecast_date));

const cat = (c) => String(c ?? "other").toLowerCase().replace(/[^a-z]/g, "").slice(0, 12) || "other";
const horizonte = (r) => {
  const dias = (new Date(r.resolved_at).getTime() - new Date(r.forecast_date).getTime()) / 86400000;
  return !Number.isFinite(dias) ? "?" : dias <= 2 ? "0-2d" : dias <= 7 ? "3-7d" : dias <= 30 ? "8-30d" : "30d+";
};
const y = (r) => (r.outcome ? 1 : 0);
const brier = (p, r) => (p - y(r)) ** 2;
const media = (a) => a.reduce((s, v) => s + v, 0) / a.length;

/** Taxa-base por segmento, com suavização de Laplace rumo à taxa global. */
function treinar(treino, chave, forca = 8) {
  const global = media(treino.map(y));
  const acc = new Map();
  for (const r of treino) {
    const k = chave(r);
    const a = acc.get(k) ?? { n: 0, s: 0 };
    a.n++; a.s += y(r); acc.set(k, a);
  }
  return (r) => {
    const a = acc.get(chave(r));
    if (!a) return global;
    // Laplace: puxa para a taxa global quando o segmento tem pouca amostra.
    return (a.s + forca * global) / (a.n + forca);
  };
}

const corte = Math.floor(d.length * 0.6);
const treino = d.slice(0, corte), teste = d.slice(corte);
const taxaGlobal = media(treino.map(y));

const modelos = {
  "categoria":                 treinar(treino, (r) => cat(r.category)),
  "categoria + horizonte":     treinar(treino, (r) => `${cat(r.category)}|${horizonte(r)}`),
  "categoria + confiança":     treinar(treino, (r) => `${cat(r.category)}|${r.confidence}`),
  "cat + horiz + confiança":   treinar(treino, (r) => `${cat(r.category)}|${horizonte(r)}|${r.confidence}`),
};

console.log(`\n╔══════════════════════════════════════════════════════════════╗`);
console.log(`║  ESTIMATIVA PRÓPRIA — sem olhar o preço do mercado            ║`);
console.log(`╚══════════════════════════════════════════════════════════════╝`);
console.log(`  amostra: ${d.length} resolvidos · treino ${treino.length} · teste ${teste.length} (corte TEMPORAL)`);
console.log(`  taxa-base de SIM no treino: ${(100 * taxaGlobal).toFixed(1)}%\n`);

const bMercado = media(teste.map((r) => brier(Number(r.market_prob) / 100, r)));
const bProducao = media(teste.map((r) => brier(Number(r.ai_fair_value) / 100, r)));
const bConstante = media(teste.map((r) => brier(taxaGlobal, r)));

console.log(`  RÉGUAS (no mesmo conjunto de teste)`);
console.log(`    mercado ................ ${bMercado.toFixed(4)}`);
console.log(`    nossa produção ......... ${bProducao.toFixed(4)}`);
console.log(`    chute constante ........ ${bConstante.toFixed(4)}   (taxa-base, sem modelo nenhum)\n`);

console.log(`  NOSSOS MODELOS (só variáveis independentes do preço)`);
let melhor = null;
for (const [nome, f] of Object.entries(modelos)) {
  const b = media(teste.map((r) => brier(f(r), r)));
  const vsConst = (1 - b / bConstante) * 100;
  const vsMercado = (1 - b / bMercado) * 100;
  if (!melhor || b < melhor.b) melhor = { nome, b, vsConst, vsMercado };
  console.log(`    ${nome.padEnd(24)} ${b.toFixed(4)}   vs chute ${vsConst >= 0 ? "+" : ""}${vsConst.toFixed(1)}%   vs mercado ${vsMercado >= 0 ? "+" : ""}${vsMercado.toFixed(1)}%`);
}

console.log(`\n  ─────────────────────────────────────────────────────────────`);
if (melhor.vsConst <= 0) {
  console.log(`  ❌ Nenhum modelo bate nem o CHUTE CONSTANTE. As variáveis que temos sem`);
  console.log(`     o preço não carregam informação sobre o desfecho — descrevem o`);
  console.log(`     segmento, não o evento.`);
} else if (melhor.vsMercado <= 0) {
  console.log(`  ⚠️  O melhor modelo ("${melhor.nome}") supera o chute constante em`);
  console.log(`     ${melhor.vsConst.toFixed(1)}%, mas fica ${Math.abs(melhor.vsMercado).toFixed(1)}% atrás do mercado.`);
  console.log(`     É uma estimativa NOSSA e honesta — só não é melhor que o preço.`);
} else {
  console.log(`  ✅ "${melhor.nome}" bate o mercado em ${melhor.vsMercado.toFixed(1)}%. Investigar antes de comemorar.`);
}
