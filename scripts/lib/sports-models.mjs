/**
 * sports-models.mjs — núcleo compartilhado dos modelos esportivos.
 *
 * Usado pelo backtest (passado) E pelo preditor prospectivo (futuro). Ficar num
 * só lugar é requisito de fidelidade: duas implementações do mesmo modelo
 * divergiriam com o tempo e os números deixariam de ser comparáveis.
 *
 * Fórmulas idênticas às de server/routes/levels.ts — o modelo medido é o que o
 * site ensina, não uma variante conveniente.
 */

export const POISSON = { maxGoals: 10, rho: -0.13, homeAdv: 1.10 };
export const ELO = { kBase: 32, homeAdvantage: 65, start: 1500 };

// ── Coleta (ESPN scoreboard: público, sem chave) ─────────────────────────────

const ESPN = (league, dates) =>
  `https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/scoreboard?dates=${dates}&limit=400`;

function parseEvent(ev) {
  const c = ev.competitions?.[0];
  if (!c) return null;
  const home = c.competitors?.find((x) => x.homeAway === "home");
  const away = c.competitors?.find((x) => x.homeAway === "away");
  if (!home || !away) return null;
  const hg = Number(home.score), ag = Number(away.score);
  return {
    id: String(ev.id),
    date: ev.date,
    home: home.team.displayName,
    away: away.team.displayName,
    completed: !!c.status?.type?.completed,
    hg: Number.isFinite(hg) ? hg : null,
    ag: Number.isFinite(ag) ? ag : null,
  };
}

async function fetchRange(league, dates) {
  const res = await fetch(ESPN(league, dates), { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.events ?? []).map(parseEvent).filter(Boolean);
}

const dedupSort = (rows) => {
  const seen = new Set();
  return rows
    .filter((g) => { if (seen.has(g.id)) return false; seen.add(g.id); return true; })
    .sort((a, b) => new Date(a.date) - new Date(b.date));
};

/** Todos os jogos ENCERRADOS de uma temporada (varre mês a mês). */
export async function fetchFinishedSeason(league, year, onProgress) {
  const all = [];
  for (let m = 1; m <= 12; m++) {
    const endDay = new Date(year, m, 0).getDate();
    const mm = String(m).padStart(2, "0");
    all.push(...await fetchRange(league, `${year}${mm}01-${year}${mm}${endDay}`));
    onProgress?.(all.length);
  }
  return dedupSort(all.filter((g) => g.completed && g.hg !== null && g.ag !== null));
}

/** Jogos AGENDADOS (ainda não ocorridos) nos próximos N dias. */
export async function fetchUpcoming(league, days = 10) {
  const fmt = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const now = new Date();
  const end = new Date(now.getTime() + days * 86400000);
  const rows = await fetchRange(league, `${fmt(now)}-${fmt(end)}`);
  return dedupSort(rows.filter((g) => !g.completed && new Date(g.date) > now));
}

/** Busca jogos específicos já encerrados, por intervalo de datas (para resolver). */
export async function fetchFinishedBetween(league, startDate, endDate) {
  const fmt = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rows = await fetchRange(league, `${fmt(startDate)}-${fmt(endDate)}`);
  return rows.filter((g) => g.completed && g.hg !== null && g.ag !== null);
}

// ── Modelo 1: Poisson + Dixon-Coles ──────────────────────────────────────────

function poissonPmf(k, lam) {
  if (lam <= 0) return k === 0 ? 1 : 0;
  let logP = -lam + k * Math.log(lam);
  for (let i = 1; i <= k; i++) logP -= Math.log(i);
  return Math.exp(logP);
}

/** Forças atk/def multiplicativas (relativas à média da liga) a partir do histórico. */
export function ratingsFrom(history) {
  const s = new Map();
  const get = (t) => { if (!s.has(t)) s.set(t, { gf: 0, ga: 0, n: 0 }); return s.get(t); };
  let goals = 0;
  for (const g of history) {
    const h = get(g.home), a = get(g.away);
    h.gf += g.hg; h.ga += g.ag; h.n++;
    a.gf += g.ag; a.ga += g.hg; a.n++;
    goals += g.hg + g.ag;
  }
  const leagueAvg = history.length ? goals / (history.length * 2) : 1.35;
  const ratings = new Map();
  s.forEach((v, t) => ratings.set(t, {
    attack: v.n && leagueAvg > 0 ? (v.gf / v.n) / leagueAvg : 1,
    defense: v.n && leagueAvg > 0 ? (v.ga / v.n) / leagueAvg : 1,
    n: v.n,
  }));
  return { ratings, leagueAvg };
}

/** → [pCasa, pEmpate, pFora] */
export function predictPoisson(homeTeam, awayTeam, ratings, leagueAvg) {
  const h = ratings.get(homeTeam) ?? { attack: 1, defense: 1 };
  const a = ratings.get(awayTeam) ?? { attack: 1, defense: 1 };
  const lamH = h.attack * a.defense * leagueAvg * POISSON.homeAdv;
  const lamA = a.attack * h.defense * leagueAvg;

  let pH = 0, pD = 0, pA = 0, total = 0;
  for (let i = 0; i <= POISSON.maxGoals; i++) {
    for (let j = 0; j <= POISSON.maxGoals; j++) {
      let p = poissonPmf(i, lamH) * poissonPmf(j, lamA);
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

// ── Modelo 2: Elo ────────────────────────────────────────────────────────────

export function eloExpected(rHome, rAway) {
  return 1 / (1 + Math.pow(10, (rAway - (rHome + ELO.homeAdvantage)) / 400));
}

/**
 * Elo é binário; futebol tem 3 desfechos. A taxa de empate vem OBSERVADA do
 * histórico (não é chute), e o resto é dividido pela razão do Elo.
 */
export function predictElo(rHome, rAway, drawRate) {
  const e = eloExpected(rHome, rAway);
  return [(1 - drawRate) * e, drawRate, (1 - drawRate) * (1 - e)];
}

export function updateElo(elo, g) {
  const rH = elo.get(g.home) ?? ELO.start;
  const rA = elo.get(g.away) ?? ELO.start;
  const exp = eloExpected(rH, rA);
  const score = g.hg > g.ag ? 1 : g.hg === g.ag ? 0.5 : 0;
  elo.set(g.home, rH + ELO.kBase * (score - exp));
  elo.set(g.away, rA + ELO.kBase * ((1 - score) - (1 - exp)));
}

/** Elo de todos os times a partir de um histórico (ordem cronológica). */
export function eloFrom(history) {
  const elo = new Map();
  for (const g of history) updateElo(elo, g);
  return elo;
}

// ── Métricas ─────────────────────────────────────────────────────────────────

export const OUTCOMES = ["home", "draw", "away"];
export const outcomeIndex = (g) => (g.hg > g.ag ? 0 : g.hg === g.ag ? 1 : 2);

/** Brier multiclasse: soma dos quadrados dos erros nos 3 desfechos (menor = melhor). */
export function brier(p, idx) {
  return p.reduce((acc, pi, i) => acc + (pi - (i === idx ? 1 : 0)) ** 2, 0);
}

/** Base rates observadas [casa, empate, fora] — a baseline "sem skill". */
export function baseRatesFrom(history) {
  if (!history.length) return [1 / 3, 1 / 3, 1 / 3];
  const counts = history.reduce((a, m) => { a[outcomeIndex(m)]++; return a; }, [0, 0, 0]);
  return counts.map((c) => c / history.length);
}
