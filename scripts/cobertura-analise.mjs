/**
 * Auditoria de cobertura da análise — `pnpm cobertura`
 *
 * A pergunta que ele responde: para os mercados que estão AO VIVO no site agora,
 * em quantos a análise encontra contexto de verdade, e em quantos ela sai seca?
 *
 * Por que existe. Dois relatos do fundador (05/09) apontaram análise vazia — um
 * de CS2, outro de futebol. Consertar caso a caso é enxugar gelo: cada tema tem
 * seu jeito de escrever título, e só um levantamento de todos mostra ONDE
 * estamos cegos. Este script pega o catálogo real (o mesmo que a tela mostra),
 * roda a busca do Cérebro em cada mercado e devolve o mapa da cobertura por
 * categoria — quem está bem servido e quem está no escuro.
 *
 * Não escreve nada. Só lê e mede.
 */
import { fetchCerebroContext, topKeywords, entidadesDoConfronto } from "../server/lib/cerebro.ts";

const LIMITE = Number(process.env.LIMITE ?? 220);
const AMOSTRA_VAZIOS = 14;

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

/** O catálogo real, das mesmas rotas que abastecem a aba Mercados. */
async function catalogo() {
  const base = process.env.JLB_URL ?? "http://localhost:3001";
  const mercados = [];

  for (const [fonte, caminho] of [["polymarket", "/api/polymarket/markets?limit=300"], ["kalshi", "/api/kalshi/markets?limit=300"]]) {
    try {
      const r = await fetch(base + caminho, { signal: AbortSignal.timeout(90_000) });
      if (!r.ok) { console.log(`  ! ${fonte}: HTTP ${r.status}`); continue; }
      const j = await r.json();
      for (const m of j.markets ?? []) {
        const titulo = fonte === "polymarket"
          ? (m.eventTitle && m.eventTitle.length > 10 && m.eventTitle !== m.question ? m.eventTitle : m.question ?? "")
          : (m.title ?? "");
        if (!titulo || titulo.length < 8) continue;
        mercados.push({
          titulo,
          categoria: (m.category ?? "other").toLowerCase(),
          fonte,
          volume: num(m.volume),
        });
      }
      console.log(`  ${fonte}: ${(j.markets ?? []).length} mercados`);
    } catch (e) { console.log(`  ! ${fonte}: ${e.message}`); }
  }
  return mercados;
}

const mercados = await catalogo();
if (mercados.length === 0) {
  console.log("\nNenhum mercado. O servidor local está de pé? (pnpm dev:server)");
  process.exit(1);
}

// Os mais negociados primeiro: é o que o usuário realmente abre.
mercados.sort((a, b) => b.volume - a.volume);
const alvo = mercados.slice(0, LIMITE);
console.log(`\nMedindo ${alvo.length} mercados (os de maior volume)...\n`);

const porCategoria = new Map();
const vazios = [];
let feitos = 0;

for (const m of alvo) {
  let hits = 0;
  try {
    const r = await fetchCerebroContext(m.titulo, undefined, false, undefined, m.categoria);
    hits = r.hits.length;
  } catch { /* falha de rede conta como vazio, que é o que o usuário veria */ }

  const c = porCategoria.get(m.categoria) ?? { total: 0, comContexto: 0, somaHits: 0, confrontos: 0 };
  c.total += 1;
  c.somaHits += hits;
  if (hits > 0) c.comContexto += 1;
  if (entidadesDoConfronto(m.titulo)) c.confrontos += 1;
  porCategoria.set(m.categoria, c);

  if (hits === 0) vazios.push(m);
  feitos += 1;
  if (feitos % 25 === 0) process.stdout.write(`  ${feitos}/${alvo.length}\n`);
}

// ── Relatório ───────────────────────────────────────────────────────────────
const linhas = Array.from(porCategoria)
  .map(([cat, c]) => ({
    cat,
    total: c.total,
    cobertura: (c.comContexto / c.total) * 100,
    mediaHits: c.somaHits / c.total,
    confrontos: c.confrontos,
  }))
  .sort((a, b) => a.cobertura - b.cobertura || b.total - a.total);

console.log("\n═══ COBERTURA POR CATEGORIA (pior primeiro) ═══");
console.log("categoria            merc.  com contexto   média hits  confrontos");
for (const l of linhas) {
  const barra = "█".repeat(Math.round(l.cobertura / 10)).padEnd(10, "·");
  console.log(
    `${l.cat.slice(0, 20).padEnd(20)} ${String(l.total).padStart(4)}  ${barra} ${l.cobertura.toFixed(0).padStart(3)}%`
    + `   ${l.mediaHits.toFixed(1).padStart(5)}      ${String(l.confrontos).padStart(4)}`,
  );
}

const totalGeral = alvo.length;
const comContexto = totalGeral - vazios.length;
console.log(`\nGERAL: ${comContexto}/${totalGeral} mercados com contexto (${((comContexto / totalGeral) * 100).toFixed(1)}%)`);

if (vazios.length > 0) {
  console.log(`\n═══ AMOSTRA DOS QUE SAEM SECOS (${vazios.length} no total) ═══`);
  for (const m of vazios.slice(0, AMOSTRA_VAZIOS)) {
    const conf = entidadesDoConfronto(m.titulo);
    console.log(`  [${m.categoria}] ${m.titulo.slice(0, 68)}`);
    console.log(`      busca: "${conf ?? topKeywords(m.titulo)}"${conf ? " (confronto)" : ""}`);
  }
}
