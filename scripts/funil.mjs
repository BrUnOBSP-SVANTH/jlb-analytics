#!/usr/bin/env node
/**
 * pnpm funil — de onde vêm os visitantes e onde eles param.
 *
 * POR QUE EXISTE (18/09/2026). O site produz 103 previsões de IA por dia e
 * tinha UMA conta criada — a do fundador. A telemetria guardava 53 visitantes
 * em 30 dias sem dizer de onde vieram nem em que ponto desistiram. Sem essas
 * duas respostas, qualquer ação de divulgação vira palpite: não há como saber
 * se o Instagram trouxe alguém, nem se quem chegou bateu no muro do cadastro.
 *
 * ⚠️ Mede SÓ quem aceitou o aviso de cookies (lib/cookies.ts). Os números são o
 * PISO, não o total — quem recusou não deixa rastro, e é assim que deve ser.
 *
 * Uso: pnpm funil            (últimos 30 dias)
 *      pnpm funil -- 7        (últimos 7)
 */

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;
if (!url || !key) {
  console.error("Precisa de SUPABASE_URL e SUPABASE_SERVICE_KEY no .env (o funil lê a telemetria inteira).");
  process.exit(1);
}

const dias = Math.max(1, parseInt(process.argv[2] ?? "30", 10) || 30);
const desde = new Date(Date.now() - dias * 86_400_000).toISOString();

async function eventos() {
  const linhas = [];
  const pagina = 1000;
  for (let de = 0; ; de += pagina) {
    const r = await fetch(
      `${url}/rest/v1/analytics_events?select=event,path,anon_id,user_id,meta,created_at` +
        `&created_at=gte.${encodeURIComponent(desde)}&order=created_at.asc`,
      { headers: { apikey: key, Authorization: `Bearer ${key}`, Range: `${de}-${de + pagina - 1}` } },
    );
    if (!r.ok) throw new Error(`Supabase respondeu ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const lote = await r.json();
    linhas.push(...lote);
    if (lote.length < pagina) return linhas;
  }
}

const MERCADO = /^\/(mercados|apostas)\/[^/]+/;

function contar(linhas) {
  const por = (filtro) => new Set(linhas.filter(filtro).map((l) => l.anon_id).filter(Boolean));
  const visitantes = por(() => true);
  const diasPorVisitante = new Map();
  for (const l of linhas) {
    if (!l.anon_id) continue;
    if (!diasPorVisitante.has(l.anon_id)) diasPorVisitante.set(l.anon_id, new Set());
    diasPorVisitante.get(l.anon_id).add(l.created_at.slice(0, 10));
  }
  const analise = (res) => por((l) => l.event === "analise_ia" && (!res || l.meta?.resultado === res));

  // Origem: o `meta.canal` do primeiro page_view da sessão (lib/origemDaVisita.ts).
  const canalDe = new Map();
  for (const l of linhas) {
    const c = l.event === "page_view" ? l.meta?.canal : undefined;
    if (c && l.anon_id && !canalDe.has(l.anon_id)) canalDe.set(l.anon_id, c);
  }
  const porCanal = new Map();
  for (const c of canalDe.values()) porCanal.set(c, (porCanal.get(c) ?? 0) + 1);

  return {
    visitantes: visitantes.size,
    voltaram: [...diasPorVisitante.values()].filter((d) => d.size >= 2).length,
    viramMercado: por((l) => l.event === "page_view" && MERCADO.test(l.path ?? "")).size,
    pediramAnalise: analise().size,
    barrados: analise("barrada").size,
    viramAnalise: analise("vista").size,
    cadastros: por((l) => l.event === "signup").size,
    semOrigem: visitantes.size - canalDe.size,
    porCanal: [...porCanal.entries()].sort((a, b) => b[1] - a[1]),
    primeiraOrigem: linhas.find((l) => l.meta?.canal)?.created_at,
  };
}

const pct = (n, total) => (total ? `${Math.round((100 * n) / total)}%` : "—");
const linha = (rotulo, n, total) =>
  console.log(`  ${rotulo.padEnd(34)} ${String(n).padStart(5)}   ${total === undefined ? "" : pct(n, total)}`);

const r = contar(await eventos());

console.log(`\nFunil dos últimos ${dias} dias — só quem aceitou medição (é o piso, não o total)\n`);
linha("Visitantes", r.visitantes);
linha("  voltaram em outro dia", r.voltaram, r.visitantes);
linha("  abriram algum mercado", r.viramMercado, r.visitantes);
linha("  pediram a análise da IA", r.pediramAnalise, r.visitantes);
linha("    barrados (login ou cota)", r.barrados, r.pediramAnalise);
linha("  criaram conta", r.cadastros, r.visitantes);
linha("  viram a análise", r.viramAnalise, r.visitantes);

console.log(`\nDe onde vieram`);
if (r.porCanal.length === 0) {
  console.log("  (nenhuma chegada com origem registrada ainda)");
} else {
  for (const [canal, n] of r.porCanal) linha(canal, n, r.visitantes - r.semOrigem);
}
if (r.semOrigem > 0) {
  const desdeQuando = r.primeiraOrigem ? ` — a origem só é medida desde ${r.primeiraOrigem.slice(0, 10)}` : " — a origem começou a ser medida em 19/09/2026";
  console.log(`  sem origem registrada: ${r.semOrigem}${desdeQuando}`);
}
console.log(`\nPara medir WhatsApp, compartilhe o link com ?utm_source=whatsapp — o app quase nunca diz de onde veio.\n`);
