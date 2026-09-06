/**
 * Auditoria de QUALIDADE das análises — `pnpm qualidade`
 *
 * Diferente de `pnpm cobertura`, que só pergunta "achou contexto?". Aqui a
 * pergunta é outra: o que a IA ESCREVEU presta? Roda a análise de verdade num
 * mercado real de cada família e mede o que dá para medir sem opinião:
 *
 *   · tamanho do texto que chega à tela (era 1.061 caracteres em 05/09)
 *   · se as seções novas vieram (contexto do assunto, cenários dos dois lados)
 *   · se cita PROCEDÊNCIA — fonte com data, não "segundo especialistas"
 *   · se usa o nosso número medido quando ele existe (o diferencial do site)
 *   · se INVENTOU número nosso quando ele não existe (o erro mais grave)
 *   · se caiu no fallback por falta de provedor de IA
 *
 * Gasta cota de IA de verdade: uma análise por família, não uma por mercado.
 */
import { runMarketAnalysis } from "../server/lib/ai/marketAnalysis.ts";
import { montarFicha, familiaDaCategoria } from "../server/lib/ai/fichaMercado.ts";

const BASE = process.env.JLB_URL ?? "http://localhost:3001";

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

/** Um mercado real por família, o mais negociado de cada. */
async function amostra() {
  const todos = [];
  for (const [fonte, url] of [
    ["polymarket", "/api/polymarket/markets?limit=300"],
    ["kalshi", "/api/kalshi/markets?limit=300"],
  ]) {
    try {
      const r = await fetch(BASE + url, { signal: AbortSignal.timeout(90_000) });
      if (!r.ok) continue;
      const j = await r.json();
      for (const m of j.markets ?? []) {
        const titulo = fonte === "polymarket"
          ? (m.eventTitle && m.eventTitle.length > 10 && m.eventTitle !== m.question ? m.eventTitle : m.question ?? "")
          : (m.title ?? "");
        const prob = fonte === "polymarket"
          ? (typeof m.yesProb === "number" ? m.yesProb : null)
          : (typeof m.yesProb === "number" ? m.yesProb : null);
        if (!titulo || titulo.length < 10 || prob === null) continue;
        todos.push({
          titulo, prob, fonte,
          categoria: (m.category ?? "other").toLowerCase(),
          volume: num(m.volume),
          fechaEm: m.endDate ?? m.closeTime ?? null,
        });
      }
    } catch { /* fonte fora do ar não invalida a auditoria */ }
  }

  const porFamilia = new Map();
  for (const m of todos.sort((a, b) => b.volume - a.volume)) {
    const fam = familiaDaCategoria(m.categoria) ?? "sem família";
    if (!porFamilia.has(fam)) porFamilia.set(fam, m);
  }
  return Array.from(porFamilia);
}

const alvos = await amostra();
if (alvos.length === 0) {
  console.log("Nenhum mercado. O servidor local está de pé? (pnpm dev:server)");
  process.exit(1);
}

console.log(`Analisando ${alvos.length} mercados, um por família...\n`);

const FONTE_COM_DATA = /\((\d{2}\/\d{2}\/\d{4}|\d{2}\/\d{2})\)|\b\d{2}\/\d{2}\/\d{4}\b/;
const linhas = [];

for (const [familia, m] of alvos) {
  const ficha = await montarFicha({
    titulo: m.titulo, precoPct: Math.round(m.prob * 100), categoria: m.categoria,
    plataforma: m.fonte === "kalshi" ? "Kalshi" : "Polymarket",
    fechaEm: m.fechaEm, volume: m.volume,
  });
  const fichaTemHistorico = /NOSSO HISTÓRICO EM/.test(ficha);

  let r;
  try {
    r = await runMarketAnalysis({
      title: m.titulo, yesProb: m.prob, source: m.fonte, category: m.categoria,
      marketId: `${m.fonte === "kalshi" ? "kalshi" : "poly"}-audit`,
      volume: m.volume, closeTime: m.fechaEm,
    });
  } catch (e) {
    console.log(`  ! ${familia}: ${e.message}`);
    continue;
  }

  const texto = [r.analysis, r.contexto, r.edgeSignal, r.watchFor, ...(r.keyFactors ?? [])].filter(Boolean).join(" ");
  const chars = texto.length + (r.cenarios ? r.cenarios.sim.length + r.cenarios.nao.length : 0);
  const caiuNoFallback = /não pôde ser gerada/i.test(String(r.analysis));
  const citaHistorico = /acompanhamos \d+|\d+ mercados|histórico (medido|próprio)/i.test(texto);

  linhas.push({
    familia,
    categoria: m.categoria,
    titulo: m.titulo,
    chars,
    contexto: Boolean(r.contexto),
    cenarios: Boolean(r.cenarios),
    procedencia: FONTE_COM_DATA.test(texto),
    fichaTemHistorico,
    citaHistorico,
    // O erro mais grave: falar do "nosso histórico" quando a ficha não tinha.
    inventou: !fichaTemHistorico && citaHistorico,
    caiuNoFallback,
  });
  process.stdout.write(`  ${familia} ok\n`);
}

// ── Relatório ───────────────────────────────────────────────────────────────
console.log("\n═══ QUALIDADE POR FAMÍLIA ═══");
console.log("família        chars  ctx  cen  proc  hist  fb  categoria / título");
for (const l of linhas) {
  const s = (b) => (b ? " ✓ " : " · ");
  const hist = l.fichaTemHistorico ? (l.citaHistorico ? " ✓ " : " ✗ ") : " — ";
  console.log(
    `${l.familia.slice(0, 13).padEnd(13)} ${String(l.chars).padStart(5)}  ${s(l.contexto)} ${s(l.cenarios)} ${s(l.procedencia)}  ${hist} ${s(l.caiuNoFallback)} [${l.categoria.slice(0, 14)}] ${l.titulo.slice(0, 32)}`,
  );
}

const n = linhas.length || 1;
const media = Math.round(linhas.reduce((s, l) => s + l.chars, 0) / n);
const pct = (f) => `${Math.round((linhas.filter(f).length / n) * 100)}%`;
console.log(`\nmédia de texto na tela : ${media} caracteres  (era 1.061 em 05/09)`);
console.log(`com contexto do assunto: ${pct((l) => l.contexto)}`);
console.log(`com cenários dos 2 lados: ${pct((l) => l.cenarios)}`);
console.log(`citando fonte com data : ${pct((l) => l.procedencia)}`);
const comHist = linhas.filter((l) => l.fichaTemHistorico);
if (comHist.length > 0) {
  const usou = comHist.filter((l) => l.citaHistorico).length;
  console.log(`usou nosso histórico   : ${usou}/${comHist.length} das vezes em que ele existia`);
}
const inventaram = linhas.filter((l) => l.inventou);
console.log(`INVENTOU histórico     : ${inventaram.length}  ${inventaram.length === 0 ? "✓" : "✗ " + inventaram.map((l) => l.familia).join(", ")}`);
console.log(`caiu no fallback (IA fora): ${linhas.filter((l) => l.caiuNoFallback).length}/${n}`);
