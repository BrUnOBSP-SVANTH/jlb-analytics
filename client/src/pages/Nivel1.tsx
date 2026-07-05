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
        <h3 className="font-semibold text-foreground text-sm">Valor Esperado — E[X] = Σ pᵢ · xᵢ</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        A métrica mais ignorada e mais importante. Se E[X] {"<"} 0, a aposta é matematicamente perdedora
        — independente do resultado individual.
      </p>

      <div className="space-y-2">
        <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground font-medium px-1">
          <span>Resultado (R$)</span><span>Probabilidade (0–1)</span><span />
        </div>
        {rows.map((row, i) => (
          <div key={i} className="grid grid-cols-3 gap-2">
            <input
              type="number"
              value={row.outcome}
              onChange={(e) => updateRow(i, "outcome", e.target.value)}
              className="px-3 py-2 rounded-lg bg-secondary/50 border border-border/50 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="ex: 100"
            />
            <input
              type="number"
              value={row.probability}
              onChange={(e) => updateRow(i, "probability", e.target.value)}
              step="0.01" min="0" max="1"
              className="px-3 py-2 rounded-lg bg-secondary/50 border border-border/50 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="ex: 0.45"
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
                R$ {data.value >= 0 ? "+" : ""}{data.value.toFixed(2)}
              </span>
              <SignalBadge signal={data.signal} />
            </div>
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Desvio padrão</span>
            <span>± {data.std.toFixed(4)}</span>
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
        <h3 className="font-semibold text-foreground text-sm">Margem da Casa (Overround)</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        Toda casa de apostas e mercado preditivo embute uma margem nas odds.
        Esta calculadora torna isso visível. A margem é o que você paga só por participar.
      </p>

      <div className="space-y-2">
        {odds.map((o, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground w-28">{labels[i] ?? `Resultado ${i + 1}`}</span>
            <input
              type="number"
              value={o}
              onChange={(e) => setOdds((prev) => prev.map((v, idx) => idx === i ? e.target.value : v))}
              step="0.01" min="1.01"
              className="flex-1 px-3 py-2 rounded-lg bg-secondary/50 border border-border/50 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
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
              <span className="text-xl font-bold text-negative">{data.margin_pct.toFixed(2)}%</span>
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
                    Implícita: <strong>{(imp * 100).toFixed(1)}%</strong> → Justa: <strong>{(data.fair_probs[i] * 100).toFixed(1)}%</strong>
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
        <h3 className="font-semibold text-foreground text-sm">Atualização Bayesiana</h3>
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
            <label className="block text-xs text-muted-foreground mb-1">{label} <span className="text-muted-foreground/60">— {hint}</span></label>
            <input
              type="range" min="0.01" max="0.99" step="0.01"
              value={value}
              onChange={(e) => set(e.target.value)}
              className="w-full accent-primary"
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-0.5">
              <span>0%</span><span className="font-medium text-foreground">{(parseFloat(value) * 100).toFixed(0)}%</span><span>100%</span>
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
              <div className="text-lg font-bold text-foreground">{(data.prior * 100).toFixed(1)}%</div>
              <div className="text-xs text-muted-foreground">Antes</div>
            </div>
            <div className="flex-1 h-0.5 bg-border/30 relative">
              <div className={`absolute right-0 text-xs font-bold ${data.delta > 0 ? "text-positive" : "text-negative"}`}>
                {data.delta > 0 ? "+" : ""}{(data.delta * 100).toFixed(1)} pp
              </div>
            </div>
            <div className="text-center">
              <div className={`text-lg font-bold ${data.signal === "positive" ? "text-positive" : data.signal === "negative" ? "text-negative" : "text-foreground"}`}>
                {(data.posterior * 100).toFixed(1)}%
              </div>
              <div className="text-xs text-muted-foreground">Depois</div>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            Fator de Bayes: <span className="text-foreground font-medium">{data.bayes_factor === Infinity ? "∞" : data.bayes_factor.toFixed(2)}×</span>
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
  useSEO("Nível 1 — Fundamentos", "Probabilidade, odds e Valor Esperado do zero: a base matemática para apostar com lógica.");
  useEffect(() => {
    awardPoints("level_visited", "Visitou o Nível 1 — Fundamentos", "level_visited_1");
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="px-2.5 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-semibold">Nível 1</span>
          <span className="text-xs text-muted-foreground">Grátis</span>
        </div>
        <h1 className="text-2xl font-bold text-foreground">Fundamentos</h1>
        <p className="text-muted-foreground mt-1 text-sm max-w-2xl">
          A maioria das pessoas perde dinheiro em mercados preditivos não por falta de intuição,
          mas por nunca ter calculado o Valor Esperado da sua posição. Este nível corrige isso.
        </p>
      </div>

      {/* Alerta pedagógico */}
      <div className="flex items-start gap-3 p-4 rounded-xl border border-yellow-500/30 bg-yellow-500/5">
        <AlertCircle className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />
        <div className="text-xs text-muted-foreground leading-relaxed">
          <strong className="text-foreground">Antes de usar qualquer calculadora:</strong>{" "}
          odds decimais já embutem a margem da casa. Uma odd de 2.00 não significa 50% de probabilidade real —
          significa que a casa estima a probabilidade real em algo menor que 50% e cobra a diferença.
          A Calculadora de Margem abaixo torna isso visível.
        </div>
      </div>

      {/* Calculadoras */}
      <div className="grid gap-6 lg:grid-cols-2">
        <HouseEdgeCalculator />
        <EVCalculator />
      </div>
      <BayesCalculator />

      {/* Conclusão */}
      <div className="flex items-start gap-3 p-4 rounded-xl border border-positive/30 bg-positive/5">
        <CheckCircle className="w-4 h-4 text-positive shrink-0 mt-0.5" />
        <div className="text-xs text-muted-foreground leading-relaxed">
          <strong className="text-foreground">O que você aprendeu neste nível:</strong>{" "}
          qualquer mercado com E[X] {"<"} 0 é matematicamente perdedor — independente da estratégia.
          A margem da casa define o piso de dificuldade. Bayes define como aprender com evidências novas
          em vez de ancorar em opiniões antigas.{" "}
          <span className="text-foreground font-medium">
            Nível 2: como ler os dados que os modelos usam.
          </span>
        </div>
      </div>
    </div>
  );
}
