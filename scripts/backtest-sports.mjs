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

import {
  fetchFinishedSeason, ratingsFrom, predictPoisson, predictElo, updateElo,
  baseRatesFrom, brier, outcomeIndex, ELO,
} from "./lib/sports-models.mjs";

// Modelos, coleta e métricas vivem em lib/sports-models.mjs — COMPARTILHADOS com o
// preditor prospectivo (sports-forecast.mjs). Duas implementações do mesmo modelo
// divergiriam e os números deixariam de ser comparáveis.

const fetchSeason = async (year) => {
  const games = await fetchFinishedSeason(LEAGUE, year, (n) =>
    process.stdout.write(`  ${year}: coletando… ${n} jogos   `));
  process.stdout.write(`  ${year}: ${games.length} jogos encerrados      
`);
  return games;
};

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
      const baseRates = baseRatesFrom(history);              // base rate da liga (baseline)
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
