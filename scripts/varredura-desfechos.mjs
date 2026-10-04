/**
 * varredura-desfechos.mjs — o site mostra TODAS as opções de cada mercado?
 *
 * 🔴 POR QUE ISTO EXISTE (03/10/2026, achado do fundador). "Indiana enacts data
 * center moratorium by...?" tem 4 datas no Polymarket; o site mostrava "11%",
 * que era só a de 31/12/2027. Medido no catálogo publicado inteiro: de 233
 * eventos do Polymarket com várias opções, o site mostrava todas em 16 — e a
 * eleição presidencial brasileira aparecia como "0,15%" (Renan Santos, o de
 * maior volume). No Kalshi, 84 eventos mostravam uma opção só.
 *
 * Nada disso dá erro. A tela desenha, o número é real, só não é o do evento — a
 * família das "falhas silenciosas", que só se vê comparando com a fonte. É o que
 * isto faz: para cada card do catálogo, busca o evento na fonte (Gamma do
 * Polymarket, API do Kalshi) e compara quantas opções abertas existem com
 * quantas o site lista + quantas ele DIZ que deixou de fora (`opcoesOcultas`).
 *
 * Falha (sai com 1) quando há mercado mostrando parte das opções SEM avisar.
 * Mostrar parte avisando é legítimo: 54 candidatos de 2028 não cabem num card,
 * e "e mais 42" é a verdade.
 *
 * Não conta como múltipla escolha o evento de VÁRIAS PERGUNTAS — uma partida
 * (quem vence, quem vence o mapa 1, total de mapas) tem mercados com rótulos
 * próprios, e ali o card mostra o mercado principal com os dois nomes.
 *
 * Uso: `pnpm desfechos` (servidor local de pé) ou
 *      `JLB_URL=https://jlbanalytics.com pnpm desfechos` (o site publicado).
 */

const BASE = (process.env.JLB_URL ?? "http://localhost:3001").replace(/\/$/, "");
const agora = Date.now();

async function json(url, tentativas = 3) {
  for (let i = 0; i < tentativas; i++) {
    try {
      const r = await fetch(url, { headers: { Accept: "application/json" } });
      if (r.status === 429) { await new Promise((ok) => setTimeout(ok, 1500 * (i + 1))); continue; }
      if (!r.ok) return { erro: r.status };
      return await r.json();
    } catch (e) {
      if (i === tentativas - 1) return { erro: String(e).slice(0, 60) };
    }
  }
  return { erro: 429 };
}
async function emLevas(itens, n, fn) {
  const saida = [];
  for (let i = 0; i < itens.length; i += n) saida.push(...(await Promise.all(itens.slice(i, i + n).map(fn))));
  return saida;
}
const lista = (s) => { try { const v = JSON.parse(s ?? "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };
const simNao = (rotulos) => {
  const v = lista(rotulos).map((x) => String(x).toLowerCase());
  return v.length === 0 || (v[0] === "yes" && v[1] === "no");
};
/** Os mesmos filtros de opção aberta que o servidor aplica (routes/polymarket.ts). */
const GENERICO = /\b(Team|Person|Candidate|Player|Country|Party)\s+[A-Z]{1,3}\b/;

async function catalogo(fonte, limite) {
  const r = await json(`${BASE}/api/${fonte}/markets?limit=${limite}`);
  // A cópia guardada é de outro momento (e de outro código, se acabou de publicar).
  if (r.source === "arquivo") {
    console.error(`⚠ ${fonte}: o servidor serviu a CÓPIA guardada, não o catálogo vivo. Rode de novo em alguns segundos.`);
    process.exit(2);
  }
  if (r.erro || !Array.isArray(r.markets)) {
    console.error(`✖ ${fonte}: catálogo não respondeu (${r.erro ?? "formato inesperado"}) em ${BASE}`);
    process.exit(2);
  }
  return r.markets;
}

/** Agrupa os cards por evento e diz quantas opções o site lista e declara. */
function porEvento(cards, chave, listadas) {
  const mapa = new Map();
  for (const c of cards) {
    const k = chave(c);
    const atual = mapa.get(k) ?? { cards: 0, listadas: 0, ocultas: 0 };
    atual.cards += 1;
    atual.listadas += listadas(c);
    atual.ocultas += c.opcoesOcultas ?? 0;
    mapa.set(k, atual);
  }
  return mapa;
}

// ── Polymarket ───────────────────────────────────────────────────────────────
const poly = await catalogo("polymarket", 400);
const eventosPoly = porEvento(poly, (c) => c.eventSlug,
  (c) => (String(c.id).startsWith("ev-") ? lista(c.outcomes).length : 1));
const linhasPoly = await emLevas([...eventosPoly.entries()], 6, async ([slug, site]) => {
  const evs = await json(`https://gamma-api.polymarket.com/events?slug=${encodeURIComponent(slug)}`);
  const ev = Array.isArray(evs) ? evs[0] : null;
  if (!ev) return { fonte: "Polymarket", slug, erro: evs?.erro ?? "sem evento" };
  const abertas = (ev.markets ?? []).filter((m) =>
    m.active !== false && m.closed !== true &&
    (!m.endDate || new Date(m.endDate).getTime() >= agora) &&
    !GENERICO.test(m.question ?? ""));
  return {
    fonte: "Polymarket", slug, titulo: ev.title, naFonte: abertas.length, ...site,
    variasPerguntas: abertas.some((m) => !simNao(m.outcomes)),
  };
});

// ── Kalshi ───────────────────────────────────────────────────────────────────
const kalshi = await catalogo("kalshi", 300);
const eventosKalshi = porEvento(kalshi, (c) => c.eventTicker,
  (c) => (Array.isArray(c.outcomes) && c.outcomes.length > 0 ? c.outcomes.length : 1));
const linhasKalshi = await emLevas([...eventosKalshi.entries()], 4, async ([ticker, site]) => {
  const r = await json(`https://api.elections.kalshi.com/trade-api/v2/events/${encodeURIComponent(ticker)}?with_nested_markets=true`);
  const ev = r?.event;
  if (!ev) return { fonte: "Kalshi", slug: ticker, erro: r?.erro ?? "sem evento" };
  // TODA opção aberta conta, com preço ou sem: o servidor lista as que têm preço
  // confiável e declara as demais em `opcoesOcultas`.
  const abertas = (ev.markets ?? r.markets ?? []).filter((m) => !m.status || m.status === "active");
  return { fonte: "Kalshi", slug: ticker, titulo: ev.title, naFonte: abertas.length, ...site, variasPerguntas: false };
});

// ── Resumo ───────────────────────────────────────────────────────────────────
let silenciosos = 0;
console.log(`\nVarredura de desfechos — ${BASE}\n`);
for (const linhas of [linhasPoly, linhasKalshi]) {
  const fonte = linhas[0]?.fonte ?? "?";
  const ok = linhas.filter((l) => !l.erro);
  const multipla = ok.filter((l) => l.naFonte >= 2 && !l.variasPerguntas);
  const completos = multipla.filter((l) => l.listadas >= l.naFonte);
  const declarados = multipla.filter((l) => l.listadas < l.naFonte && l.listadas + l.ocultas >= l.naFonte);
  // Margem de 1: entre a montagem do catálogo e esta consulta, uma opção pode
  // abrir ou fechar na fonte. Diferença maior que isso é defeito.
  const calados = multipla.filter((l) => l.listadas + l.ocultas < l.naFonte - 1);
  silenciosos += calados.length;
  console.log(`${fonte}: ${ok.length} eventos no site${linhas.length > ok.length ? ` (${linhas.length - ok.length} sem resposta da fonte)` : ""}`);
  console.log(`  múltipla escolha na fonte: ${multipla.length}`);
  console.log(`    ✅ todas as opções na tela:        ${completos.length}`);
  console.log(`    ✅ parte, dizendo quantas faltam:  ${declarados.length}`);
  console.log(`    ${calados.length ? "🔴" : "✅"} parte, SEM avisar:              ${calados.length}`);
  for (const l of calados.slice(0, 15)) {
    console.log(`       ${String(l.titulo).slice(0, 70)} — ${l.listadas} na tela + ${l.ocultas} avisadas, ${l.naFonte} na fonte`);
  }
  const partidas = ok.filter((l) => l.naFonte >= 2 && l.variasPerguntas).length;
  if (partidas) console.log(`  (fora da conta: ${partidas} eventos de várias perguntas — partidas)`);
  console.log("");
}

if (silenciosos > 0) {
  console.log(`🔴 ${silenciosos} mercado(s) mostram parte das opções sem avisar. Ver server/lib/eventoAgregado.ts.`);
  process.exit(1);
}
console.log("Nenhum mercado esconde opções caladas.");
