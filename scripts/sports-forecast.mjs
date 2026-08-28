/**
 * sports-forecast.mjs — track record PROSPECTIVO dos modelos esportivos.
 *
 * Backtest mede o passado, e passado sempre carrega a suspeita de garimpo. Este
 * script cria a prova que não dá para falsificar:
 *
 *   --predict  → busca jogos AGENDADOS (ainda não ocorridos), calcula a previsão
 *                dos 3 modelos e GRAVA antes da bola rolar.
 *   --resolve  → busca o placar oficial dos jogos já realizados e fecha as
 *                previsões pendentes com o Brier de cada uma.
 *
 * Sem argumento roda os dois (resolve primeiro, depois prevê) — é o que um cron faz.
 *
 * Uso:  node scripts/sports-forecast.mjs [--liga bra.1] [--dias 10] [--dry]
 */

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  fetchFinishedSeason, fetchUpcoming, fetchFinishedBetween,
  ratingsFrom, predictPoisson, eloFrom, predictElo, baseRatesFrom,
  brier, outcomeIndex, OUTCOMES, ELO,
} from "./lib/sports-models.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const has = (k) => args.includes(`--${k}`);

const LEAGUE = arg("liga", "bra.1");
const DAYS = Number(arg("dias", "10"));
const DRY = has("dry");
const doPredict = has("predict") || (!has("predict") && !has("resolve"));
const doResolve = has("resolve") || (!has("predict") && !has("resolve"));

// ── Credenciais (.env, mesmo padrão do jlb-doctor) ───────────────────────────

/**
 * process.env PRIMEIRO: em produção (Render/cron do servidor) não existe .env —
 * as variáveis vêm do ambiente e são herdadas pelo spawn. O arquivo é só o
 * conforto do dev local. Sem esta ordem o job silenciosamente abortava em prod.
 */
function loadEnv() {
  const fromFile = (() => {
    const f = join(ROOT, ".env");
    if (!existsSync(f)) return {};
    return Object.fromEntries(
      readFileSync(f, "utf8").split("\n")
        .map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))
        .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
    );
  })();
  return { ...fromFile, ...Object.fromEntries(Object.entries(process.env).filter(([, v]) => v)) };
}
const env = loadEnv();
const SUPABASE_URL = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("  ✗ SUPABASE_URL / SUPABASE_SERVICE_KEY ausentes no .env — abortando.");
  process.exit(1);
}
const headers = {
  apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json", Prefer: "return=representation",
};
const rest = (path) => `${SUPABASE_URL}/rest/v1/${path}`;

// ── Previsão dos jogos futuros ───────────────────────────────────────────────

async function predict() {
  console.log(`\n▸ PREVER — ${LEAGUE}, próximos ${DAYS} dias`);
  const upcoming = await fetchUpcoming(LEAGUE, DAYS);
  if (upcoming.length === 0) { console.log("  nenhum jogo agendado no período."); return; }
  console.log(`  ${upcoming.length} jogos agendados encontrados.`);

  // Histórico da temporada corrente = base dos modelos (só jogos JÁ ocorridos).
  const year = new Date().getFullYear();
  const history = await fetchFinishedSeason(LEAGUE, year);
  console.log(`  histórico da temporada ${year}: ${history.length} jogos encerrados.`);
  if (history.length < 30) {
    console.log("  ⚠️  histórico curto (<30) — previsões seriam ruído. Abortando sem gravar.");
    return;
  }

  const { ratings, leagueAvg } = ratingsFrom(history);
  const elo = eloFrom(history);
  const base = baseRatesFrom(history);
  const drawRate = base[1];

  const rows = [];
  for (const g of upcoming) {
    const preds = {
      poisson_dc: predictPoisson(g.home, g.away, ratings, leagueAvg),
      elo: predictElo(elo.get(g.home) ?? ELO.start, elo.get(g.away) ?? ELO.start, drawRate),
      baseline: base,
    };
    for (const [model, p] of Object.entries(preds)) {
      rows.push({
        league: LEAGUE, match_id: g.id, match_date: g.date,
        home_team: g.home, away_team: g.away, model,
        p_home: Number(p[0].toFixed(4)), p_draw: Number(p[1].toFixed(4)), p_away: Number(p[2].toFixed(4)),
      });
    }
  }

  console.log(`\n  Exemplo (${upcoming[0].home} x ${upcoming[0].away}):`);
  for (const m of ["poisson_dc", "elo", "baseline"]) {
    const r = rows.find((x) => x.match_id === upcoming[0].id && x.model === m);
    console.log(`    ${m.padEnd(11)} casa ${(r.p_home * 100).toFixed(1)}% · empate ${(r.p_draw * 100).toFixed(1)}% · fora ${(r.p_away * 100).toFixed(1)}%`);
  }

  if (DRY) { console.log(`\n  [dry] ${rows.length} previsões NÃO gravadas.`); return; }

  // on_conflict: re-rodar não duplica NEM reescreve — a previsão original fica de pé.
  const res = await fetch(rest("sports_forecasts?on_conflict=match_id,model"), {
    method: "POST",
    headers: { ...headers, Prefer: "resolution=ignore-duplicates,return=representation" },
    body: JSON.stringify(rows),
  });
  if (!res.ok) { console.log(`  ✗ falha ao gravar: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`); return; }
  const saved = await res.json();
  console.log(`\n  ✅ ${saved.length} previsões novas gravadas (de ${rows.length} enviadas; repetidas são ignoradas).`);
}

// ── Resolução contra o placar oficial ────────────────────────────────────────

async function resolve() {
  console.log(`\n▸ RESOLVER — previsões pendentes de ${LEAGUE}`);
  const nowIso = new Date().toISOString();
  const r = await fetch(
    rest(`sports_forecasts?resolved=eq.false&league=eq.${LEAGUE}&match_date=lt.${nowIso}&select=id,match_id,match_date,home_team,away_team,model,p_home,p_draw,p_away&order=match_date.asc&limit=500`),
    { headers },
  );
  if (!r.ok) { console.log(`  ✗ leitura falhou: HTTP ${r.status}`); return; }
  const pending = await r.json();
  if (pending.length === 0) { console.log("  nada pendente."); return; }
  console.log(`  ${pending.length} previsões pendentes de jogos já realizados.`);

  // Busca os placares no intervalo que cobre os pendentes (+1 dia de folga).
  const dates = pending.map((p) => new Date(p.match_date));
  const start = new Date(Math.min(...dates) - 86400000);
  const end = new Date(Math.max(...dates) + 2 * 86400000);
  const finished = await fetchFinishedBetween(LEAGUE, start, end);
  const byId = new Map(finished.map((g) => [g.id, g]));
  console.log(`  ${finished.length} jogos encerrados encontrados na fonte.`);

  let done = 0, waiting = 0;
  for (const p of pending) {
    const g = byId.get(p.match_id);
    if (!g) { waiting++; continue; } // ainda não encerrado (adiado/em andamento)
    const idx = outcomeIndex(g);
    const probs = [Number(p.p_home), Number(p.p_draw), Number(p.p_away)];
    const patch = {
      resolved: true, home_goals: g.hg, away_goals: g.ag,
      outcome: OUTCOMES[idx], brier: Number(brier(probs, idx).toFixed(4)),
      resolved_at: new Date().toISOString(),
    };
    if (DRY) { done++; continue; }
    const up = await fetch(rest(`sports_forecasts?id=eq.${p.id}`), {
      method: "PATCH", headers, body: JSON.stringify(patch),
    });
    if (up.ok) done++;
  }
  console.log(`  ${DRY ? "[dry] " : ""}✅ ${done} resolvidas · ${waiting} ainda sem placar oficial.`);
}

// ── Placar acumulado ─────────────────────────────────────────────────────────

async function scoreboard() {
  const r = await fetch(rest(`sports_track_record?league=eq.${LEAGUE}&select=*`), { headers });
  if (!r.ok) return;
  const rows = await r.json();
  const resolved = rows.filter((x) => Number(x.resolved_count) > 0);
  if (resolved.length === 0) {
    console.log(`\n▸ PLACAR — ainda sem jogos resolvidos. Volte depois da próxima rodada.\n`);
    return;
  }
  console.log(`\n▸ PLACAR PROSPECTIVO (${LEAGUE}) — previsões feitas ANTES do jogo:`);
  console.log("  ┌──────────────┬──────────┬────────┬──────────┐");
  console.log("  │ Modelo       │ Resolvid │  Brier │ Acertos  │");
  console.log("  ├──────────────┼──────────┼────────┼──────────┤");
  for (const x of resolved.sort((a, b) => Number(a.brier) - Number(b.brier))) {
    const acc = ((Number(x.hit_count) / Number(x.resolved_count)) * 100).toFixed(1);
    console.log(`  │ ${String(x.model).padEnd(12)} │ ${String(x.resolved_count).padStart(8)} │ ${Number(x.brier).toFixed(4)} │ ${acc.padStart(7)}% │`);
  }
  console.log("  └──────────────┴──────────┴────────┴──────────┘");
  const n = Number(resolved[0].resolved_count);
  if (n < 30) console.log(`  ⚠️  n=${n} — amostra pequena, ainda não é evidência (o site exige n≥30).`);
  console.log();
}

(async () => {
  console.log(`\n╔═══════════════════════════════════════════════════════════╗`);
  console.log(`║  TRACK RECORD PROSPECTIVO — modelos esportivos            ║`);
  console.log(`╚═══════════════════════════════════════════════════════════╝`);
  if (doResolve) await resolve();
  if (doPredict) await predict();
  await scoreboard();
})();
