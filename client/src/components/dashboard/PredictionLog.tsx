/**
 * Prediction Log — linha de previsão (PredictionRow) + painel "você vs mercado"
 * (UserVsMarket). Extraídos de pages/Dashboard.tsx. Comportamento idêntico.
 */
import { useState } from "react";
import {
  CheckCircle, X as XIcon, Target, Check, Copy, Share2, Trash2,
  Trophy, BarChart2,
} from "lucide-react";
import type { StoredPrediction } from "@/lib/predictions";

export function PredictionRow({
  pred,
  onResolve,
  onDelete,
}: {
  pred: StoredPrediction;
  onResolve: (id: string, outcome: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const edgePp = pred.userProb - pred.marketProb;
  const edgeColor = edgePp > 3 ? "text-positive" : edgePp < -3 ? "text-negative" : "text-muted-foreground";
  const savedDate = new Date(pred.savedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });

  function handleShare() {
    const text = `Previsão JLB Analytics\n📊 ${pred.question}\n🎯 Minha estimativa: ${pred.userProb}% | Mercado: ${pred.marketProb.toFixed(1)}% | Edge: ${edgePp >= 0 ? "+" : ""}${edgePp.toFixed(1)}pp\n${window.location.origin}/previsao`;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {/* ignore permission errors */});
  }

  return (
    <div className={`p-3 rounded-xl border transition-colors ${
      pred.resolved
        ? pred.outcome
          ? "border-positive/20 bg-positive/3"
          : "border-negative/20 bg-negative/3"
        : "border-border/30 bg-secondary/10"
    }`}>
      <div className="flex items-start gap-3">
        <div className="shrink-0 mt-0.5">
          {pred.resolved ? (
            pred.outcome
              ? <CheckCircle className="w-4 h-4 text-positive" />
              : <XIcon className="w-4 h-4 text-negative" />
          ) : (
            <Target className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-foreground leading-snug line-clamp-2">{pred.question}</p>
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            <span className="text-[10px] text-muted-foreground">{savedDate}</span>
            <span className="text-[10px] font-mono">
              Você: <span className="text-gold font-semibold">{pred.userProb}%</span>
            </span>
            <span className="text-[10px] font-mono">
              Mercado: <span className="text-muted-foreground">{pred.marketProb.toFixed(1)}%</span>
            </span>
            <span className={`text-[10px] font-mono font-semibold ${edgeColor}`}>
              Edge: {edgePp >= 0 ? "+" : ""}{edgePp.toFixed(1)}pp
            </span>
            {pred.resolved && pred.brierScore !== null && (
              <span className="text-[10px] font-mono">
                BS: <span className={pred.brierScore < 0.1 ? "text-positive" : pred.brierScore < 0.25 ? "text-warning" : "text-negative"}>
                  {pred.brierScore.toFixed(3)}
                </span>
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {!pred.resolved && (
            <>
              <button
                onClick={() => onResolve(pred.id, true)}
                title="Resolveu: SIM"
                aria-label="Marcar previsão como SIM (correta)"
                className="p-1 rounded-md text-positive/60 hover:text-positive hover:bg-positive/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-positive"
              >
                <Check className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
              <button
                onClick={() => onResolve(pred.id, false)}
                title="Resolveu: NÃO"
                aria-label="Marcar previsão como NÃO (incorreta)"
                className="p-1 rounded-md text-negative/60 hover:text-negative hover:bg-negative/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-negative"
              >
                <XIcon className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </>
          )}
          <button
            onClick={handleShare}
            title="Compartilhar previsão (copia link)"
            aria-label="Compartilhar previsão"
            className={`p-1 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border ${
              copied ? "text-positive" : "text-muted-foreground/40 hover:text-neon-blue hover:bg-neon-blue/10"
            }`}
          >
            {copied ? <Copy className="w-3.5 h-3.5" aria-hidden="true" /> : <Share2 className="w-3.5 h-3.5" aria-hidden="true" />}
          </button>
          <button
            onClick={() => onDelete(pred.id)}
            title="Remover previsão"
            aria-label="Remover previsão"
            className="p-1 rounded-md text-muted-foreground/40 hover:text-muted-foreground hover:bg-secondary/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border"
          >
            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function categorizeQuestion(question: string): string {
  const q = question.toLowerCase();
  if (/bitcoin|crypto|btc|eth|defi|blockchain|token|solana|bnb/.test(q)) return "Cripto";
  if (/election|elect|trump|biden|senate|president|vote|congress|politic|governo|eleicao|presidente|candidat/.test(q)) return "Política";
  if (/soccer|football|nba|nfl|tennis|sport|goal|match|game|team|player|futebol|gol|campeonato|copa|mundial/.test(q)) return "Esportes";
  if (/inflation|gdp|economy|fed|rate|dollar|selic|ipca|pib|cambio|juros|banco|fiscal/.test(q)) return "Economia";
  if (/ai|tech|software|startup|openai|gpu|chip|acquisition|ipo|meta|apple|google/.test(q)) return "Tech";
  if (/oil|petrol|energy|gas|solar|climate|enso|temperatura|chuva|seca/.test(q)) return "Energia/Clima";
  return "Outros";
}

function getCalibrationStreak(preds: StoredPrediction[]): number {
  const resolvedSorted = preds
    .filter((p) => p.resolved && p.brierScore !== null)
    .sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
  let streak = 0;
  for (const p of resolvedSorted) {
    if ((p.brierScore ?? 1) < 0.15) streak++;
    else break;
  }
  return streak;
}

export function UserVsMarket({ preds }: { preds: StoredPrediction[] }) {
  const resolved = preds.filter((p) => p.resolved && p.outcome !== null);
  if (resolved.length < 3) return null;

  const beatsMarket = resolved.filter((p) => {
    const outcome = p.outcome ? 1 : 0;
    const userErr = Math.pow(outcome - p.userProb / 100, 2);
    const mktErr  = Math.pow(outcome - p.marketProb / 100, 2);
    return userErr < mktErr;
  }).length;

  const beatPct = Math.round((beatsMarket / resolved.length) * 100);
  const avgEdgePp = parseFloat(
    (resolved.reduce((s, p) => s + (p.userProb - p.marketProb), 0) / resolved.length).toFixed(1)
  );
  const streak = getCalibrationStreak(preds);

  // Percentil estimado baseado na distribuição de Brier Scores de forecasters amadores/profissionais
  // Ref: Tetlock & Gardner "Superforecasting"; baseline naive = 0.25, mediana amadores = 0.18, top decil = 0.09
  const avgBrier = resolved.reduce((s, p) => s + (p.brierScore ?? 0.25), 0) / resolved.length;
  const calibPercentile = avgBrier <= 0.07 ? 95
    : avgBrier <= 0.09 ? 90
    : avgBrier <= 0.11 ? 80
    : avgBrier <= 0.13 ? 70
    : avgBrier <= 0.16 ? 60
    : avgBrier <= 0.18 ? 50
    : avgBrier <= 0.20 ? 40
    : avgBrier <= 0.22 ? 30
    : avgBrier <= 0.24 ? 20
    : 10;
  const calibLabel = calibPercentile >= 80 ? "Superforecaster" : calibPercentile >= 60 ? "Acima da média" : calibPercentile >= 40 ? "Na média" : "Abaixo da média";

  // Calibração por domínio
  const domainMap = new Map<string, { bs: number; count: number }>();
  resolved.forEach((p) => {
    const cat = categorizeQuestion(p.question);
    const prev = domainMap.get(cat) ?? { bs: 0, count: 0 };
    domainMap.set(cat, { bs: prev.bs + (p.brierScore ?? 0), count: prev.count + 1 });
  });
  const domains = Array.from(domainMap.entries())
    .map(([cat, { bs, count }]) => ({ cat, bs: bs / count, count }))
    .sort((a, b) => a.bs - b.bs);

  return (
    <div className="space-y-4 border-t border-border/20 pt-4">
      {/* User vs Market */}
      <div>
        <p className="text-xs font-medium text-foreground mb-3 flex items-center gap-2">
          <Trophy className="w-3.5 h-3.5 text-gold" />
          Desempenho vs Mercado
        </p>
        <div className="grid grid-cols-3 gap-2">
          <div className="p-3 rounded-lg bg-secondary/30 text-center">
            <p className={`text-xl font-bold font-mono ${beatPct >= 50 ? "text-positive" : "text-negative"}`}>{beatPct}%</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">bateu o mercado</p>
            <p className="text-[9px] text-muted-foreground/50">{beatsMarket}/{resolved.length} previsões</p>
          </div>
          <div className="p-3 rounded-lg bg-secondary/30 text-center">
            <p className={`text-xl font-bold font-mono ${avgEdgePp > 0 ? "text-positive" : avgEdgePp < 0 ? "text-negative" : "text-foreground"}`}>
              {avgEdgePp >= 0 ? "+" : ""}{avgEdgePp}pp
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">edge médio</p>
            <p className="text-[9px] text-muted-foreground/50">sua prob − mercado</p>
          </div>
          <div className="p-3 rounded-lg bg-secondary/30 text-center">
            <p className={`text-xl font-bold font-mono ${streak >= 3 ? "text-positive" : streak >= 1 ? "text-warning" : "text-muted-foreground"}`}>
              {streak}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">sequência</p>
            <p className="text-[9px] text-muted-foreground/50">BS {"<"} 0.15 seguidos</p>
          </div>
        </div>
        {/* Percentil estimado */}
        {resolved.length >= 5 && (
          <div className={`mt-2 flex items-center gap-2.5 p-2.5 rounded-lg border ${calibPercentile >= 70 ? "bg-positive/5 border-positive/20" : calibPercentile >= 40 ? "bg-gold/5 border-gold/20" : "bg-secondary/20 border-border/20"}`}>
            <div className="text-center shrink-0 w-10">
              <p className={`text-lg font-bold font-mono leading-none ${calibPercentile >= 70 ? "text-positive" : calibPercentile >= 40 ? "text-gold" : "text-muted-foreground"}`}>
                {calibPercentile}%
              </p>
              <p className="text-[8px] text-muted-foreground/60 leading-none mt-0.5">top</p>
            </div>
            <div>
              <p className={`text-[11px] font-semibold ${calibPercentile >= 70 ? "text-positive" : calibPercentile >= 40 ? "text-gold" : "text-foreground"}`}>{calibLabel}</p>
              <p className="text-[10px] text-muted-foreground">Brier médio: {avgBrier.toFixed(3)} · percentil estimado vs. forecasters globais</p>
            </div>
          </div>
        )}
        {beatPct >= 60 && (
          <div className="mt-2 flex items-center gap-2 p-2 rounded-lg bg-positive/5 border border-positive/20">
            <Trophy className="w-3 h-3 text-positive shrink-0" />
            <p className="text-[10px] text-positive">Você está batendo o mercado consistentemente. Skill Score acima da média.</p>
          </div>
        )}
      </div>

      {/* Calibração por domínio */}
      {domains.length >= 2 && (
        <div>
          <p className="text-xs font-medium text-foreground mb-2 flex items-center gap-2">
            <BarChart2 className="w-3.5 h-3.5 text-primary" />
            Calibração por domínio
          </p>
          <div className="space-y-1.5">
            {domains.map(({ cat, bs, count }) => {
              const stars = bs < 0.08 ? 5 : bs < 0.12 ? 4 : bs < 0.16 ? 3 : bs < 0.22 ? 2 : 1;
              const color = bs < 0.1 ? "text-positive" : bs < 0.2 ? "text-warning" : "text-negative";
              const barW = Math.max(4, Math.min(100, (1 - bs / 0.5) * 100));
              return (
                <div key={cat} className="flex items-center gap-3">
                  <span className="text-[11px] text-muted-foreground w-24 shrink-0">{cat}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-secondary/40 overflow-hidden">
                    <div className={`h-full rounded-full ${bs < 0.1 ? "bg-positive" : bs < 0.2 ? "bg-warning" : "bg-negative"}`}
                      style={{ width: `${barW}%` }} />
                  </div>
                  <span className={`text-[11px] font-mono font-bold ${color} w-12 text-right`}>{bs.toFixed(3)}</span>
                  <span className="text-[9px] text-gold">{"★".repeat(stars)}</span>
                  <span className="text-[9px] text-muted-foreground/50">({count})</span>
                </div>
              );
            })}
          </div>
          <p className="text-[9px] text-muted-foreground/50 mt-1.5">Brier Score por categoria — menor = melhor calibração</p>
        </div>
      )}
    </div>
  );
}
