/**
 * Nível 1 — Fundamentos
 * Valor Esperado, Margem da Casa, Atualização Bayesiana.
 *
 * Objetivo: o usuário sai deste nível sabendo calcular, dado um conjunto
 * de odds, a margem implícita da casa e o valor esperado de uma posição.
 * Sem isso, qualquer análise adicional é construída sobre areia.
 */

import { useState, useEffect } from "react";
import { Calculator, TrendingDown, RefreshCw, ChevronDown, ChevronUp, AlertCircle, CheckCircle, Info } from "lucide-react";
import { useModelCall } from "@/hooks/useModels";
import { awardPoints } from "@/lib/userProgress";
import { useSEO } from "@/hooks/useSEO";
import LevelNav from "@/components/LevelNav";
import PageHeader from "@/components/PageHeader";
import { num } from "@shared/formato";
import { calcularVantagem, precoCalculavel } from "@/lib/edge";
import { idDoCampo } from "@/lib/campo";
import { rotuloDoNivel } from "@shared/niveis";
import { ChecagemDeAprendizagem } from "@/components/ChecagemDeAprendizagem";

// ─── Tipos de resposta da API ─────────────────────────────────────────────────
interface EVResult {
  value: number; std: number; signal: string; explanation: string;
}
interface HouseEdgeResult {
  margin_pct: number; overround: number; implied_probs: number[];
  fair_probs: number[]; signal: string; explanation: string;
}
interface BayesResult {
  prior: number; posterior: number; delta: number;
  bayes_factor: number; signal: string; explanation: string;
}

// ─── Utilitários de UI ────────────────────────────────────────────────────────
function SignalBadge({ signal }: { signal: string }) {
  const map: Record<string, string> = {
    positive: "bg-positive/10 text-positive border-positive/30",
    negative: "bg-negative/10 text-negative border-negative/30",
    neutral: "bg-muted/30 text-muted-foreground border-border/30",
  };
  const label: Record<string, string> = {
    positive: "Favorável", negative: "Desfavorável", neutral: "Neutro",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${map[signal] ?? map.neutral}`}>
      {label[signal] ?? signal}
    </span>
  );
}

function ExplanationBox({ text }: { text: string }) {
  return (
    <div className="mt-3 flex items-start gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20">
      <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
      <p className="text-xs text-muted-foreground leading-relaxed">{text}</p>
    </div>
  );
}

function ErrorBox({ text }: { text: string }) {
  return (
    <div className="mt-3 flex items-start gap-2 p-3 rounded-lg bg-negative/10 border border-negative/30">
      <AlertCircle className="w-4 h-4 text-negative shrink-0 mt-0.5" />
      <p className="text-xs text-negative leading-relaxed">{text}</p>
    </div>
  );
}

/**
 * EV NO MERCADO DE PREVISÃO — a forma que este site usa de verdade.
 *
 * O QUE FALTAVA (Auditoria 21/09, APR-03). A trilha ensinava valor esperado só
 * na linguagem de casa de apostas: montar uma tabela de cenários, inventar a
 * linha de perda, pensar em odd. Só que o produto inteiro é sobre mercado de
 * previsão, onde a conta é mais simples e mais direta — o contrato paga R$ 1 se
 * o evento acontece, o preço JÁ É a probabilidade que o mercado cobra, e o
 * retorno por real sai de uma divisão:
 *
 *     EV por R$ = sua probabilidade ÷ preço − 1
 *
 * Quem aprende só a primeira forma sai da trilha sem saber ler a tela principal
 * do próprio site.
 *
 * A conta vem de `lib/edge.ts` — a mesma que a Calculadora de Edge da página de
 * mercado usa. Reescrevê-la aqui seria criar a segunda fonte do número que a
 * plataforma mais publica.
 */
function EVDeMercadoPrevisao() {
  const [preco, setPreco] = useState("40");
  const [minha, setMinha] = useState("50");

  const p = Number(preco) / 100;
  const q = Number(minha) / 100;
  const v = calcularVantagem(q, p);
  const calculavel = precoCalculavel(p) && Number.isFinite(q);

  return (
    <div className="glass-card rounded-xl p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Calculator className="w-4 h-4 text-neon-blue" />
        <h2 className="font-semibold text-foreground text-sm">EV no mercado de previsão — p ÷ preço − 1</h2>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        No mercado de previsão o contrato paga <strong className="text-foreground">R$ 1</strong> se o evento
        acontecer, e o preço já é a probabilidade que o mercado cobra. Não há odd nem cenário de perda para
        montar: basta comparar a sua probabilidade com o preço.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground" htmlFor="ev-mercado-preco">Preço do SIM (%)</label>
          <input
            id="ev-mercado-preco"
            type="number" min="1" max="99" step="1"
            value={preco}
            onChange={(e) => setPreco(e.target.value)}
            className="w-full min-w-0 mt-1 px-3 py-2 rounded-lg bg-secondary/50 border border-border/50 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground" htmlFor="ev-mercado-minha">Sua probabilidade (%)</label>
          <input
            id="ev-mercado-minha"
            type="number" min="0" max="100" step="1"
            value={minha}
            onChange={(e) => setMinha(e.target.value)}
            className="w-full min-w-0 mt-1 px-3 py-2 rounded-lg bg-secondary/50 border border-border/50 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      <div className="p-4 rounded-lg bg-obsidian/50 border border-border/20 space-y-1">
        <p className="text-xs text-muted-foreground">Valor esperado por R$ 1 apostado</p>
        <p className={`text-2xl font-mono font-bold tabular-nums ${
          !calculavel || v.neutro ? "text-muted-foreground" : v.ev! > 0 ? "text-positive" : "text-negative"
        }`}>
          {!calculavel
            ? "—"
            : `${v.ev! > 0 ? "+" : ""}${num(v.ev! * 100, 1)}%`}
        </p>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          {!calculavel
            ? "Fora da faixa em que a conta significa alguma coisa (o preço precisa estar entre 1% e 99%)."
            : v.neutro
              ? "Sua probabilidade é a do mercado: não há vantagem de nenhum lado."
              : v.ev! > 0
                ? `${num(q * 100, 0)} ÷ ${num(p * 100, 0)} − 1. Se você estiver certo, cada R$ 1 apostado vale ${num((1 + v.ev!), 2)} em média — no longo prazo, repetindo apostas como esta.`
                : `${num(q * 100, 0)} ÷ ${num(p * 100, 0)} − 1. O mercado cobra mais do que a sua probabilidade justifica: no longo prazo, esta posição perde.`}
        </p>
      </div>

      <p className="text-[11px] text-muted-foreground">
        É a mesma conta da Calculadora de Edge que aparece em cada mercado do site — aqui sem o mercado,
        para você praticar com números seus.
      </p>
    </div>
  );
}

// ─── Calculadora de Valor Esperado ────────────────────────────────────────────
function EVCalculator() {
  const [rows, setRows] = useState([
    { outcome: "100", probability: "0.45" },
    { outcome: "-100", probability: "0.55" },
  ]);
  const { data, loading, error, run } = useModelCall<EVResult>("/api/level1/ev");

  const updateRow = (i: number, field: "outcome" | "probability", val: string) => {
    setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
  };

  const addRow = () => setRows((prev) => [...prev, { outcome: "0", probability: "0" }]);
  const removeRow = (i: number) => setRows((prev) => prev.filter((_, idx) => idx !== i));

  const handleRun = async () => {
    await run({
      outcomes: rows.map((r) => parseFloat(r.outcome)),
      probabilities: rows.map((r) => parseFloat(r.probability)),
    });
  };

  return (
    <div className="glass-card rounded-xl p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Calculator className="w-4 h-4 text-primary" />
        <h2 className="font-semibold text-foreground text-sm">Valor Esperado — E[X] = Σ pᵢ · xᵢ</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        A métrica mais ignorada e mais importante. Se E[X] {"<"} 0, a posição é matematicamente perdedora
        — independente do resultado individual.
      </p>

      {/* `w-full min-w-0` nos campos: `<input>` tem largura MÍNIMA intrínseca
          (~150px) e não encolhe sozinho dentro de grade ou flex. Em 390px os dois
          cards desta página saíam 20px para fora da tela e ela rolava de lado —
          a única das 27 rotas com esse defeito (medido em 16/09). */}
      {/* ⚠️ CADA CAMPO TEM `<label>` (Auditoria 21/09, APR-03). Os títulos das
          colunas eram `<span>`: visualmente pareciam rótulo e, para o leitor de
          tela, os campos eram "caixa de edição" sem nome nenhum — numa página
          que ensina a CALCULAR, onde saber qual campo é qual é a tarefa
          inteira. `sr-only` porque o título da coluna já aparece na tela; o que
          faltava era a ligação entre ele e o campo. */}
      <div className="space-y-2">
        <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground font-medium px-1" aria-hidden="true">
          <span>Resultado (R$)</span><span>Probabilidade <span className="whitespace-nowrap">(0–1)</span></span><span />
        </div>
        {rows.map((row, i) => (
          <div key={i} className="grid grid-cols-3 gap-2">
            <label className="sr-only" htmlFor={`ev-resultado-${i}`}>Resultado {i + 1} em reais</label>
            <input
              id={`ev-resultado-${i}`}
              type="number"
              value={row.outcome}
              onChange={(e) => updateRow(i, "outcome", e.target.value)}
              className="w-full min-w-0 px-3 py-2 rounded-lg bg-secondary/50 border border-border/50 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="ex: 100"
            />
            <label className="sr-only" htmlFor={`ev-prob-${i}`}>Probabilidade do resultado {i + 1}, de 0 a 1</label>
            <input
              id={`ev-prob-${i}`}
              type="number"
              value={row.probability}
              onChange={(e) => updateRow(i, "probability", e.target.value)}
              step="0.01" min="0" max="1"
              className="w-full min-w-0 px-3 py-2 rounded-lg bg-secondary/50 border border-border/50 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              /* VÍRGULA, como o Brasil escreve (TXT-01). O exemplo estava em
                 "0.45" na página que ENSINA a ler número. Medido em 24/09 nos
                 dois locales: o campo aceita os dois separadores e guarda 0.45
                 do mesmo jeito, então escrever certo não custa nada. */
              placeholder="ex: 0,45"
            />
            {rows.length > 2 && (
              <button onClick={() => removeRow(i)} className="text-xs text-negative hover:underline text-left">Remover</button>
            )}
          </div>
        ))}
        <button onClick={addRow} className="text-xs text-primary hover:underline">+ Adicionar resultado</button>
      </div>

      <button
        onClick={handleRun}
        disabled={loading}
        className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {loading ? "Calculando..." : "Calcular"}
      </button>

      {data && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Valor Esperado</span>
            <div className="flex items-center gap-2">
              <span className={`text-lg font-bold ${data.signal === "positive" ? "text-positive" : data.signal === "negative" ? "text-negative" : "text-foreground"}`}>
                R$ {data.value >= 0 ? "+" : ""}{num(data.value, 2)}
              </span>
              <SignalBadge signal={data.signal} />
            </div>
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Desvio padrão</span>
            <span>± {num(data.std, 4)}</span>
          </div>
          <ExplanationBox text={data.explanation} />
        </div>
      )}
      {error && <ErrorBox text={error} />}
    </div>
  );
}

// ─── Calculadora de Margem da Casa ────────────────────────────────────────────
function HouseEdgeCalculator() {
  const [odds, setOdds] = useState(["2.10", "3.50", "3.20"]);
  const { data, loading, error, run } = useModelCall<HouseEdgeResult>("/api/level1/house-edge");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleRun = () => {
    run({ decimal_odds: odds.map((o) => parseFloat(o)) });
  };

  const labels = ["Vitória casa", "Empate", "Vitória visitante", "Resultado 4", "Resultado 5"];

  return (
    <div className="glass-card rounded-xl p-6 space-y-4">
      <div className="flex items-center gap-2">
        <TrendingDown className="w-4 h-4 text-negative" />
        <h2 className="font-semibold text-foreground text-sm">Margem da Casa (Overround)</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Toda casa de apostas e mercado preditivo embute uma margem nas odds.
        Esta calculadora torna isso visível. A margem é o que você paga só por participar.
      </p>

      <div className="space-y-2">
        {odds.map((o, i) => (
          <div key={i} className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground w-24 sm:w-28 shrink-0" htmlFor={`odd-${i}`}>{labels[i] ?? `Resultado ${i + 1}`}</label>
            <input
              id={`odd-${i}`}
              type="number"
              value={o}
              onChange={(e) => setOdds((prev) => prev.map((v, idx) => idx === i ? e.target.value : v))}
              step="0.01" min="1.01"
              className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-secondary/50 border border-border/50 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {odds.length > 2 && (
              <button onClick={() => setOdds((p) => p.filter((_, idx) => idx !== i))} className="text-xs text-negative" aria-label={`Remover odd ${i + 1}`}>✕</button>
            )}
          </div>
        ))}
        {odds.length < 5 && (
          <button onClick={() => setOdds((p) => [...p, "2.00"])} className="text-xs text-primary hover:underline">+ Adicionar resultado</button>
        )}
      </div>

      <button onClick={handleRun} disabled={loading}
        className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50">
        {loading ? "Calculando..." : "Calcular margem"}
      </button>

      {data && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Margem da casa</span>
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold text-negative">{num(data.margin_pct, 2)}%</span>
              <SignalBadge signal={data.signal} />
            </div>
          </div>

          <button onClick={() => setShowAdvanced(!showAdvanced)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            {showAdvanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {showAdvanced ? "Ocultar" : "Ver"} probabilidades implícitas vs. justas
          </button>

          {showAdvanced && (
            <div className="space-y-1.5">
              {data.implied_probs.map((imp, i) => (
                <div key={i} className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{labels[i] ?? `R${i+1}`}</span>
                  <span className="text-foreground">
                    Implícita: <strong>{num((imp * 100), 1)}%</strong> → Justa: <strong>{num((data.fair_probs[i] * 100), 1)}%</strong>
                  </span>
                </div>
              ))}
            </div>
          )}

          <ExplanationBox text={data.explanation} />
        </div>
      )}
      {error && <ErrorBox text={error} />}
    </div>
  );
}

// ─── Calculadora Bayesiana ────────────────────────────────────────────────────
function BayesCalculator() {
  const [prior, setPrior] = useState("0.5");
  const [lTrue, setLTrue] = useState("0.9");
  const [lFalse, setLFalse] = useState("0.2");
  const { data, loading, error, run } = useModelCall<BayesResult>("/api/level1/bayes");

  return (
    <div className="glass-card rounded-xl p-6 space-y-4">
      <div className="flex items-center gap-2">
        <RefreshCw className="w-4 h-4 text-primary" />
        <h2 className="font-semibold text-foreground text-sm">Atualização Bayesiana</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Como uma nova evidência deve alterar sua crença? Bayes é a matemática da aprendizagem
        racional — o oposto de ancorar em opiniões prévias.
      </p>

      <div className="space-y-3">
        {[
          { label: "Prior P(H)", hint: "Crença inicial no evento (0–1)", value: prior, set: setPrior },
          { label: "P(E|H)", hint: "Prob. da evidência se o evento ocorrer", value: lTrue, set: setLTrue },
          { label: "P(E|¬H)", hint: "Prob. da evidência se o evento NÃO ocorrer", value: lFalse, set: setLFalse },
        ].map(({ label, hint, value, set }) => (
          <div key={label}>
            <label className="block text-xs text-muted-foreground mb-1" htmlFor={idDoCampo(label, "bayes")}>{label} <span className="text-muted-foreground">— {hint}</span></label>
            <input
              id={idDoCampo(label, "bayes")}
              type="range" min="0.01" max="0.99" step="0.01"
              value={value}
              onChange={(e) => set(e.target.value)}
              className="w-full accent-primary"
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-0.5">
              <span>0%</span><span className="font-medium text-foreground">{num((parseFloat(value) * 100), 0)}%</span><span>100%</span>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={() => run({ prior: parseFloat(prior), likelihood_given_true: parseFloat(lTrue), likelihood_given_false: parseFloat(lFalse) })}
        disabled={loading}
        className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
      >
        {loading ? "Calculando..." : "Atualizar crença"}
      </button>

      {data && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground">Prior → Posterior</div>
            <SignalBadge signal={data.signal} />
          </div>
          <div className="flex items-center gap-3">
            <div className="text-center">
              <div className="text-lg font-bold text-foreground">{num((data.prior * 100), 1)}%</div>
              <div className="text-xs text-muted-foreground">Antes</div>
            </div>
            <div className="flex-1 h-0.5 bg-border/30 relative">
              <div className={`absolute right-0 text-xs font-bold ${data.delta > 0 ? "text-positive" : "text-negative"}`}>
                {data.delta > 0 ? "+" : ""}{num((data.delta * 100), 1)} pp
              </div>
            </div>
            <div className="text-center">
              <div className={`text-lg font-bold ${data.signal === "positive" ? "text-positive" : data.signal === "negative" ? "text-negative" : "text-foreground"}`}>
                {num((data.posterior * 100), 1)}%
              </div>
              <div className="text-xs text-muted-foreground">Depois</div>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            Fator de Bayes: <span className="text-foreground font-medium">{data.bayes_factor === Infinity ? "∞" : num(data.bayes_factor, 2)}×</span>
            {" "}— {data.bayes_factor > 10 ? "evidência forte" : data.bayes_factor > 3 ? "evidência moderada" : "evidência fraca"}
          </div>
          <ExplanationBox text={data.explanation} />
        </div>
      )}
      {error && <ErrorBox text={error} />}
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function Nivel1() {
  useSEO(rotuloDoNivel(1), "Probabilidade, odds e Valor Esperado do zero: a base matemática para operar com lógica.");
  useEffect(() => {
    awardPoints("level_visited", "Visitou o Nível 1 — Fundamentos", "level_visited_1");
  }, []);

  return (
    <div>
      <PageHeader
        badge="Nível 1 · Grátis"
        title="Fundamentos"
        subtitle="A maioria das pessoas perde dinheiro em mercados preditivos não por falta de intuição, mas por nunca ter calculado o Valor Esperado da sua posição. Este nível corrige isso."
      />
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">

      {/* Alerta pedagógico */}
      <div className="flex items-start gap-3 p-4 rounded-xl border border-warning/30 bg-warning/5">
        <AlertCircle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
        <div className="text-xs text-muted-foreground leading-relaxed">
          <strong className="text-foreground">Antes de usar qualquer calculadora:</strong>{" "}
          odds decimais já embutem a margem da casa. Uma odd de 2,00 não significa 50% de probabilidade real —
          significa que a casa estima a probabilidade real em algo menor que 50% e cobra a diferença.
          A Calculadora de Margem abaixo torna isso visível.
        </div>
      </div>

      {/* Calculadoras */}
      {/* `grid-cols-1` explícito, e não coluna implícita: sem ele a trilha única do
          celular cresce até a largura MÍNIMA do conteúdo (os campos das
          calculadoras) em vez de caber na tela — em 390px os cards saíam 20px
          para fora e a página rolava de lado. No Tailwind, `grid-cols-1` é
          `minmax(0, 1fr)`: a coluna pode encolher. Mesmo padrão nos cinco níveis. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <HouseEdgeCalculator />
        <EVCalculator />
        <EVDeMercadoPrevisao />
      </div>
      <BayesCalculator />

      {/* Conclusão */}
      <div className="flex items-start gap-3 p-4 rounded-xl border border-positive/30 bg-positive/5">
        <CheckCircle className="w-4 h-4 text-positive shrink-0 mt-0.5" />
        <div className="text-xs text-muted-foreground leading-relaxed">
          <strong className="text-foreground">O que você aprendeu neste nível:</strong>{" "}
          qualquer mercado com E[X] {"<"} 0 é matematicamente perdedor — independente da estratégia.
          A margem da casa define o piso de dificuldade. Bayes define como aprender com evidências novas
          em vez de ancorar em opiniões antigas.
        </div>
      </div>

      {/* APR-02: é a checagem que conclui o nível — não a calculadora. */}
      <ChecagemDeAprendizagem nivel={1} titulo="Concluiu o Nível 1 — Fundamentos" />

      <LevelNav current={1} />
    </div>
    </div>
  );
}
