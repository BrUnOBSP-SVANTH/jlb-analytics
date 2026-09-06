/**
 * CalibrationTest — o "primeiro valor em 30s" da home. Um teste de calibração
 * interativo: 5 afirmações (fatos verificáveis), a pessoa responde V/F E o quanto
 * está certa. No fim, compara a CONFIANÇA declarada com o ACERTO real — e quase todo
 * mundo descobre que é superconfiante. É o "aha" do produto (aposta ≠ investimento),
 * entregue sem login, com dado real, sobre a PRÓPRIA pessoa — não uma promessa da IA.
 */
import { useState } from "react";
import { Link } from "wouter";
import { Check, X, ArrowRight, RotateCcw, Gauge } from "lucide-react";
import MarcaProbabilidade from "@/components/MarcaProbabilidade";
import { track } from "@/lib/analytics";

/**
 * As afirmações são DO NOSSO MUNDO, e isso não é detalhe.
 *
 * Aqui havia trivia de almanaque: Muralha da China vista da Lua, um dia em
 * Vênus, grãos de areia. Funcionava como teste de calibração e não tinha nada a
 * ver com o site — era a cara de conteúdo de enchimento, que é exatamente o que
 * o fundador apontou. Um quiz assim podia estar em qualquer página da internet.
 *
 * Agora cada afirmação é sobre aposta, probabilidade ou mercado — com fonte, e
 * várias delas com números que NÓS medimos neste site. A pessoa sai do teste
 * sabendo duas coisas em vez de uma: o quanto ela é superconfiante, e um fato
 * do assunto que a trouxe aqui. E a página passa a falar da nossa matéria.
 *
 * Continuam valendo as duas regras que fazem o teste funcionar: resposta
 * inequívoca e verificável, e várias contra-intuitivas — se a intuição acertasse
 * tudo, ninguém descobriria que é superconfiante.
 */
const QUESTIONS: { claim: string; answer: boolean; note: string }[] = [
  {
    claim: "Na maioria dos mercados de previsão, o lado favorito acaba vencendo mais vezes do que o preço dizia.",
    answer: true,
    note: "Verdade na nossa amostra: em 220 mercados de e-sports que acompanhamos até a liquidação, o favorito venceu 80,5% das vezes com preço médio de 74,5%. É o viés favorito-azarão, medido por nós.",
  },
  {
    claim: "Acertar mais da metade das apostas garante lucro no fim.",
    answer: false,
    note: "Não garante. Quem acerta 60% apostando em favoritos caros perde dinheiro; quem acerta 40% no azarão pelo preço certo lucra. O que decide é o preço, não a taxa de acerto.",
  },
  {
    claim: "No Polymarket, a maioria das carteiras tem prejuízo acumulado.",
    answer: true,
    note: "Cerca de 70% dos endereços têm perdas históricas, e 0,04% das contas capturaram mais de 70% do lucro total (CryptoSlate, 2025).",
  },
  {
    claim: "Um mercado que marca 90% acerta quase sempre — errar nessa faixa é sinal de mercado quebrado.",
    answer: false,
    note: "Errar faz parte: se 90% acertasse sempre, o número certo seria 100%. Um mercado bem calibrado erra 1 em cada 10 vezes ali — e é isso que torna o 90% honesto.",
  },
  {
    claim: "O brasileiro movimenta mais de R$ 20 bilhões por mês em apostas.",
    answer: true,
    note: "O Banco Central estimou cerca de R$ 30 bilhões por mês em 2025 — mais do que o país gasta com muitos serviços públicos.",
  },
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
          {/* A marca da casa no lugar do ícone de cérebro: o mesmo desenho do
              fundo da home, em miniatura. Ícone de biblioteca não constrói
              identidade — está em milhares de sites. */}
          <MarcaProbabilidade className="text-primary" size={20} />
          {/* A chamada diz a TESE do site, não "faça um quiz". A frase antiga
              ("Você é bom em prever?") servia para qualquer teste da internet;
              esta só faz sentido aqui. */}
          <p className="text-sm font-semibold text-foreground">Quase todo mundo se acha mais certo do que é. Veja o seu caso em 30 segundos.</p>
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
