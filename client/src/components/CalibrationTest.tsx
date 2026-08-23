/**
 * CalibrationTest — o "primeiro valor em 30s" da home. Um teste de calibração
 * interativo: 5 afirmações (fatos verificáveis), a pessoa responde V/F E o quanto
 * está certa. No fim, compara a CONFIANÇA declarada com o ACERTO real — e quase todo
 * mundo descobre que é superconfiante. É o "aha" do produto (aposta ≠ investimento),
 * entregue sem login, com dado real, sobre a PRÓPRIA pessoa — não uma promessa da IA.
 */
import { useState } from "react";
import { Link } from "wouter";
import { Brain, Check, X, ArrowRight, RotateCcw, Gauge } from "lucide-react";
import { track } from "@/lib/analytics";

// Afirmações com resposta inequívoca e verificável (várias contra-intuitivas).
const QUESTIONS: { claim: string; answer: boolean; note: string }[] = [
  { claim: "A Muralha da China é visível a olho nu da Lua.", answer: false, note: "Mito — nem da órbita baixa dá pra ver a olho nu." },
  { claim: "O Brasil faz fronteira com o Chile.", answer: false, note: "Faz com todos os países da América do Sul, exceto Chile e Equador." },
  { claim: "Um dia em Vênus dura mais que um ano em Vênus.", answer: true, note: "Vênus gira devagar: 243 dias terrestres por rotação, 225 por órbita." },
  { claim: "O Sol concentra mais de 99% da massa do Sistema Solar.", answer: true, note: "~99,86% — todo o resto (planetas incluídos) é o troco." },
  { claim: "Há mais estrelas na Via Láctea do que grãos de areia em todas as praias da Terra.", answer: false, note: "A areia (~10¹⁸) supera de longe as estrelas da Via Láctea (~10¹¹)." },
];
const CONF = [50, 60, 70, 80, 90, 99];

export default function CalibrationTest() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<{ correct: boolean; conf: number }[]>([]);
  const [pick, setPick] = useState<boolean | null>(null);

  const done = step >= QUESTIONS.length;
  const q = QUESTIONS[step];

  function commit(conf: number) {
    const correct = pick === q.answer;
    const next = [...answers, { correct, conf }];
    setAnswers(next);
    setPick(null);
    setStep(step + 1);
    if (next.length === QUESTIONS.length) {
      const avg = Math.round(next.reduce((a, x) => a + x.conf, 0) / next.length);
      const acc = Math.round((next.filter((x) => x.correct).length / next.length) * 100);
      track("calibration_test_done", { avgConfidence: avg, accuracy: acc });
    }
  }
  function reset() { setStep(0); setAnswers([]); setPick(null); }

  // ── Resultado ──────────────────────────────────────────────────────────────
  if (done) {
    const avgConf = Math.round(answers.reduce((a, x) => a + x.conf, 0) / answers.length);
    const acc = Math.round((answers.filter((x) => x.correct).length / answers.length) * 100);
    const hits = answers.filter((x) => x.correct).length;
    const gap = avgConf - acc;
    const verdict =
      gap > 12
        ? { label: "Superconfiante", tone: "text-negative", ring: "border-negative/30",
            line: "Como quase todo mundo. Você disse ter mais certeza do que os acertos justificam — é exatamente o viés que faz gente perder dinheiro “tendo certeza”." }
        : gap < -12
        ? { label: "Cauteloso demais", tone: "text-neon-blue", ring: "border-neon-blue/30",
            line: "Você sabe mais do que admite. Dá pra confiar mais nas suas leituras fortes — está deixando valor na mesa." }
        : { label: "Bem calibrado", tone: "text-positive", ring: "border-positive/30",
            line: "Raro. Sua confiança bate com seus acertos — é assim que se decide com método, não com achismo." };

    return (
      <div className={`glass-card rounded-2xl p-6 sm:p-7 border ${verdict.ring} max-w-2xl mx-auto`}>
        <div className="flex items-center gap-2 mb-4">
          <Gauge className="w-5 h-5 text-neon-blue" />
          <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Seu resultado</p>
        </div>
        <div className="grid grid-cols-2 gap-4 mb-5">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Você disse ter certeza</p>
            <p className="text-3xl font-bold text-foreground tabular-nums">{avgConf}%</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Você acertou</p>
            <p className="text-3xl font-bold text-foreground tabular-nums">{acc}% <span className="text-sm text-muted-foreground font-medium">({hits}/{QUESTIONS.length})</span></p>
          </div>
        </div>
        <p className={`text-lg font-bold mb-1.5 ${verdict.tone}`}>{verdict.label}</p>
        <p className="text-sm text-muted-foreground leading-relaxed mb-5">{verdict.line}</p>

        <div className="rounded-xl bg-secondary/20 border border-border/20 p-4 mb-5">
          <p className="text-xs text-muted-foreground leading-relaxed">
            <strong className="text-foreground">É por isso que apostar no “achismo” perde:</strong> a confiança quase nunca bate com o acerto.
            O método (calibração, valor esperado, disciplina) é o que separa quem investe de quem só torce.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link href="/educacao" onClick={() => track("cta_click", { id: "caltest_educacao" })}>
            <span className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity cursor-pointer">
              Aprender a decidir com método <ArrowRight className="w-4 h-4" />
            </span>
          </Link>
          <button onClick={reset} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border/50 text-foreground text-sm hover:bg-secondary/30 transition-colors">
            <RotateCcw className="w-4 h-4" /> Refazer
          </button>
        </div>
      </div>
    );
  }

  // ── Pergunta ─────────────────────────────────────────────────────────────────
  return (
    <div className="glass-card rounded-2xl p-6 sm:p-7 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-neon-blue" />
          <p className="text-sm font-semibold text-foreground">Você é bom em prever? Teste em 30 segundos</p>
        </div>
        <div className="flex gap-1" aria-label={`Pergunta ${step + 1} de ${QUESTIONS.length}`}>
          {QUESTIONS.map((_, i) => (
            <span key={i} className={`w-5 h-1.5 rounded-full ${i < step ? "bg-neon-blue" : i === step ? "bg-neon-blue/50" : "bg-border"}`} />
          ))}
        </div>
      </div>

      <p className="text-lg sm:text-xl font-medium text-foreground text-balance leading-snug mb-5 min-h-[3.5rem]">{q.claim}</p>

      {pick === null ? (
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => setPick(true)} className="flex items-center justify-center gap-2 py-3.5 rounded-xl border border-border/50 text-foreground font-semibold hover:border-positive/50 hover:bg-positive/5 transition-colors">
            <Check className="w-4 h-4 text-positive" /> Verdadeiro
          </button>
          <button onClick={() => setPick(false)} className="flex items-center justify-center gap-2 py-3.5 rounded-xl border border-border/50 text-foreground font-semibold hover:border-negative/50 hover:bg-negative/5 transition-colors">
            <X className="w-4 h-4 text-negative" /> Falso
          </button>
        </div>
      ) : (
        <div>
          <p className="text-xs text-muted-foreground mb-2">Você respondeu <strong className="text-foreground">{pick ? "Verdadeiro" : "Falso"}</strong>. Quão certo você está?</p>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {CONF.map((c) => (
              <button key={c} onClick={() => commit(c)} className="py-2.5 rounded-lg border border-border/50 text-sm font-semibold text-foreground hover:border-neon-blue/60 hover:bg-neon-blue/5 transition-colors tabular-nums">
                {c}%
              </button>
            ))}
          </div>
          <button onClick={() => setPick(null)} className="text-[11px] text-muted-foreground/70 hover:text-foreground mt-2.5 transition-colors">← mudar resposta</button>
        </div>
      )}
    </div>
  );
}
