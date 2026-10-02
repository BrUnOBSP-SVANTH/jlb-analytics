/**
 * KellyCalc — calculadora do Criterio de Kelly (sizing). Extraida de pages/Calculadoras.tsx.
 *
 * 🔴 O CAMPO REESCREVIA O QUE A PESSOA DIGITAVA (01/10/2026). O estado guardava
 * o número, com `parseFloat(texto) || 1` e `Math.min(99, …)` no onChange. Apagar
 * a probabilidade a fazia virar 1; digitar "60" dava "160", cortado para 99. A
 * pessoa escrevia 60%, a tela mostrava 99%, e a recomendação de quanto apostar
 * saía calculada sobre 99% — o número mais perigoso da tela, errado em silêncio.
 *
 * Agora o estado guarda o TEXTO (lib/campoNumerico.ts) e a faixa válida vira um
 * AVISO, não uma correção escondida: fora dela, a tela diz o que está errado e
 * não recomenda nada.
 */
import { useState } from "react";
import { TrendingUp } from "lucide-react";
import { CalcCard, FormulaBox, ResultBox, InsightBox, Field, inputClass } from "@/components/calculadoras/CalcPrimitives";
import { numeroDoCampo } from "@/lib/campoNumerico";
import { reaisExatos, num, pp } from "@shared/formato";

/** O que impede a conta, em palavras — ou `null` quando dá para calcular. */
function problemaDaEntrada(prob: number | null, odd: number | null, banca: number | null): string | null {
  if (prob === null || odd === null || banca === null) return "Preencha os três campos para ver a recomendação.";
  if (prob <= 0 || prob >= 100) return "A probabilidade precisa estar entre 0% e 100% — nos extremos não há aposta a dimensionar.";
  if (odd <= 1) return "A odd precisa ser maior que 1: com 1 ou menos, ganhar devolve no máximo o que você pôs.";
  if (banca < 0) return "A banca não pode ser negativa.";
  return null;
}

export function KellyCalc() {
  const [probTexto, setProbTexto] = useState("55");
  const [oddTexto, setOddTexto] = useState("2");
  const [bancaTexto, setBancaTexto] = useState("1000");

  const probN = numeroDoCampo(probTexto);
  const oddN = numeroDoCampo(oddTexto);
  const bancaN = numeroDoCampo(bancaTexto);
  const problema = problemaDaEntrada(probN, oddN, bancaN);

  const prob = probN ?? 0;
  const odd = oddN ?? 0;
  const bankroll = bancaN ?? 0;
  const b = odd - 1;
  const p = prob / 100;
  const q = 1 - p;
  const kelly = b > 0 ? (b * p - q) / b : 0;
  const halfKelly = kelly / 2;
  const quarterKelly = kelly / 4;
  const kellyStake = Math.max(0, kelly) * bankroll;
  const halfStake = Math.max(0, halfKelly) * bankroll;
  const isPositiveEV = b * p - q > 0;
  const impliedProb = odd > 0 ? 1 / odd : 0;
  const edge = p - impliedProb;

  return (
    <CalcCard title="Critério de Kelly" icon={TrendingUp}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <Field label="Sua estimativa de probabilidade (%)" htmlFor="kelly-prob" hint="A chance REAL que VOCÊ acredita — a sua leitura, não a da casa.">
            <input id="kelly-prob" type="number" min={1} max={99} step={0.5} value={probTexto}
              onChange={(e) => setProbTexto(e.target.value)}
              className={inputClass} />
          </Field>
          <Field label="Odd decimal oferecida" htmlFor="kelly-odd" hint="O retorno pago se ganhar. Odd 2,0 = dobra o valor.">
            <input id="kelly-odd" type="number" min={1.01} step={0.01} value={oddTexto}
              onChange={(e) => setOddTexto(e.target.value)}
              className={inputClass} />
          </Field>
          <Field label="Bankroll total (R$)" htmlFor="kelly-bankroll" hint="Todo o dinheiro que você separou pra operar.">
            <input id="kelly-bankroll" type="number" min={0} step={100} value={bancaTexto}
              onChange={(e) => setBancaTexto(e.target.value)}
              className={inputClass} />
          </Field>

          <FormulaBox formula="f* = (b×p − q) / b" legend="b = odd−1 · p = prob. própria · q = 1−p" />

          {!problema && (
            <div className="p-3 rounded-lg bg-obsidian/50 border border-border/20 space-y-1">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Decomposição</p>
              {[
                ["Prob. implícita da odd", `${num((impliedProb * 100), 1)}%`, false],
                ["Sua estimativa", `${num(prob, 1)}%`, false],
                ["Edge (vantagem)", pp(edge * 100, 1), true],
                ["Retorno líquido (b)", `${num((b * 100), 1)}%`, false],
              ].map(([l, v, colored]) => (
                <div key={l as string} className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{l}</span>
                  <span className={`font-mono ${colored ? (edge > 0 ? "text-positive" : "text-negative") : "text-foreground"}`}>{v}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          {problema ? (
            <div className="p-4 rounded-xl bg-secondary/20 border border-border/30" role="status">
              <p className="text-sm font-semibold text-foreground">Ainda não dá para calcular</p>
              <p className="text-xs text-muted-foreground mt-1">{problema}</p>
            </div>
          ) : !isPositiveEV ? (
            <div className="p-4 rounded-xl bg-negative/10 border border-negative/30">
              <p className="text-sm font-semibold text-negative">EV negativo — Kelly = 0%</p>
              <p className="text-xs text-muted-foreground mt-1">
                Com esta probabilidade e odd, o Kelly recomenda não entrar.
                A odd implica {num((impliedProb * 100), 1)}% mas você estima {num(prob, 1)}%.
              </p>
            </div>
          ) : (
            <>
              <ResultBox big label="½ Kelly — quanto pôr"
                value={`${num((halfKelly * 100), 1)}%`}
                color="text-positive"
                hint={`Aplique esta fração da banca — ${reaisExatos(halfStake)}. É o padrão de quem faz isso a sério: cresce quase igual ao Kelly cheio, com muito menos risco.`} />
              <div className="grid grid-cols-2 gap-3">
                <ResultBox label="Kelly completo" termo="kelly"
                  value={`${num((kelly * 100), 1)}%`}
                  color="text-gold"
                  hint={`o máximo matemático (${reaisExatos(kellyStake)}) — mais volátil`} />
                <ResultBox label="¼ Kelly (cauteloso)"
                  value={`${num((quarterKelly * 100), 1)}%`}
                  color="text-dado"
                  hint="quando você não tem certeza da sua estimativa" />
              </div>
            </>
          )}

          <InsightBox>
            <strong className="text-foreground">Regra prática:</strong> nunca ponha mais que o Kelly completo. Profissionais usam ½ Kelly como padrão. Se sua estimativa de probabilidade tem incerteza alta, use ¼ Kelly.
          </InsightBox>
        </div>
      </div>
    </CalcCard>
  );
}
