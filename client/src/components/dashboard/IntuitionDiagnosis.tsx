/**
 * IntuitionDiagnosis — "Meça a sua própria intuição". A partir das SUAS previsões
 * resolvidas (dado real, zero invenção), diz duas coisas honestas e educativas:
 *   • Você bate o mercado? (seu Brier vs o do mercado nas MESMAS apostas)
 *   • Você é superconfiante? (o quanto você DIZ ter certeza vs o quanto ACERTA)
 * É a lição "aposta ≠ investimento" com o espelho do próprio usuário — e funciona
 * sem depender da IA: usa só o histórico da pessoa.
 */
import { Gauge, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { meanBrierScore, meanMarketBrier, confidenceCalibration, type StoredPrediction } from "@/lib/predictions";

const MIN_RESOLVED = 6;

const VERDICT: Record<string, { label: string; tone: string; lesson: string }> = {
  superconfiante: {
    label: "Superconfiante",
    tone: "text-negative",
    lesson: "Você superestima suas certezas — o viés que mais destrói retorno. Quando 'tiver certeza', arrisque MENOS.",
  },
  calibrado: {
    label: "Bem calibrado",
    tone: "text-positive",
    lesson: "Sua confiança bate com seus acertos. É exatamente assim que se decide com método, não com achismo.",
  },
  cauteloso: {
    label: "Cauteloso demais",
    tone: "text-neon-blue",
    lesson: "Você subestima o que sabe. Dá pra confiar mais nas suas leituras fortes — está deixando valor na mesa.",
  },
};

export function IntuitionDiagnosis({ preds }: { preds: StoredPrediction[] }) {
  const resolvedN = preds.filter((p) => p.resolved && p.outcome !== null).length;

  if (resolvedN < MIN_RESOLVED) {
    const faltam = MIN_RESOLVED - resolvedN;
    return (
      <div className="glass-card rounded-xl p-5">
        <div className="flex items-center gap-2 mb-1.5">
          <Gauge className="w-4 h-4 text-neon-blue" />
          <p className="text-sm font-semibold text-foreground">Diagnóstico da sua intuição</p>
        </div>
        <p className="text-xs text-muted-foreground">
          Registre e resolva <strong className="text-foreground">{faltam}</strong> previsão{faltam === 1 ? "" : "ões"} a mais para desbloquear seu diagnóstico —
          quão calibrado você é e se o seu instinto bate o mercado.
        </p>
      </div>
    );
  }

  const ub = meanBrierScore(preds);
  const mb = meanMarketBrier(preds);
  const skillVsMkt = ub != null && mb != null && mb > 0 ? 1 - ub / mb : null; // >0 = melhor que o mercado
  const cc = confidenceCalibration(preds);
  const small = resolvedN < 15;

  const beat = skillVsMkt != null && skillVsMkt > 0.005;
  const MktIcon = skillVsMkt == null ? Minus : beat ? TrendingUp : Math.abs(skillVsMkt) < 0.005 ? Minus : TrendingDown;
  const mktPct = skillVsMkt == null ? null : Math.max(-99, Math.min(99, Math.round(skillVsMkt * 100)));
  const v = cc ? VERDICT[cc.verdict] : null;

  return (
    <div className="glass-card rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Gauge className="w-4 h-4 text-neon-blue" />
          <p className="text-sm font-semibold text-foreground">Diagnóstico da sua intuição</p>
        </div>
        <span className="text-[10px] text-muted-foreground/60">{resolvedN} resolvidas</span>
      </div>

      {small && (
        <p className="text-[11px] text-muted-foreground bg-secondary/20 border border-border/20 rounded-lg px-2.5 py-1.5">
          Amostra ainda pequena — leia como <strong className="text-foreground/80">tendência</strong>, não veredito. Fica mais preciso a cada previsão.
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Você vs mercado */}
        <div className="rounded-lg border border-border/20 bg-secondary/10 p-3.5">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Você vs mercado</p>
          <p className={`text-xl font-bold tabular-nums inline-flex items-center gap-1 ${skillVsMkt == null ? "text-muted-foreground" : beat ? "text-positive" : "text-negative"}`}>
            <MktIcon className="w-4 h-4" />
            {mktPct == null ? "—" : `${mktPct > 0 ? "+" : ""}${mktPct}%`}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {skillVsMkt == null ? "sem base ainda" : beat ? "seu instinto está mais calibrado que o mercado" : "o mercado está mais calibrado que você (por enquanto)"}
          </p>
        </div>

        {/* Excesso de confiança */}
        <div className="rounded-lg border border-border/20 bg-secondary/10 p-3.5">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Confiança</p>
          {cc && v ? (
            <>
              <p className={`text-xl font-bold ${v.tone}`}>{v.label}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                disse ter <strong className="text-foreground">{cc.avgConfidence}%</strong> de certeza · acertou <strong className="text-foreground">{cc.accuracy}%</strong>
                {cc.gap !== 0 && <> (gap {cc.gap > 0 ? "+" : ""}{cc.gap})</>}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">sem previsões com lado definido ainda</p>
          )}
        </div>
      </div>

      {v && (
        <p className="text-xs text-muted-foreground leading-relaxed border-l-2 border-neon-blue/40 pl-3">
          {v.lesson}
        </p>
      )}
    </div>
  );
}
