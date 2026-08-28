/**
 * backtest-sports.mjs — valida os modelos esportivos do Nível 3 contra jogos REAIS.
 *
 * Por quê: Poisson/Dixon-Coles e Elo são ensinados no site como educação, mas nunca
 * tiveram track record próprio. Sem prova, o pivô para apostas esportivas é retórica.
 * Este script mede o skill deles no Brasileirão com dados reais da ESPN (grátis, sem
 * chave), do jeito honesto:
 *
 *   • WALK-FORWARD: cada jogo é previsto usando SÓ os jogos anteriores. Zero vazamento.
 *   • BASELINE obrigatória: as base rates da liga (casa/empate/fora) no mesmo período.
 *     Brier sem baseline não significa nada — o que importa é BATER o trivial.
 *   • Brier MULTICLASSE (3 desfechos) + acurácia do palpite principal.
 *
 * Fórmulas idênticas às de server/routes/levels.ts (é o NOSSO modelo sob teste):
 *   Poisson/DC: λcasa = atq_casa × def_fora × médiaGols × 1.10 ; τ com rho = −0.13
 *   Elo:        p = 1 / (1 + 10^((rB − rA_ajustado)/400)), vantagem de casa 65, K 32
 *
 * Uso:  node scripts/backtest-sports.mjs [--liga bra.1] [--anos 2023,2024,2025,2026] [--warmup 60]
 *
 * Multi-temporada: cada ano roda ISOLADO (ratings e Elo zeram a cada temporada — time
 * muda de elenco, carregar rating entre anos contaminaria), e as previsões
 * out-of-sample de todos os anos são AGRUPADAS no resultado final. Mais amostra,
 * sem misturar temporadas.
 */

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };

const LEAGUE = arg("liga", "bra.1");
const YEARS = String(arg("anos", arg("ano", "2026"))).split(",").map((y) => Number(y.trim())).filter(Boolean);
const WARMUP = Number(arg("warmup", "60")); // jogos usados só para treinar (sem prever)

// Constantes DO SITE (levels.ts) — o modelo sob teste é o que ensinamos.
const POISSON = { maxGoals: 10, rho: -0.13, homeAdv: 1.10 };
const ELO = { kBase: 32, homeAdvantage: 65, start: 1500 };

// ── Coleta: ESPN scoreboard (público, sem chave) ─────────────────────────────

async function fetchMonth(y, m) {
  const start = `${y}${String(m).padStart(2, "0")}01`;
  const endDay = new Date(y, m, 0).getDate();
  const end = `${y}${String(m).padStart(2, "0")}${endDay}`;
  const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${LEAGUE}/scoreboard?dates=${start}-${end}&limit=400`;
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) return [];
  const data = await res.json();
  const out = [];
  for (const ev of data.events ?? []) {
    const c = ev.competitions?.[0];
    if (!c?.status?.type?.completed) continue;           // só jogos encerrados
    const home = c.competitors.find((x) => x.homeAway === "home");
    const away = c.competitors.find((x) => x.homeAway === "away");
    const hg = Number(home?.score), ag = Number(away?.score);
    if (!home || !away || !Number.isFinite(hg) || !Number.isFinite(ag)) continue;
    out.push({ date: ev.date, home: home.team.displayName, away: away.team.displayName, hg, ag });
  }
  return out;
}

async function fetchSeason(year) {
  const all = [];
  for (let m = 1; m <= 12; m++) {
    const batch = await fetchMonth(year, m);
    all.push(...batch);
    process.stdout.write(`\r  ${year}: coletando… ${all.length} jogos   `);
  }
  const seen = new Set();
  const games = all
    .filter((g) => { const k = `${g.date}|${g.home}|${g.away}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  process.stdout.write(`\r  ${year}: ${games.length} jogos encerrados      \n`);
  return games;
}

// ── Modelo 1: Poisson + Dixon-Coles (idêntico a levels.ts) ───────────────────

function poissonPmf(k, lam) {
  if (lam <= 0) return k === 0 ? 1 : 0;
  let logP = -lam + k * Math.log(lam);
  for (let i = 1; i <= k; i++) logP -= Math.log(i);
  return Math.exp(logP);
}

/** Forças atk/def multiplicativas (relativas à média da liga) a partir do histórico. */
function ratingsFrom(history) {
  const s = new Map();
  const get = (t) => { if (!s.has(t)) s.set(t, { gf: 0, ga: 0, n: 0 }); return s.get(t); };
  let goals = 0;
  for (const g of history) {
    const h = get(g.home), a = get(g.away);
    h.gf += g.hg; h.ga += g.ag; h.n++;
    a.gf += g.ag; a.ga += g.hg; a.n++;
    goals += g.hg + g.ag;
  }
  const leagueAvg = history.length ? goals / (history.length * 2) : 1.35; // gols por time por jogo
  const out = new Map();
  s.forEach((v, t) => {
    out.set(t, {
      attack: v.n && leagueAvg > 0 ? (v.gf / v.n) / leagueAvg : 1,
      defense: v.n && leagueAvg > 0 ? (v.ga / v.n) / leagueAvg : 1,
      n: v.n,
    });
  });
  return { ratings: out, leagueAvg };
}

function predictPoisson(homeTeam, awayTeam, ratings, leagueAvg) {
  const h = ratings.get(homeTeam) ?? { attack: 1, defense: 1 };
  const a = ratings.get(awayTeam) ?? { attack: 1, defense: 1 };
  const lamH = h.attack * a.defense * leagueAvg * POISSON.homeAdv;
  const lamA = a.attack * h.defense * leagueAvg;

  let pH = 0, pD = 0, pA = 0, total = 0;
  for (let i = 0; i <= POISSON.maxGoals; i++) {
    for (let j = 0; j <= POISSON.maxGoals; j++) {
      let p = poissonPmf(i, lamH) * poissonPmf(j, lamA);
      // Correção Dixon-Coles para placares baixos (dependência 0-0/1-0/0-1/1-1)
      const rho = POISSON.rho;
      let tau = 1;
      if (i === 0 && j === 0) tau = 1 - lamH * lamA * rho;
      else if (i === 1 && j === 0) tau = 1 + lamA * rho;
      else if (i === 0 && j === 1) tau = 1 + lamH * rho;
      else if (i === 1 && j === 1) tau = 1 - rho;
      p *= tau;
      total += p;
      if (i > j) pH += p; else if (i === j) pD += p; else pA += p;
    }
  }
  return total > 0 ? [pH / total, pD / total, pA / total] : [1 / 3, 1 / 3, 1 / 3];
}

// ── Modelo 2: Elo (idêntico a levels.ts) ─────────────────────────────────────

function eloExpected(rHome, rAway) {
  return 1 / (1 + Math.pow(10, (rAway - (rHome + ELO.homeAdvantage)) / 400));
}

/**
 * Elo é binário por natureza; futebol tem 3 desfechos. Convertemos usando a taxa de
 * empate OBSERVADA no treino (não um chute), dividindo o resto pela razão do Elo.
 */
function predictElo(rHome, rAway, drawRate) {
  const e = eloExpected(rHome, rAway);
  return [(1 - drawRate) * e, drawRate, (1 - drawRate) * (1 - e)];
}

function updateElo(elo, g) {
  const rH = elo.get(g.home) ?? ELO.start;
  const rA = elo.get(g.away) ?? ELO.start;
  const exp = eloExpected(rH, rA);
  const score = g.hg > g.ag ? 1 : g.hg === g.ag ? 0.5 : 0;
  elo.set(g.home, rH + ELO.kBase * (score - exp));
  elo.set(g.away, rA + ELO.kBase * ((1 - score) - (1 - exp)));
}

// ── Métricas ─────────────────────────────────────────────────────────────────

const outcomeIndex = (g) => (g.hg > g.ag ? 0 : g.hg === g.ag ? 1 : 2);

/** Brier multiclasse: soma dos quadrados dos erros nos 3 desfechos (menor = melhor). */
function brier(p, idx) {
  return p.reduce((acc, pi, i) => acc + (pi - (i === idx ? 1 : 0)) ** 2, 0);
}

function summarize(name, preds, actuals) {
  const bs = preds.map((p, i) => brier(p, actuals[i]));
  const hits = preds.filter((p, i) => p.indexOf(Math.max(...p)) === actuals[i]).length;
  return {
    name,
    n: preds.length,
    brier: bs.reduce((a, b) => a + b, 0) / bs.length,
    accuracy: (hits / preds.length) * 100,
  };
}

// ── Execução ─────────────────────────────────────────────────────────────────

(async () => {
  console.log(`\n╔══════════════════════════════════════════════════════════╗`);
  console.log(`║  BACKTEST DOS MODELOS ESPORTIVOS — dados REAIS (ESPN)     ║`);
  console.log(`╚══════════════════════════════════════════════════════════╝`);
  console.log(`  liga=${LEAGUE}  temporadas=${YEARS.join(", ")}  warmup=${WARMUP} jogos/temporada\n`);

  const preds = { poisson: [], elo: [], baseline: [] };
  const actuals = [];
  const perSeason = [];

  for (const year of YEARS) {
    const games = await fetchSeason(year);
    if (games.length < WARMUP + 20) {
      console.log(`     ↳ pulada: amostra insuficiente (precisa de ${WARMUP}+20).`);
      continue;
    }

    const elo = new Map();                                   // Elo zera a cada temporada
    for (let i = 0; i < WARMUP; i++) updateElo(elo, games[i]); // aquece sem prever
    const before = actuals.length;

    for (let i = WARMUP; i < games.length; i++) {
      const g = games[i];
      const history = games.slice(0, i);                     // SÓ o passado DESTA temporada

      const { ratings, leagueAvg } = ratingsFrom(history);
      const counts = history.reduce((a, m) => { a[outcomeIndex(m)]++; return a; }, [0, 0, 0]);
      const baseRates = counts.map((c) => c / history.length); // base rate da liga (baseline)
      const drawRate = baseRates[1];

      preds.poisson.push(predictPoisson(g.home, g.away, ratings, leagueAvg));
      preds.elo.push(predictElo(elo.get(g.home) ?? ELO.start, elo.get(g.away) ?? ELO.start, drawRate));
      preds.baseline.push(baseRates);
      actuals.push(outcomeIndex(g));

      updateElo(elo, g); // só DEPOIS de prever
    }
    perSeason.push({ year, previstos: actuals.length - before });
  }

  if (actuals.length === 0) {
    console.log(`\n  ⚠️  Nenhuma temporada com amostra suficiente. Abortando sem inventar número.\n`);
    process.exit(0);
  }
  console.log(`\n  Previstos (out-of-sample): ${actuals.length}  [${perSeason.map((s) => `${s.year}: ${s.previstos}`).join(" · ")}]\n`);

  const rows = [
    summarize("Poisson + Dixon-Coles", preds.poisson, actuals),
    summarize("Elo (vantagem de casa)", preds.elo, actuals),
    summarize("Baseline (base rate)", preds.baseline, actuals),
  ];
  const base = rows[2].brier;

  console.log("  ┌────────────────────────────┬────────┬──────────┬───────────────┐");
  console.log("  │ Modelo                     │  Brier │ Acurácia │ Skill vs base │");
  console.log("  ├────────────────────────────┼────────┼──────────┼───────────────┤");
  for (const r of rows) {
    const skill = r.name.startsWith("Baseline") ? "     —" : `${(((1 - r.brier / base)) * 100).toFixed(1).padStart(5)}%`;
    console.log(`  │ ${r.name.padEnd(26)} │ ${r.brier.toFixed(4)} │ ${r.accuracy.toFixed(1).padStart(6)}% │ ${skill.padStart(13)} │`);
  }
  console.log("  └────────────────────────────┴────────┴──────────┴───────────────┘");

  const best = rows.slice(0, 2).sort((a, b) => a.brier - b.brier)[0];
  console.log(`\n  Amostra out-of-sample: ${rows[0].n} jogos · Brier MULTICLASSE (3 desfechos), menor = melhor.`);
  console.log(`  Baseline = base rate da liga no MESMO período (o "sem skill" honesto).\n`);
  if (best.brier < base) {
    console.log(`  ✅ ${best.name} BATE a baseline (skill +${((1 - best.brier / base) * 100).toFixed(1)}%) — há sinal real.`);
  } else {
    console.log(`  ⚠️  Nenhum modelo bateu a baseline. Sem skill demonstrável nesta amostra —`);
    console.log(`      é um resultado honesto e precisa ser dito, não escondido.`);
  }
  console.log(`  ⚠️  n=${rows[0].n}: trate como indicativo, não como skill validado (o site exige n≥30 p/ estabilidade).\n`);
})();
