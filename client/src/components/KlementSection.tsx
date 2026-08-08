/**
 * KlementSection — Modelo Hoffmann-Klement para Copa 2026
 * Integrado na página de Previsão Guiada.
 */

import { useState, useEffect, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import AnimatedSection from "@/components/AnimatedSection";
import { CHART_COLORS } from "@/lib/data";
import {
  Trophy, Brain, RefreshCw, ChevronDown, ChevronUp,
  ExternalLink, Info, TrendingUp, Thermometer, ArrowLeft,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type Confederation = "CONMEBOL" | "CONCACAF" | "UEFA" | "AFC" | "CAF" | "OFC" | "Play-off";

interface WCTeam {
  id: string;
  name: string;
  flag: string;
  confederation: Confederation;
  gdpPerCapita: number;
  populationM: number;
  avgTemp: number;
  fifaPoints: number;
  isHost: boolean;
}

interface SimResult {
  id: string;
  champProb: number;
  finalProb: number;
  sfProb: number;
  strength: number;
}

// ── Dataset — 48 seleções ─────────────────────────────────────────────────────

const TEAMS: WCTeam[] = [
  // CONMEBOL (6)
  { id: "ARG", name: "Argentina",      flag: "🇦🇷", confederation: "CONMEBOL", gdpPerCapita: 10700, populationM: 46,   avgTemp: 17, fifaPoints: 1880, isHost: false },
  { id: "BRA", name: "Brasil",          flag: "🇧🇷", confederation: "CONMEBOL", gdpPerCapita:  8900, populationM: 215,  avgTemp: 21, fifaPoints: 1780, isHost: false },
  { id: "COL", name: "Colômbia",        flag: "🇨🇴", confederation: "CONMEBOL", gdpPerCapita:  6500, populationM: 52,   avgTemp: 14, fifaPoints: 1730, isHost: false },
  { id: "URU", name: "Uruguai",         flag: "🇺🇾", confederation: "CONMEBOL", gdpPerCapita: 18000, populationM:  3.5, avgTemp: 17, fifaPoints: 1640, isHost: false },
  { id: "ECU", name: "Equador",         flag: "🇪🇨", confederation: "CONMEBOL", gdpPerCapita:  5900, populationM: 18,   avgTemp: 19, fifaPoints: 1575, isHost: false },
  { id: "VEN", name: "Venezuela",       flag: "🇻🇪", confederation: "CONMEBOL", gdpPerCapita:  3000, populationM: 29,   avgTemp: 26, fifaPoints: 1365, isHost: false },
  // CONCACAF (6)
  { id: "USA", name: "Estados Unidos",  flag: "🇺🇸", confederation: "CONCACAF", gdpPerCapita: 80000, populationM: 340,  avgTemp: 12, fifaPoints: 1700, isHost: true  },
  { id: "MEX", name: "México",          flag: "🇲🇽", confederation: "CONCACAF", gdpPerCapita: 11500, populationM: 130,  avgTemp: 18, fifaPoints: 1675, isHost: true  },
  { id: "CAN", name: "Canadá",          flag: "🇨🇦", confederation: "CONCACAF", gdpPerCapita: 55000, populationM: 39,   avgTemp:  4, fifaPoints: 1625, isHost: true  },
  { id: "CRC", name: "Costa Rica",      flag: "🇨🇷", confederation: "CONCACAF", gdpPerCapita: 14500, populationM:  5.2, avgTemp: 23, fifaPoints: 1515, isHost: false },
  { id: "HON", name: "Honduras",        flag: "🇭🇳", confederation: "CONCACAF", gdpPerCapita:  2500, populationM: 10.3, avgTemp: 23, fifaPoints: 1420, isHost: false },
  { id: "JAM", name: "Jamaica",         flag: "🇯🇲", confederation: "CONCACAF", gdpPerCapita:  5800, populationM:  2.9, avgTemp: 27, fifaPoints: 1415, isHost: false },
  // UEFA (16)
  { id: "FRA", name: "França",          flag: "🇫🇷", confederation: "UEFA",     gdpPerCapita: 45000, populationM: 68,   avgTemp: 12, fifaPoints: 1760, isHost: false },
  { id: "ESP", name: "Espanha",         flag: "🇪🇸", confederation: "UEFA",     gdpPerCapita: 33000, populationM: 47,   avgTemp: 14, fifaPoints: 1748, isHost: false },
  { id: "ENG", name: "Inglaterra",      flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", confederation: "UEFA",     gdpPerCapita: 48000, populationM: 56,   avgTemp: 10, fifaPoints: 1730, isHost: false },
  { id: "GER", name: "Alemanha",        flag: "🇩🇪", confederation: "UEFA",     gdpPerCapita: 55000, populationM: 84,   avgTemp:  9, fifaPoints: 1645, isHost: false },
  { id: "POR", name: "Portugal",        flag: "🇵🇹", confederation: "UEFA",     gdpPerCapita: 27000, populationM: 10.3, avgTemp: 16, fifaPoints: 1670, isHost: false },
  { id: "NED", name: "Holanda",         flag: "🇳🇱", confederation: "UEFA",     gdpPerCapita: 60000, populationM: 18,   avgTemp: 10, fifaPoints: 1710, isHost: false },
  { id: "BEL", name: "Bélgica",         flag: "🇧🇪", confederation: "UEFA",     gdpPerCapita: 50000, populationM: 11.6, avgTemp: 11, fifaPoints: 1770, isHost: false },
  { id: "CRO", name: "Croácia",         flag: "🇭🇷", confederation: "UEFA",     gdpPerCapita: 21000, populationM:  4.0, avgTemp: 12, fifaPoints: 1635, isHost: false },
  { id: "ITA", name: "Itália",          flag: "🇮🇹", confederation: "UEFA",     gdpPerCapita: 38000, populationM: 60,   avgTemp: 14, fifaPoints: 1720, isHost: false },
  { id: "SUI", name: "Suíça",           flag: "🇨🇭", confederation: "UEFA",     gdpPerCapita: 90000, populationM:  9,   avgTemp:  8, fifaPoints: 1625, isHost: false },
  { id: "AUT", name: "Áustria",         flag: "🇦🇹", confederation: "UEFA",     gdpPerCapita: 55000, populationM:  9.1, avgTemp:  9, fifaPoints: 1595, isHost: false },
  { id: "SRB", name: "Sérvia",          flag: "🇷🇸", confederation: "UEFA",     gdpPerCapita: 10000, populationM:  7,   avgTemp: 12, fifaPoints: 1570, isHost: false },
  { id: "POL", name: "Polônia",         flag: "🇵🇱", confederation: "UEFA",     gdpPerCapita: 18000, populationM: 38,   avgTemp:  9, fifaPoints: 1555, isHost: false },
  { id: "DEN", name: "Dinamarca",       flag: "🇩🇰", confederation: "UEFA",     gdpPerCapita: 67000, populationM:  5.9, avgTemp:  8, fifaPoints: 1560, isHost: false },
  { id: "SCO", name: "Escócia",         flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", confederation: "UEFA",     gdpPerCapita: 48000, populationM:  5.5, avgTemp:  9, fifaPoints: 1545, isHost: false },
  { id: "HUN", name: "Hungria",         flag: "🇭🇺", confederation: "UEFA",     gdpPerCapita: 20000, populationM: 10,   avgTemp: 11, fifaPoints: 1535, isHost: false },
  // AFC (8)
  { id: "JPN", name: "Japão",           flag: "🇯🇵", confederation: "AFC",      gdpPerCapita: 33000, populationM: 125,  avgTemp: 14, fifaPoints: 1605, isHost: false },
  { id: "KOR", name: "Coreia do Sul",   flag: "🇰🇷", confederation: "AFC",      gdpPerCapita: 35000, populationM: 52,   avgTemp: 12, fifaPoints: 1570, isHost: false },
  { id: "IRN", name: "Irã",             flag: "🇮🇷", confederation: "AFC",      gdpPerCapita:  6000, populationM: 87,   avgTemp: 17, fifaPoints: 1555, isHost: false },
  { id: "AUS", name: "Austrália",       flag: "🇦🇺", confederation: "AFC",      gdpPerCapita: 60000, populationM: 26,   avgTemp: 21, fifaPoints: 1540, isHost: false },
  { id: "SAU", name: "Arábia Saudita",  flag: "🇸🇦", confederation: "AFC",      gdpPerCapita: 26000, populationM: 36,   avgTemp: 27, fifaPoints: 1524, isHost: false },
  { id: "IRQ", name: "Iraque",          flag: "🇮🇶", confederation: "AFC",      gdpPerCapita:  5500, populationM: 42,   avgTemp: 22, fifaPoints: 1480, isHost: false },
  { id: "JOR", name: "Jordânia",        flag: "🇯🇴", confederation: "AFC",      gdpPerCapita:  4300, populationM: 10.2, avgTemp: 17, fifaPoints: 1445, isHost: false },
  { id: "UZB", name: "Uzbequistão",     flag: "🇺🇿", confederation: "AFC",      gdpPerCapita:  2300, populationM: 36,   avgTemp: 13, fifaPoints: 1430, isHost: false },
  // CAF (9)
  { id: "MAR", name: "Marrocos",        flag: "🇲🇦", confederation: "CAF",      gdpPerCapita:  3600, populationM: 37,   avgTemp: 17, fifaPoints: 1620, isHost: false },
  { id: "SEN", name: "Senegal",         flag: "🇸🇳", confederation: "CAF",      gdpPerCapita:  1700, populationM: 17,   avgTemp: 28, fifaPoints: 1575, isHost: false },
  { id: "EGY", name: "Egito",           flag: "🇪🇬", confederation: "CAF",      gdpPerCapita:  3500, populationM: 105,  avgTemp: 22, fifaPoints: 1555, isHost: false },
  { id: "NGA", name: "Nigéria",         flag: "🇳🇬", confederation: "CAF",      gdpPerCapita:  2200, populationM: 220,  avgTemp: 27, fifaPoints: 1545, isHost: false },
  { id: "CMR", name: "Camarões",        flag: "🇨🇲", confederation: "CAF",      gdpPerCapita:  1700, populationM: 28,   avgTemp: 25, fifaPoints: 1505, isHost: false },
  { id: "CIV", name: "Costa do Marfim", flag: "🇨🇮", confederation: "CAF",      gdpPerCapita:  2400, populationM: 27,   avgTemp: 27, fifaPoints: 1530, isHost: false },
  { id: "MLI", name: "Mali",            flag: "🇲🇱", confederation: "CAF",      gdpPerCapita:   900, populationM: 24,   avgTemp: 28, fifaPoints: 1490, isHost: false },
  { id: "COD", name: "RD Congo",        flag: "🇨🇩", confederation: "CAF",      gdpPerCapita:   600, populationM: 100,  avgTemp: 24, fifaPoints: 1480, isHost: false },
  { id: "ZAF", name: "África do Sul",   flag: "🇿🇦", confederation: "CAF",      gdpPerCapita:  6500, populationM: 60,   avgTemp: 17, fifaPoints: 1465, isHost: false },
  // OFC (1)
  { id: "NZL", name: "Nova Zelândia",   flag: "🇳🇿", confederation: "OFC",      gdpPerCapita: 46000, populationM:  5.1, avgTemp: 12, fifaPoints: 1420, isHost: false },
  // Play-offs intercontinentais (2)
  { id: "PO1", name: "Play-off 1",      flag: "🌐",  confederation: "Play-off", gdpPerCapita:  8000, populationM: 15,   avgTemp: 20, fifaPoints: 1430, isHost: false },
  { id: "PO2", name: "Play-off 2",      flag: "🌐",  confederation: "Play-off", gdpPerCapita:  5000, populationM: 20,   avgTemp: 22, fifaPoints: 1410, isHost: false },
];

// ── Modelo Hoffmann-Klement ────────────────────────────────────────────────────

function computeStrength(t: WCTeam): number {
  const logGdp   = Math.log(t.gdpPerCapita);
  const logPop   = Math.log(t.populationM);
  const tempLin  = 0.046  * t.avgTemp;
  const tempQuad = -0.0016 * t.avgTemp * t.avgTemp;
  const fifaNorm = 0.50 * (t.fifaPoints - 1300) / 600;
  const home     = t.isHost ? 0.383 / 3 : 0;
  return -1.175 + 0.221 * logGdp + 0.184 * logPop + tempLin + tempQuad + fifaNorm + home;
}

const STRENGTHS = Object.fromEntries(TEAMS.map(t => [t.id, computeStrength(t)]));

function pWin(sA: number, sB: number): number {
  return 1 / (1 + Math.exp(-1.3 * (sA - sB)));
}

function groupMatch(sA: number, sB: number): "A" | "B" | "D" {
  const diff = sA - sB;
  const pDraw = 0.26 * Math.exp(-Math.abs(diff) * 0.55);
  const pA = (1 - pDraw) * pWin(sA, sB);
  const r = Math.random();
  if (r < pA) return "A";
  if (r < pA + pDraw) return "D";
  return "B";
}

function koMatch(sA: number, sB: number): "A" | "B" {
  return Math.random() < pWin(sA, sB) ? "A" : "B";
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function simulateGroup(group: WCTeam[]): { rank: WCTeam[]; pts: Record<string, number> } {
  const pts: Record<string, number> = Object.fromEntries(group.map(t => [t.id, 0]));
  const gd:  Record<string, number> = Object.fromEntries(group.map(t => [t.id, 0]));
  for (let i = 0; i < 4; i++) {
    for (let j = i + 1; j < 4; j++) {
      const res = groupMatch(STRENGTHS[group[i].id], STRENGTHS[group[j].id]);
      if (res === "A")      { pts[group[i].id] += 3; gd[group[i].id]++; gd[group[j].id]--; }
      else if (res === "B") { pts[group[j].id] += 3; gd[group[j].id]++; gd[group[i].id]--; }
      else                  { pts[group[i].id]++;  pts[group[j].id]++; }
    }
  }
  const rank = [...group].sort((a, b) =>
    pts[b.id] !== pts[a.id] ? pts[b.id] - pts[a.id] : gd[b.id] - gd[a.id]
  );
  return { rank, pts };
}

function simulateTournament(): { champion: string; finalist: string; semifinalists: string[] } {
  const shuffled = shuffle(TEAMS);
  const groups: WCTeam[][] = Array.from({ length: 12 }, (_, i) => shuffled.slice(i * 4, i * 4 + 4));

  const first: WCTeam[] = [];
  const second: WCTeam[] = [];
  const thirds: { team: WCTeam; pts: number }[] = [];

  for (const group of groups) {
    const { rank, pts } = simulateGroup(group);
    first.push(rank[0]);
    second.push(rank[1]);
    thirds.push({ team: rank[2], pts: pts[rank[2].id] });
  }

  const best8thirds = thirds.sort((a, b) => b.pts - a.pts).slice(0, 8).map(x => x.team);
  let round = shuffle([...first, ...second, ...best8thirds]);
  const semis: string[] = [];

  while (round.length > 2) {
    const next: WCTeam[] = [];
    for (let i = 0; i < round.length; i += 2) {
      const res = koMatch(STRENGTHS[round[i].id], STRENGTHS[round[i + 1].id]);
      next.push(res === "A" ? round[i] : round[i + 1]);
    }
    if (round.length === 4) semis.push(...round.map(t => t.id));
    round = next;
  }

  const finalResult = koMatch(STRENGTHS[round[0].id], STRENGTHS[round[1].id]);
  return {
    champion: finalResult === "A" ? round[0].id : round[1].id,
    finalist: finalResult === "A" ? round[1].id : round[0].id,
    semifinalists: semis,
  };
}

function runMonteCarlo(n: number): SimResult[] {
  const champWins: Record<string, number> = Object.fromEntries(TEAMS.map(t => [t.id, 0]));
  const finalWins: Record<string, number> = Object.fromEntries(TEAMS.map(t => [t.id, 0]));
  const sfWins:    Record<string, number> = Object.fromEntries(TEAMS.map(t => [t.id, 0]));

  for (let i = 0; i < n; i++) {
    const { champion, finalist, semifinalists } = simulateTournament();
    champWins[champion]++;
    finalWins[champion]++;
    finalWins[finalist]++;
    semifinalists.forEach(id => sfWins[id]++);
  }

  return TEAMS.map(t => ({
    id: t.id,
    champProb: parseFloat(((champWins[t.id] / n) * 100).toFixed(1)),
    finalProb: parseFloat(((finalWins[t.id] / n) * 100).toFixed(1)),
    sfProb:    parseFloat(((sfWins[t.id]    / n) * 100).toFixed(1)),
    strength:  parseFloat(STRENGTHS[t.id].toFixed(3)),
  })).sort((a, b) => b.champProb - a.champProb);
}

// ── Helpers visuais ───────────────────────────────────────────────────────────

const CONF_COLORS: Record<Confederation, string> = {
  CONMEBOL: "#4ade80", CONCACAF: "#f87171", UEFA: "#60a5fa",
  AFC: "#c084fc", CAF: "#fbbf24", OFC: "#2dd4bf", "Play-off": "#6b7280",
};

const CONF_LABEL: Record<Confederation, string> = {
  CONMEBOL: "América do Sul", CONCACAF: "América do Norte/Central", UEFA: "Europa",
  AFC: "Ásia", CAF: "África", OFC: "Oceania", "Play-off": "Play-off",
};

function teamById(id: string): WCTeam {
  return TEAMS.find(t => t.id === id)!;
}

// ── Sub-componentes ───────────────────────────────────────────────────────────

function MethodologyPanel() {
  const [open, setOpen] = useState(false);
  return (
    <div className="glass-card rounded-xl overflow-hidden border border-gold/15">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-gold/5 transition-colors"
      >
        <Brain className="w-4 h-4 text-gold shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">Metodologia — Modelo Hoffmann-Klement</p>
          <p className="text-xs text-muted-foreground mt-0.5">Paper acadêmico de 2002 + ranking FIFA · acertou 3 de 3 Copas</p>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gold/60" /> : <ChevronDown className="w-4 h-4 text-gold/60" />}
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-4 border-t border-border/20 pt-4">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Fórmula</p>
            <div className="p-3 rounded-lg bg-obsidian/50 border border-border/20">
              <p className="font-mono text-xs text-gold leading-relaxed">
                score = −1.175 + 0.221·ln(PIBpc) + 0.184·ln(pop)<br />
                &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;+ 0.046·T − 0.0016·T² + 0.50·FIFA_norm + home
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { label: "PIB per capita (ln)", weight: "0.221", note: "Riqueza → infraestrutura esportiva" },
              { label: "População (ln)",       weight: "0.184", note: "Pool de talentos disponíveis" },
              { label: "Temperatura (°C)",     weight: "não-linear", note: "Ótimo em ~14.4°C" },
              { label: "Pontos FIFA",          weight: "0.50 (Klement)", note: "Adição de Klement ao modelo de 2002" },
              { label: "Bônus anfitrião",      weight: "0.128/país", note: "Bônus 0.383 ÷ 3 anfitriões 2026" },
            ].map(v => (
              <div key={v.label} className="flex items-start gap-2 p-2.5 rounded-lg bg-secondary/20 border border-border/15">
                <div className="flex-1">
                  <p className="text-xs font-semibold text-foreground">{v.label}</p>
                  <p className="text-[11px] text-muted-foreground">{v.note}</p>
                </div>
                <span className="text-[10px] font-mono text-gold bg-gold/10 border border-gold/20 px-1.5 py-0.5 rounded shrink-0">{v.weight}</span>
              </div>
            ))}
          </div>

          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Histórico do modelo</p>
            <div className="flex flex-wrap gap-2">
              {[
                { year: "2014", winner: "🇩🇪 Alemanha" },
                { year: "2018", winner: "🇫🇷 França" },
                { year: "2022", winner: "🇦🇷 Argentina" },
              ].map(r => (
                <div key={r.year} className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-positive/30 bg-positive/10 text-positive text-xs">
                  <span className="font-mono font-bold">{r.year}</span>
                  <span>{r.winner}</span>
                  <span>✓</span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground mt-2 italic">
              "If you bet money on the World Cup because of this model, nobody can help you." — Joachim Klement
            </p>
          </div>

          <a
            href="https://klementoninvesting.substack.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-gold hover:underline"
          >
            <ExternalLink className="w-3 h-3" />
            Klement on Investing (Substack)
          </a>
        </div>
      )}
    </div>
  );
}

interface CustomTooltipProps { active?: boolean; payload?: Array<{ payload: SimResult & { team: WCTeam } }> }

function ChartTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="glass-card rounded-lg p-3 border border-border/40 shadow-xl text-xs space-y-1 min-w-[180px]">
      <p className="font-semibold text-foreground">{d.team.flag} {d.team.name}</p>
      <p className="text-muted-foreground">{CONF_LABEL[d.team.confederation]}</p>
      <div className="space-y-0.5 pt-1 border-t border-border/20">
        <p>Campeão: <span className="font-mono text-gold font-bold">{d.champProb.toFixed(1)}%</span></p>
        <p>Finalista: <span className="font-mono text-foreground">{d.finalProb.toFixed(1)}%</span></p>
        <p>Semifinal: <span className="font-mono text-foreground">{d.sfProb.toFixed(1)}%</span></p>
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

const N_SIMULATIONS = 10_000;

export default function KlementSection({ onClose }: { onClose: () => void }) {
  const [results, setResults] = useState<SimResult[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeConf, setActiveConf] = useState<Confederation | "all">("all");

  const runSim = useCallback(() => {
    setLoading(true);
    setResults(null);
    setTimeout(() => {
      const res = runMonteCarlo(N_SIMULATIONS);
      setResults(res);
      setLoading(false);
    }, 30);
  }, []);

  useEffect(() => { runSim(); }, [runSim]);

  const chartData = results
    ? results
        .filter(r => activeConf === "all" || teamById(r.id).confederation === activeConf)
        .slice(0, 16)
        .map(r => ({ ...r, team: teamById(r.id) }))
    : [];

  const tableData = results ? results.map(r => ({ ...r, team: teamById(r.id) })) : [];
  const winner = results?.[0];
  const winnerTeam = winner ? teamById(winner.id) : null;

  return (
    <div className="space-y-6">

      {/* Voltar */}
      <button
        onClick={onClose}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Voltar para análise IA
      </button>

      {/* Header inline */}
      <div className="flex items-center gap-4 p-4 rounded-xl border border-gold/25 bg-gold/5">
        <Trophy className="w-7 h-7 text-gold shrink-0" />
        <div className="flex-1">
          <h2 className="text-base font-bold text-foreground">Copa do Mundo 2026 — Modelo Klement</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Hoffmann, Ging &amp; Ramasamy (2002) + ranking FIFA · 3/3 acertos históricos · Monte Carlo {N_SIMULATIONS.toLocaleString("pt-BR")} iterações
          </p>
        </div>
        <button
          onClick={runSim}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/40 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-gold" : ""}`} />
          {loading ? "Simulando…" : "Ressimular"}
        </button>
      </div>

      {/* Stats cards */}
      <AnimatedSection>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Acurácia histórica", value: "3/3",  sub: "Copas previstas corretamente",    color: "text-positive" },
            { label: "Poder explicativo",  value: "55%",  sub: "Variância explicada pelo modelo",  color: "text-gold" },
            { label: "Iterações MC",       value: `${N_SIMULATIONS / 1000}k`, sub: "Simulações do torneio completo",   color: "text-neon-blue" },
            { label: "Seleções",           value: "48",   sub: "Todas as classificadas para 2026", color: "text-foreground" },
          ].map(s => (
            <div key={s.label} className="glass-card rounded-xl p-4 text-center">
              <p className={`text-2xl font-mono font-bold ${s.color}`}>{s.value}</p>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mt-1">{s.label}</p>
              <p className="text-[10px] text-muted-foreground/60 mt-0.5">{s.sub}</p>
            </div>
          ))}
        </div>
      </AnimatedSection>

      {/* Metodologia */}
      <AnimatedSection>
        <MethodologyPanel />
      </AnimatedSection>

      {/* Simulação */}
      <AnimatedSection>
        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-foreground">Probabilidade de Campeão</h3>
            <span className="text-[10px] text-muted-foreground/60">top 16 exibidos</span>
          </div>

          {/* Filtros */}
          <div className="flex flex-wrap gap-2">
            {(["all", "UEFA", "CONMEBOL", "CONCACAF", "AFC", "CAF"] as const).map(c => (
              <button
                key={c}
                onClick={() => setActiveConf(c)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  activeConf === c
                    ? "bg-gold/20 border-gold/40 text-gold"
                    : "bg-secondary/30 border-border/30 text-muted-foreground hover:text-foreground"
                }`}
              >
                {c === "all" ? "Todas" : c}
              </button>
            ))}
          </div>

          {/* Favorito */}
          {winnerTeam && winner && !loading && (
            <div className="flex items-center gap-4 p-4 rounded-xl border border-gold/25 bg-gold/5">
              <Trophy className="w-7 h-7 text-gold shrink-0" />
              <div>
                <p className="text-xs text-gold/70 uppercase tracking-wide font-semibold">Favorito do modelo</p>
                <p className="text-xl font-bold text-foreground">{winnerTeam.flag} {winnerTeam.name}</p>
                <p className="text-sm text-muted-foreground">
                  <span className="font-mono text-gold font-bold">{winner.champProb.toFixed(1)}%</span>
                  {" "}de chance de campeão
                  {" "}· Final: <span className="font-mono">{winner.finalProb.toFixed(1)}%</span>
                </p>
              </div>
            </div>
          )}

          {/* Gráfico */}
          {loading ? (
            <div className="h-72 glass-card rounded-xl flex items-center justify-center gap-3 text-muted-foreground">
              <RefreshCw className="w-5 h-5 animate-spin text-gold" />
              <span className="text-sm">Executando {N_SIMULATIONS.toLocaleString("pt-BR")} simulações…</span>
            </div>
          ) : (
            <div className="glass-card rounded-xl p-4">
              <ResponsiveContainer width="100%" height={Math.max(300, chartData.length * 28)}>
                <BarChart
                  data={chartData}
                  layout="vertical"
                  margin={{ top: 4, right: 60, left: 120, bottom: 4 }}
                >
                  <XAxis type="number" domain={[0, "dataMax"]} tickFormatter={v => `${v}%`}
                    tick={{ fontSize: 10, fill: CHART_COLORS.muted }} axisLine={false} tickLine={false} />
                  <YAxis
                    type="category" dataKey="id" width={115}
                    tick={({ y, payload }: { y: number; payload: { value: string } }) => {
                      const t = teamById(payload.value);
                      return <text x={0} y={y} dy={4} fontSize={12} fill={CHART_COLORS.muted}>{t.flag} {t.name}</text>;
                    }}
                    axisLine={false} tickLine={false}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="champProb" radius={[0, 4, 4, 0]} maxBarSize={18}>
                    {chartData.map(d => (
                      <Cell key={d.id} fill={CONF_COLORS[d.team.confederation]} fillOpacity={0.85} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-3 mt-3 justify-center">
                {(Object.entries(CONF_COLORS) as [Confederation, string][])
                  .filter(([c]) => c !== "Play-off")
                  .map(([c, color]) => (
                    <div key={c} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
                      {c}
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </AnimatedSection>

      {/* Tabela completa */}
      <AnimatedSection>
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Ranking completo — 48 seleções</h3>
          {loading ? (
            <div className="glass-card rounded-xl p-6 text-center text-muted-foreground text-sm">Calculando…</div>
          ) : (
            <div className="glass-card rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/30 bg-secondary/20">
                      <th className="text-left px-3 py-2.5 text-muted-foreground font-semibold uppercase tracking-wide">#</th>
                      <th className="text-left px-3 py-2.5 text-muted-foreground font-semibold uppercase tracking-wide">Seleção</th>
                      <th className="text-right px-3 py-2.5 text-muted-foreground font-semibold uppercase tracking-wide">Campeão</th>
                      <th className="text-right px-3 py-2.5 text-muted-foreground font-semibold uppercase tracking-wide">Final</th>
                      <th className="text-right px-3 py-2.5 text-muted-foreground font-semibold uppercase tracking-wide hidden sm:table-cell">Semi</th>
                      <th className="text-right px-3 py-2.5 text-muted-foreground font-semibold uppercase tracking-wide hidden md:table-cell">Score</th>
                      <th className="text-right px-3 py-2.5 text-muted-foreground font-semibold uppercase tracking-wide hidden lg:table-cell">PIBpc</th>
                      <th className="text-right px-3 py-2.5 text-muted-foreground font-semibold uppercase tracking-wide hidden lg:table-cell">Temp</th>
                      <th className="text-right px-3 py-2.5 text-muted-foreground font-semibold uppercase tracking-wide hidden lg:table-cell">FIFA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableData.map((r, idx) => {
                      const t = r.team;
                      const isTop3 = idx < 3;
                      const tempBad = Math.abs(t.avgTemp - 14.4) > 10;
                      return (
                        <tr key={t.id} className={`border-b border-border/10 hover:bg-secondary/10 transition-colors ${isTop3 ? "bg-gold/5" : ""}`}>
                          <td className="px-3 py-2 text-muted-foreground font-mono">
                            {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : idx + 1}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <span className="text-base leading-none">{t.flag}</span>
                              <span className="font-medium text-foreground">{t.name}</span>
                              {t.isHost && (
                                <span className="text-[9px] font-bold px-1 py-0.5 rounded border text-gold bg-gold/10 border-gold/20 uppercase">Anfitrião</span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <span className={`font-mono font-bold ${r.champProb >= 10 ? "text-gold" : r.champProb >= 5 ? "text-foreground" : r.champProb >= 1 ? "text-foreground/70" : "text-muted-foreground"}`}>
                              {r.champProb.toFixed(1)}%
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-foreground/70">{r.finalProb.toFixed(1)}%</td>
                          <td className="px-3 py-2 text-right font-mono text-muted-foreground hidden sm:table-cell">{r.sfProb.toFixed(1)}%</td>
                          <td className="px-3 py-2 text-right font-mono text-muted-foreground hidden md:table-cell">{r.strength.toFixed(3)}</td>
                          <td className="px-3 py-2 text-right text-muted-foreground hidden lg:table-cell">${(t.gdpPerCapita / 1000).toFixed(0)}k</td>
                          <td className={`px-3 py-2 text-right font-mono hidden lg:table-cell ${tempBad ? "text-negative/70" : "text-positive/70"}`}>{t.avgTemp}°C</td>
                          <td className="px-3 py-2 text-right font-mono text-muted-foreground hidden lg:table-cell">{t.fifaPoints}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </AnimatedSection>

      {/* Insights */}
      {results && !loading && (
        <AnimatedSection>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="glass-card rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-blue-400">
                <TrendingUp className="w-4 h-4" />
                <p className="text-xs font-semibold uppercase tracking-wide">Europa domina</p>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Europa combina alto PIB, temperatura próxima ao ótimo de 14°C e ranking FIFA sólido.
              </p>
            </div>
            <div className="glass-card rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-orange-400">
                <Trophy className="w-4 h-4" />
                <p className="text-xs font-semibold uppercase tracking-wide">Anfitriões 2026</p>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                USA + México + Canadá dividem o bônus (0.383 ÷ 3 = 0.128 cada). Impacto menor que em Copas com host único.
              </p>
            </div>
            <div className="glass-card rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-teal-400">
                <Thermometer className="w-4 h-4" />
                <p className="text-xs font-semibold uppercase tracking-wide">Paradoxo climático</p>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Países tropicais (África, Brasil) e subarctivos (Canadá) são penalizados pelo modelo.
              </p>
            </div>
          </div>
        </AnimatedSection>
      )}

      {/* Disclaimer */}
      <AnimatedSection>
        <div className="flex items-start gap-3 p-4 rounded-xl border border-border/20 bg-secondary/10">
          <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            <strong className="text-foreground">Análise educacional:</strong> Modelo explica ~55% da variância histórica.
            {" "}<em>"If you bet money on the World Cup because of this model, nobody can help you."</em> — Klement.{" "}
            <a href="https://klementoninvesting.substack.com" target="_blank" rel="noopener noreferrer" className="text-gold hover:underline">Klement on Investing</a>
            {" "}·{" "}
            <a href="https://econpapers.repec.org/article/agsjaecon/44292.htm" target="_blank" rel="noopener noreferrer" className="text-gold hover:underline">Hoffmann et al. (2002)</a>
          </p>
        </div>
      </AnimatedSection>
    </div>
  );
}
