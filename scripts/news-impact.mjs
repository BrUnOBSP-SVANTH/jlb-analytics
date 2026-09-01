/**
 * news-impact.mjs — notícia fresca antecipa movimento de preço? (medido)
 *
 * POR QUE ESTE ESTUDO EXISTE
 * Em 01/09/2026 fechamos com número o caminho de "bater o mercado em
 * probabilidade": o ganho por calibração exigiria ~7.000 resoluções para se
 * distinguir de zero, 24× a amostra. Ver scripts/calibration-fit.mjs.
 *
 * Resta uma hipótese diferente, que NÃO exige julgamento melhor que o da
 * multidão: mercado líquido é eficiente no longo prazo, mas pode demorar a
 * incorporar notícia — sobretudo em mercado fino. Se notícia relevante antecipa
 * movimento, isso é um produto honesto ("este mercado tende a se mexer") que não
 * depende de acertarmos a direção.
 *
 * DESENHO (pareado, cada mercado é seu próprio controle)
 * Comparar |Δpreço| nos dias APÓS notícia relevante contra os demais dias DO
 * MESMO mercado. Comparar entre mercados seria inútil: uns são estruturalmente
 * mais voláteis que outros, e essa variância dominaria o efeito procurado.
 *
 * O casamento notícia↔mercado usa a MESMA régua do Cérebro (2+ termos
 * distintivos, palavra inteira) — a que foi endurecida em 31/08 depois de
 * "epl" casar dentro de "deployer".
 */
import { readFileSync } from "node:fs";

const env = Object.fromEntries(readFileSync(".env", "utf8").split("\n")
  .filter((l) => l.trim() && !l.startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const URL = env.VITE_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const DIAS = Number(process.argv.find((a) => a.startsWith("--dias="))?.split("=")[1] ?? 45);

const norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const STOP = new Set(["will", "the", "that", "with", "from", "this", "have", "para", "como", "pelo",
  "sobre", "entre", "quando", "antes", "depois", "mais", "menos", "vence", "vencer", "wins", "win",
  "before", "after", "than", "next", "2026", "2027", "2028", "vs"]);

/** Termos distintivos do título — mesma ideia do topKeywords do Cérebro. */
function termos(titulo) {
  const brutos = String(titulo).replace(/[^a-zA-ZÀ-ú0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  const out = [];
  for (const w of brutos) {
    const curtoDistintivo = w.length >= 2 && (/^[A-Z0-9]+$/.test(w) || /^[A-Za-z]+\d+$/.test(w));
    if (w.length <= 3 && !curtoDistintivo) continue;
    const n = norm(w);
    if (STOP.has(n) || out.includes(n)) continue;
    out.push(n);
  }
  return out.slice(0, 6);
}

async function paginar(tabela, select, filtro, ordem, max = 20000) {
  const out = [];
  for (let off = 0; off < max; off += 1000) {
    const r = await fetch(`${URL}/rest/v1/${tabela}?select=${select}&${filtro}&order=${ordem}&limit=1000&offset=${off}`, { headers: H });
    if (!r.ok) break;
    const p = await r.json();
    if (!Array.isArray(p) || p.length === 0) break;
    out.push(...p);
    if (p.length < 1000) break;
  }
  return out;
}

const desde = new Date(Date.now() - DIAS * 86400000).toISOString();

console.log(`\n╔══════════════════════════════════════════════════════════════╗`);
console.log(`║  NOTÍCIA ANTECIPA MOVIMENTO DE PREÇO? (janela ${String(DIAS).padStart(2)} dias)         ║`);
if (process.argv.includes("--vivos")) console.log("  [analise SECUNDARIA: so mercados com amplitude >= 2pp]");
console.log(`╚══════════════════════════════════════════════════════════════╝`);

// ── 1. Artigos da janela, indexados por dia ──────────────────────────────────
const artigos = await paginar("cerebro_articles", "title,summary,ingested_at",
  `ingested_at=gte.${desde}&status=eq.active`, "ingested_at.asc");
const porDia = new Map();
for (const a of artigos) {
  const dia = String(a.ingested_at).slice(0, 10);
  if (!porDia.has(dia)) porDia.set(dia, []);
  porDia.get(dia).push(norm(`${a.title} ${a.summary ?? ""}`));
}
console.log(`\n  artigos na janela: ${artigos.length} em ${porDia.size} dias`);

// ── 2. Séries de preço ───────────────────────────────────────────────────────
const snaps = await paginar("market_snapshots", "market_id,title,snap_date,yes_prob",
  `snapped_at=gte.${desde}`, "snap_date.asc", 60000);
const serie = new Map();
for (const s of snaps) {
  if (!serie.has(s.market_id)) serie.set(s.market_id, { titulo: s.title, pontos: [] });
  serie.get(s.market_id).pontos.push({ dia: s.snap_date, p: Number(s.yes_prob) });
}
const usaveis = [...serie.entries()].filter(([, v]) => v.pontos.length >= 8);
console.log(`  mercados com 8+ dias de série: ${usaveis.length} (de ${serie.size})`);

// ── 3. Estudo pareado ────────────────────────────────────────────────────────
const casaTermo = (texto, t) => new RegExp(`(?<![a-z0-9])${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z0-9])`).test(texto);

// `--vivos` = análise SECUNDÁRIA, declarada antes de rodar: só mercados cujo
// preço de fato varia na janela (amplitude ≥ 2pp). Justificativa de MÉTODO, não
// de resultado: mercado com preço congelado não pode responder a notícia nenhuma
// — entra como zero nos dois grupos e só dilui. É critério de INCLUSÃO (olha a
// série inteira, não o desfecho do teste), então não é escolher a fatia que dá
// o número desejado. O resultado primário continua sendo o sem filtro.
const SO_VIVOS = process.argv.includes("--vivos");

const difs = [];
let comAmbos = 0, totalDiasNoticia = 0, totalDiasSem = 0;
for (const [, v] of usaveis) {
  const ts = termos(v.titulo);
  if (ts.length < 2) continue;
  if (SO_VIVOS) {
    const ps = v.pontos.map((x) => x.p);
    if (Math.max(...ps) - Math.min(...ps) < 2) continue;
  }

  const comNot = [], semNot = [];
  for (let i = 1; i < v.pontos.length; i++) {
    const ontem = v.pontos[i - 1], hoje = v.pontos[i];
    const delta = Math.abs(hoje.p - ontem.p);
    // notícia relevante publicada NO DIA ANTERIOR ao movimento (antecedência real)
    const doDia = porDia.get(ontem.dia) ?? [];
    const houve = doDia.some((txt) => ts.filter((t) => casaTermo(txt, t)).length >= 2);
    (houve ? comNot : semNot).push(delta);
  }
  if (comNot.length >= 2 && semNot.length >= 2) {
    comAmbos++;
    totalDiasNoticia += comNot.length;
    totalDiasSem += semNot.length;
    const m = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
    difs.push(m(comNot) - m(semNot));
  }
}

console.log(`\n  mercados com dias dos DOIS tipos (comparáveis): ${comAmbos}`);
console.log(`  dias-com-notícia: ${totalDiasNoticia}  ·  dias-sem: ${totalDiasSem}  (proporção com notícia: ${(100*totalDiasNoticia/(totalDiasNoticia+totalDiasSem)).toFixed(0)}%)`);

if (difs.length < 15) {
  console.log(`\n  ⚠️  amostra insuficiente (${difs.length} mercados pareados) — sem veredito.`);
  process.exit(0);
}

const media = difs.reduce((s, x) => s + x, 0) / difs.length;
const varr = difs.reduce((s, x) => s + (x - media) ** 2, 0) / (difs.length - 1);
const ep = Math.sqrt(varr / difs.length);
const B = 4000, boot = [];
for (let b = 0; b < B; b++) {
  let s = 0;
  for (let i = 0; i < difs.length; i++) s += difs[(Math.random() * difs.length) | 0];
  boot.push(s / difs.length);
}
boot.sort((a, b) => a - b);
const ic = [boot[Math.floor(0.025 * B)], boot[Math.floor(0.975 * B)]];

console.log(`\n  ─────────────────────────────────────────────────────────────`);
console.log(`  movimento extra no dia seguinte à notícia: ${media >= 0 ? "+" : ""}${media.toFixed(2)}pp`);
console.log(`  t=${(media / ep).toFixed(2)}   IC 95% (bootstrap): [${ic[0].toFixed(2)}, ${ic[1].toFixed(2)}]pp`);
if (ic[0] > 0) {
  console.log(`\n  ✅ SINAL: notícia relevante antecipa movimento maior, e o intervalo não`);
  console.log(`     cruza zero. É base para um alerta honesto ("tende a se mexer") —`);
  console.log(`     note que mede MAGNITUDE, não direção: não diz para que lado.`);
} else if (ic[1] < 0) {
  console.log(`\n  ❓ INVERTIDO: o preço se mexe MENOS após notícia. Suspeitar do casamento`);
  console.log(`     notícia↔mercado antes de interpretar como achado.`);
} else {
  console.log(`\n  ❌ SEM SINAL: o intervalo cruza zero. Notícia relevante não antecipa`);
  console.log(`     movimento maior de forma distinguível de ruído nesta amostra.`);
}
