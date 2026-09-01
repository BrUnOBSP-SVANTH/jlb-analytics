/**
 * calibration-fit.mjs — quanto ainda dá para ganhar em CALIBRAÇÃO, medido.
 *
 * Contexto: a decomposição de Murphy sobre os resolvidos mostrou
 *   Brier = Confiabilidade − Discriminação + Incerteza
 *         = 0,0037        − 0,1050        + 0,2474
 * ou seja, o erro de CALIBRAÇÃO já é ~1,5% da incerteza irredutível. Mas o
 * diagrama de confiabilidade revelou um padrão sistemático: SUBCONFIANÇA nas
 * pontas (dizemos 87% e acontece 96%; dizemos 12% e acontece 7%).
 *
 * Subconfiança tem conserto conhecido: "extremizar" (afastar de 50%) via escala
 * no logit — p' = sigmoid(a · logit(p)), com a > 1.
 *
 * ⚠️ O PERIGO é achar o `a` que minimiza o erro NA PRÓPRIA AMOSTRA e chamar isso
 * de melhoria — seria ajustar ao ruído. Por isso aqui o `a` é validado FORA DA
 * AMOSTRA de duas formas independentes:
 *   1. Corte TEMPORAL: aprende no passado, testa no futuro (é assim que vai rodar)
 *   2. Leave-one-out: aprende em n−1, testa no que ficou de fora
 * Só promovemos se as duas concordarem.
 *
 * ⚠️ APRENDIZADO (29/08/2026): quando as duas discordam, acredite na TEMPORAL.
 * Para um único parâmetro global, o leave-one-out é quase in-sample — treinar com
 * n−1 pontos dá praticamente o mesmo `a` que treinar com n, então ele "valida"
 * contra um modelo que já viu quase tudo. O corte temporal é o único que reproduz
 * a situação real (prever o futuro com o que se sabia no passado).
 * Resultado desta rodada: LOO disse +1,0%, temporal disse −0,5%. Não promovido.
 *
 * Uso: node scripts/calibration-fit.mjs
 */
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env", "utf8").split("\n").filter((l) => l.trim() && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const URL_ = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_KEY;

const logit = (p) => Math.log(p / (1 - p));
const sigmoid = (z) => 1 / (1 + Math.exp(-z));
const clip = (p, e = 0.01) => Math.min(1 - e, Math.max(e, p));
/** Extremiza: a>1 afasta de 50%, a<1 aproxima. a=1 não mexe. */
const extremize = (p, a) => sigmoid(a * logit(clip(p)));
const brier = (ps, ys) => ps.reduce((s, p, i) => s + (p - ys[i]) ** 2, 0) / ps.length;

/** Melhor `a` para um conjunto de treino (busca fina, sem otimizador). */
function fitA(ps, ys) {
  let best = { a: 1, b: Infinity };
  for (let a = 0.6; a <= 2.4; a += 0.01) {
    const b = brier(ps.map((p) => extremize(p, a)), ys);
    if (b < best.b) best = { a: Number(a.toFixed(2)), b };
  }
  return best.a;
}

async function load() {
  const r = await fetch(
    `${URL_}/rest/v1/ai_forecasts?resolved=eq.true&outcome=not.is.null`
    + `&select=market_id,ai_fair_value,market_prob,outcome,forecast_date,created_at&limit=3000`,
    { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } },
  );
  const rows = await r.json();
  // Dedup por mercado (regra da view 019) — repetição infla qualquer medição.
  const first = new Map();
  for (const x of rows) {
    const cur = first.get(x.market_id);
    if (!cur || x.forecast_date < cur.forecast_date || (x.forecast_date === cur.forecast_date && x.created_at < cur.created_at)) {
      first.set(x.market_id, x);
    }
  }
  return Array.from(first.values())
    .sort((a, b) => String(a.forecast_date).localeCompare(String(b.forecast_date)))
    .map((x) => ({
      p: Number(x.ai_fair_value) / 100,
      mp: Number(x.market_prob) / 100,
      y: x.outcome ? 1 : 0,
    }));
}

(async () => {
  const d = await load();
  const ps = d.map((x) => x.p), ys = d.map((x) => x.y), mps = d.map((x) => x.mp);
  console.log(`\n╔══════════════════════════════════════════════════════════════╗`);
  console.log(`║  CALIBRAÇÃO — quanto ainda dá para ganhar (medido)            ║`);
  console.log(`╚══════════════════════════════════════════════════════════════╝`);
  console.log(`  amostra: ${d.length} mercados resolvidos (deduplicados)\n`);

  const b0 = brier(ps, ys), bm = brier(mps, ys);
  console.log(`  Brier atual da IA .......... ${b0.toFixed(4)}`);
  console.log(`  Brier do mercado ........... ${bm.toFixed(4)}`);

  // ── 1. Melhor `a` visto na amostra inteira (referência do TETO, não promovível)
  const aIn = fitA(ps, ys);
  const bIn = brier(ps.map((p) => extremize(p, aIn)), ys);
  console.log(`\n  [dentro da amostra] melhor a=${aIn} → ${bIn.toFixed(4)}  (ganho ${((b0 - bIn) / b0 * 100).toFixed(1)}%)`);
  console.log(`  ⚠️  este número é otimista por construção — serve de TETO, não de promessa.`);

  // ── 2. Corte TEMPORAL (aprende no passado, testa no futuro)
  const cut = Math.floor(d.length * 0.6);
  const aTemp = fitA(ps.slice(0, cut), ys.slice(0, cut));
  const teP = ps.slice(cut), teY = ys.slice(cut);
  const bTempBefore = brier(teP, teY);
  const bTempAfter = brier(teP.map((p) => extremize(p, aTemp)), teY);
  console.log(`\n  [corte temporal] treino=${cut}, teste=${teP.length}, a=${aTemp}`);
  console.log(`     antes ${bTempBefore.toFixed(4)} → depois ${bTempAfter.toFixed(4)}  `
    + `(${bTempAfter < bTempBefore ? "ganho" : "PIORA"} ${Math.abs((bTempBefore - bTempAfter) / bTempBefore * 100).toFixed(1)}%)`);

  // ── 3. Leave-one-out (cada ponto testado com `a` aprendido sem ele)
  let sse = 0;
  for (let i = 0; i < d.length; i++) {
    const trP = ps.filter((_, j) => j !== i), trY = ys.filter((_, j) => j !== i);
    const a = fitA(trP, trY);
    sse += (extremize(ps[i], a) - ys[i]) ** 2;
  }
  const bLoo = sse / d.length;
  console.log(`\n  [leave-one-out] ${bLoo.toFixed(4)}  `
    + `(${bLoo < b0 ? "ganho" : "PIORA"} ${Math.abs((b0 - bLoo) / b0 * 100).toFixed(1)}%)`);

  // ── 4. O ganho é distinguível de RUÍDO? (o teste que faltava)
  //
  // Por que este bloco existe: em 29/08 promovemos uma calibração por categoria
  // com +3,1% de "ganho" no backtest e ela PIOROU 7,7% ao vivo. O erro não foi
  // validar fora da amostra — foi tratar a DIREÇÃO do ganho como prova, sem
  // perguntar se o número era distinguível de zero. Com n de algumas centenas e
  // ganhos de fração de por cento, quase sempre não é.
  //
  // O teste certo aqui é PAREADO: o mesmo mercado é pontuado com e sem correção,
  // então a diferença por observação elimina a variância de "que mercados
  // calharam de cair no teste" — que é enorme e domina a comparação ingênua.
  const difs = teP.map((p, i) => (p - teY[i]) ** 2 - (extremize(p, aTemp) - teY[i]) ** 2);
  const mediaDif = difs.reduce((s, x) => s + x, 0) / difs.length;
  const varDif = difs.reduce((s, x) => s + (x - mediaDif) ** 2, 0) / (difs.length - 1);
  const erroPadrao = Math.sqrt(varDif / difs.length);
  const t = mediaDif / erroPadrao;
  // IC 95% por bootstrap (não assume normalidade; a distribuição de diferenças
  // de erro quadrático é bem assimétrica).
  const B = 4000, amostras = [];
  for (let b = 0; b < B; b++) {
    let s = 0;
    for (let i = 0; i < difs.length; i++) s += difs[(Math.random() * difs.length) | 0];
    amostras.push(s / difs.length);
  }
  amostras.sort((x, y) => x - y);
  const ic = [amostras[Math.floor(0.025 * B)], amostras[Math.floor(0.975 * B)]];
  const significante = ic[0] > 0;
  console.log(`\n  [o ganho é ruído?] teste pareado no conjunto de teste (n=${difs.length})`);
  console.log(`     ganho medio por mercado: ${mediaDif >= 0 ? "+" : ""}${mediaDif.toFixed(5)} de Brier   (t=${t.toFixed(2)})`);
  console.log(`     IC 95% (bootstrap): [${ic[0].toFixed(5)}, ${ic[1].toFixed(5)}]`);
  console.log(`     ${significante ? "✅ o intervalo NÃO cruza zero" : "⚠️  o intervalo CRUZA ZERO — o ganho não se distingue de ruído"}`);

  // Quanta amostra faltaria para decidir? Converte "espere" em um NÚMERO, para a
  // pergunta não voltar toda semana sem critério. Se o efeito medido for real e
  // do tamanho observado, é este n que o distinguiria de zero a 95%.
  if (!significante && mediaDif > 0) {
    const desvio = erroPadrao * Math.sqrt(difs.length);
    const nAlvo = Math.ceil(((1.96 * desvio) / mediaDif) ** 2);
    console.log(`     para decidir seriam necessarias ~${nAlvo.toLocaleString("pt-BR")} resolucoes de teste `
      + `(temos ${difs.length}).`);
    if (nAlvo > 5000) {
      console.log(`     ⛔ Isso e ${(nAlvo / difs.length).toFixed(0)}x a amostra atual. Um efeito tao pequeno`);
      console.log(`        NAO e verificavel na nossa escala — perseguir isso e gastar esforco`);
      console.log(`        num ganho que nunca sera provado. Melhor fechar a questao.`);
    }
  }

  // ── Veredito
  const okTemp = bTempAfter < bTempBefore, okLoo = bLoo < b0;
  console.log(`\n  ─────────────────────────────────────────────────────────────`);
  if (okTemp && okLoo && !significante) {
    console.log(`  ⚠️  As duas validações apontam ganho, MAS ele não é distinguível de zero.`);
    console.log(`     Promover agora seria repetir 29/08: direção certa, tamanho indistinguível`);
    console.log(`     de ruído. ESPERAR mais amostra — o teste refaz sozinho a cada rodada.`);
  } else if (okTemp && okLoo) {
    console.log(`  ⚠️  Validações DISCORDAM (temporal=${okTemp ? "ganho" : "piora"}, LOO=${okLoo ? "ganho" : "piora"}).`);
    console.log(`     Sinal fraco demais para promover — seria apostar em ruído.`);
  } else {
    console.log(`  ❌ Não melhora fora da amostra. A calibração atual já está no limite`);
    console.log(`     do que a amostra sustenta — mexer seria ajustar ao ruído.`);
  }
  console.log();
})();
