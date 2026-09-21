/**
 * EdgeCalculator — calculadora de EV/Kelly inline do detalhe.
 *
 * O QUE ELA ERRAVA. Tratava TODO mercado como SIM/NÃO. Num mercado de 12 times
 * (`poly-2772176`, Champions 2027), uma estimativa de 19% não dizia 19% DE QUÊ,
 * e a previsão registrada nascia órfã: impossível pontuar com Brier e impossível
 * mostrar no track record, porque ninguém sabia se a aposta era no Barcelona ou
 * no Aston Villa.
 *
 * Agora ela opera sobre um DESFECHO selecionado. A lista "Desfechos possíveis"
 * acima e o seletor aqui dentro são dois caminhos para o mesmo estado, que mora
 * na página e viaja na URL (`?desfecho=`) para o link ser compartilhável.
 *
 * TRÊS CONSERTOS QUE VIERAM JUNTO, todos da mesma raiz — o preço arredondado:
 *
 *  1. O slider nascia no preço ARREDONDADO (19% para um mercado a 18,5%), o que
 *     criava meio ponto de vantagem sem o usuário tocar em nada.
 *  2. O cartão de EV imprimia a STRING literal `"0.0"` no estado neutro — com
 *     ponto, fora do padrão pt-BR de todo o resto do site, e escondendo que o
 *     EV verdadeiro daquela configuração era +2,7%.
 *  3. O slider andava de 1 em 1 ponto. Com o mercado em 18,5% era IMPOSSÍVEL
 *     zerar o edge: o usuário ficava preso entre 18% (−0,5 pp) e 19% (+0,5 pp).
 *
 * As fórmulas saíram daqui para `lib/edge.ts` — viviam em três arquivos.
 */
import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { Calculator, Zap, Info, Check, BookmarkPlus, Sparkles, RefreshCw, AlertTriangle } from "lucide-react";
import { calcularVantagem, precoCalculavel } from "@/lib/edge";
import { pct, pp, num } from "@shared/formato";
import { Explain } from "@/components/marketDetail/Explain";
import { type MarketBasic } from "@/components/marketDetail/types";
import { previsaoDoDesfecho, somaDasEstimativas, tituloComDesfecho } from "@/lib/predictions";
import { registrarPrevisao } from "@/lib/predictionsSync";
import { idCanonicoDeMercado } from "@shared/liquidacao";
import { awardPoints } from "@/lib/userProgress";
import { track } from "@/lib/analytics";
import { maybeAuthGate } from "@/lib/upgrade";
import { apiFetch } from "@/lib/api";

interface ExplainResult {
  explanation: string;
  whyMarketMightBeMistaken: string;
  keyInsight: string;
  riskFactor: string;
  confidence?: "low" | "medium" | "high";
  cached?: boolean;
}

/** Passo do controle, em pontos percentuais. Ver conserto 3 no cabeçalho. */
const PASSO_PP = 0.5;
const MIN_PP = 1;
const MAX_PP = 99;

/** O preço, em pontos percentuais, encaixado na grade do controle. */
function naGrade(prob: number): number {
  const bruto = Math.min(MAX_PP, Math.max(MIN_PP, prob * 100));
  return Math.round(bruto / PASSO_PP) * PASSO_PP;
}

export function EdgeCalculator({
  market,
  desfechoSelecionado,
  onSelecionarDesfecho,
}: {
  market: MarketBasic;
  desfechoSelecionado?: string | null;
  onSelecionarDesfecho?: (id: string) => void;
}) {
  const desfechos = market.parsedOutcomes;
  const multi = Boolean(desfechos && desfechos.length > 2);
  // Nada de estado vazio: sem seleção, o líder (maior preço — a lista já vem
  // ordenada) é quem está sob análise.
  const desfecho = multi ? desfechos!.find((o) => o.id === desfechoSelecionado) ?? desfechos![0] : null;
  // O link pedia um desfecho que a fonte não lista mais (saiu da API, ou o link
  // é antigo). A conta cai no líder — e a tela DIZ isso, senão o usuário analisa
  // o Barcelona achando que é o time do link.
  const desfechoSumiu = multi && Boolean(desfechoSelecionado) && !desfechos!.some((o) => o.id === desfechoSelecionado);

  const marketId = market.id;
  const question = market.title;
  /** O preço EXATO do que está sob análise. Nunca o arredondado da tela. */
  const preco = desfecho ? desfecho.prob : market.yesProb;
  const encerrado = market.closed === true || market.status === "settled" || market.status === "finalized";

  const [estimativaPp, setEstimativaPp] = useState(() => naGrade(preco));
  // DET-03: enquanto ninguém move o controle, não há comparação a declarar — um
  // arredondamento para cima bastava para a tela anunciar "valor positivo" e
  // sugerir ½ Kelly antes de o usuário fazer qualquer coisa.
  const [mexeu, setMexeu] = useState(false);
  const [salvo, setSalvo] = useState<{ label: string | null; valor: number } | null>(null);
  const [explain, setExplain] = useState<ExplainResult | null>(null);
  const [loadingExplain, setLoadingExplain] = useState(false);
  const [explainError, setExplainError] = useState<string | null>(null);

  /**
   * Trocar de desfecho RE-ANCORA a conta. Preservar a estimativa anterior é o
   * erro silencioso mais caro aqui: 25% num desfecho de 18,5% é uma aposta
   * deliberada; os mesmos 25% herdados num desfecho de 1% viram "EV +2400%" que
   * o usuário nunca digitou.
   */
  const idAtual = desfecho?.id ?? marketId;
  const ancora = useRef(idAtual);
  useEffect(() => {
    if (ancora.current === idAtual) return;
    ancora.current = idAtual;
    setEstimativaPp(naGrade(preco));
    setMexeu(false);
    setSalvo(null);
    setExplain(null);
    setExplainError(null);
  }, [idAtual, preco]);

  const estimativa = estimativaPp / 100;
  const v = calcularVantagem(estimativa, preco);
  const calculavel = precoCalculavel(preco);
  /** Só declaramos vantagem depois de o usuário mover o controle de propósito. */
  const neutro = !mexeu || v.neutro;
  const temVantagem = !neutro && v.ev !== null && v.ev > 0;

  /** Previsão anterior SUA para este mesmo desfecho — vira "Atualizar". */
  // Só em mercado múltiplo. No binário a spec exige comportamento idêntico ao
  // de antes (critério 7) — e lá cada registro já era uma linha nova.
  const anterior = desfecho ? previsaoDoDesfecho(marketId, desfecho.id) : null;
  /** Soma das suas estimativas ativas neste mercado, contando a que está na tela. */
  const somaEstimativas = multi
    ? somaDasEstimativas(marketId, { outcomeId: desfecho!.id, userProb: estimativaPp })
    : null;

  function handleSave() {
    registrarPrevisao({
      // Com o prefixo da fonte — sem ele a previsão nunca é resolvida.
      marketId: idCanonicoDeMercado(market.source, marketId),
      // "<pergunta> — Barcelona": toda tela que lista previsões passa a dizer de
      // qual desfecho é, sem ser tocada. Ver tituloComDesfecho.
      question: tituloComDesfecho(question, desfecho?.label),
      // O preço vai com DUAS casas (a coluna é numeric(5,2)). Guardar 19 onde o
      // mercado pagava 18,5 estragaria o Brier do mercado — a linha de base
      // contra a qual a calibração do usuário é medida.
      marketProb: Math.round(preco * 10_000) / 100,
      userProb: estimativaPp,
      outcomeId: desfecho?.id ?? null,
      outcomeLabel: desfecho?.label ?? null,
    });
    awardPoints("prediction_made", `Previsão registrada: ${question.slice(0, 50)}`);
    track("prediction_registered", { source: "marketdetail", multi });
    setSalvo({ label: desfecho?.label ?? null, valor: estimativaPp });
  }

  // Liga o endpoint /explain-edge: a ponte entre o "eu acho" do slider e o
  // professor — a IA explica de ONDE pode vir a vantagem e qual é o risco.
  async function handleExplain() {
    if (explain) { setExplain(null); return; }
    setLoadingExplain(true);
    setExplainError(null);
    try {
      const res = await apiFetch("/api/ai/explain-edge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // O título carrega o desfecho: sem isso a IA explicava a vantagem do
        // mercado inteiro quando a pergunta era sobre um time só.
        body: JSON.stringify({
          title: desfecho ? `${question} — desfecho: ${desfecho.label}` : question,
          marketProb: preco,
          userProb: estimativa,
        }),
        signal: AbortSignal.timeout(20_000),
      });
      if (await maybeAuthGate(res)) return;   // 401 login ou 429 cota → modal assume
      if (res.status === 429) throw new Error("RATE_LIMIT");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setExplain(await res.json() as ExplainResult);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "erro";
      setExplainError(msg === "RATE_LIMIT" ? "Limite de requisições — aguarde ~1 min." : "Não foi possível explicar agora. Tente novamente.");
    } finally {
      setLoadingExplain(false);
    }
  }

  /** Posição da marca do preço no trilho, em % da largura. */
  const marcaPct = ((Math.min(MAX_PP, Math.max(MIN_PP, preco * 100)) - MIN_PP) / (MAX_PP - MIN_PP)) * 100;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Calculator className="w-4 h-4 text-primary/70" />
        <p className="text-sm font-semibold text-foreground/80 uppercase tracking-wider">Calculadora de Edge</p>
      </div>
      <Explain>
        Esta é a ponte entre o "eu acho" e os números: diga qual chance <strong className="text-foreground">você</strong> acredita ser a real,
        e a calculadora mostra se a posição tem <strong className="text-foreground">Valor Esperado positivo</strong> (lucro esperado a longo prazo)
        e <strong className="text-foreground">quanto arriscar</strong> sem quebrar a banca (a fração de Kelly). Mova o controle e veja os números reagirem.
      </Explain>

      {/* ── SELETOR DE DESFECHO ──────────────────────────────────────────────
          `<select>` nativo de propósito: é navegável por teclado de graça, é
          anunciado certo por leitor de tela, e no celular o próprio sistema o
          abre como bottom sheet — que é exatamente o pedido. Um dropdown de
          autoria própria custaria cem linhas de armadilha de foco para entregar
          menos. Em mercado binário ele não existe: nada muda ali. */}
      {multi && (
        <div>
          {desfechoSumiu && (
            <p role="status" className="text-[11px] text-muted-foreground mb-2 border-l-2 border-gold/50 pl-2">
              O desfecho do link não aparece mais neste mercado. Mostrando o líder, {desfecho!.label}.
            </p>
          )}
          <label htmlFor="desfecho-analisado" className="block text-xs text-muted-foreground mb-1">
            Desfecho analisado
          </label>
          <select
            id="desfecho-analisado"
            value={desfecho!.id}
            disabled={encerrado || !onSelecionarDesfecho}
            onChange={(e) => onSelecionarDesfecho?.(e.target.value)}
            className="alvo-toque w-full px-3 py-2 rounded-lg bg-secondary/30 border border-border/40 text-sm text-foreground disabled:opacity-60"
          >
            {desfechos!.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label} — mercado {pct(o.prob * 100, 1)}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-muted-foreground mt-1">
            Este mercado tem {desfechos!.length} desfechos. Escolha qual você quer analisar — a calculadora usa o
            preço desse desfecho como referência.
          </p>
        </div>
      )}

      <div>
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs text-muted-foreground">Sua estimativa{desfecho ? ` para ${desfecho.label}` : ""}</span>
          <span className="text-lg font-mono font-bold text-foreground tabular-nums">{pct(estimativaPp, 1)}</span>
        </div>
        {/* A marca no trilho é o preço do mercado. Sem ela o usuário não tem de
            onde saber que 18,5% é o ponto de empate — e um controle sem
            referência convida a mexer até o número ficar bonito. */}
        <div className="relative">
          <div
            aria-hidden="true"
            title="preço do mercado"
            className="pointer-events-none absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-0.5 h-4 bg-foreground/40 rounded-full z-10"
            style={{ left: `${marcaPct}%` }}
          />
          <input
            type="range" min={MIN_PP} max={MAX_PP} step={PASSO_PP} value={estimativaPp}
            aria-label={`Sua estimativa${desfecho ? ` para ${desfecho.label}` : ""}, em porcento`}
            onChange={(e) => { setEstimativaPp(Number(e.target.value)); setMexeu(true); }}
            className="relative w-full h-2 rounded-full accent-primary cursor-pointer"
          />
        </div>
        <div className="flex justify-between text-[11px] text-muted-foreground mt-0.5">
          <span>1%</span>
          <span>preço do mercado {pct(preco * 100, 1)}</span>
          <span>99%</span>
        </div>
      </div>

      {!calculavel ? (
        /* Preço extremo: EV e Kelly seriam dominados pelo ruído de
           arredondamento do próprio preço. Um desfecho cotado a 1% num mercado
           de 12 times produziria "EV +900%", que não significa nada. */
        <div className="flex items-start gap-2 p-3 rounded-lg bg-secondary/20 border border-border/20">
          <AlertTriangle className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            Preço muito {preco < 0.5 ? "baixo" : "alto"} para calcular EV e Kelly com segurança. O resultado seria
            dominado por ruído de arredondamento. O edge em pontos percentuais continua valendo:{" "}
            <span className="font-mono text-foreground">{v.neutro ? "0,0 pp" : pp(v.edgePp)}</span>.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3" aria-live="polite">
          <div className={`p-3 rounded-lg border ${neutro ? "border-border/20 bg-secondary/10" : temVantagem ? "border-positive/20 bg-positive/5" : "border-negative/20 bg-negative/5"}`}>
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Valor Esperado (EV)</p>
            <p className={`text-xl font-mono font-bold tabular-nums ${neutro ? "text-muted-foreground" : temVantagem ? "text-positive" : "text-negative"}`}>
              {/* Era a string literal "0.0" — com ponto, e mentindo sobre a conta. */}
              {neutro ? pct(0, 1) : `${v.ev! >= 0 ? "+" : ""}${num(v.ev! * 100, 1)}%`}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">por real na posição</p>
          </div>
          <div className={`p-3 rounded-lg border ${!neutro && v.edgePp > 0 ? "border-neon-blue/20 bg-neon-blue/5" : "border-border/20 bg-secondary/10"}`}>
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Edge vs Mercado</p>
            <p className={`text-xl font-mono font-bold tabular-nums ${!neutro && v.edgePp > 0 ? "text-neon-blue" : "text-muted-foreground"}`}>
              {neutro ? "0,0 pp" : pp(v.edgePp)}
            </p>
            {/* DET-02: os três números com a MESMA precisão. Antes o mercado
                aparecia arredondado (53%) ao lado de um edge calculado sobre o
                valor cheio (52,5%), e o card lia "+0,5 pp" com dois 53% embaixo. */}
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Mercado {pct(preco * 100, 1)} · você {pct(estimativaPp, 1)}
            </p>
          </div>
          <div className="p-3 rounded-lg border border-gold/20 bg-gold/5">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Kelly Completo</p>
            <p className="text-xl font-mono font-bold text-[var(--gold-legivel)] tabular-nums">{num(v.kellyCheio! * 100, 1)}%</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">da banca</p>
          </div>
          <div className="p-3 rounded-lg border border-gold/10 bg-gold/[0.03]">
            {/* DET-04: era "(recomendado)", que colide frontalmente com o aviso
                institucional de que a JLB não recomenda posições. Descreve a mesma
                escolha sem virar conselho. */}
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">½ Kelly (mais conservador)</p>
            <p className="text-xl font-mono font-bold text-[var(--gold-legivel)] tabular-nums">{num(v.kellyMeio! * 100, 1)}%</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">da banca</p>
          </div>
        </div>
      )}

      <div className={`flex items-center gap-2 p-3 rounded-lg ${temVantagem ? "bg-positive/10 border border-positive/20" : "bg-secondary/20 border border-border/20"}`}>
        <Zap className={`w-4 h-4 shrink-0 ${temVantagem ? "text-positive" : "text-muted-foreground"}`} />
        <p className="text-xs leading-relaxed">
          {!mexeu
            ? "Sua estimativa está no preço do mercado. Mova o controle para procurar vantagem."
            : !calculavel
            ? "Neste preço a conta de EV e Kelly não é confiável — compare pelo edge em pontos percentuais."
            : temVantagem
            ? `Sua estimativa implica valor esperado positivo. Com ½ Kelly isso daria ${pct(v.kellyMeio! * 100, 1)} da banca, e ${pct(v.ev! * 100, 1)} de retorno esperado por posição no longo prazo.`
            : neutro
            ? "Sua estimativa coincide com o preço do mercado. Não há vantagem matemática de nenhum lado."
            : "Com esta estimativa não há valor esperado positivo — o mercado paga menos do que a sua probabilidade justificaria."}
        </p>
      </div>

      {/* Ponte slider->professor: pede à IA a origem do edge. Só quando há edge relevante. */}
      {mexeu && calculavel && Math.abs(v.edgePp) >= 2 && (
        <div className="space-y-2">
          <button onClick={handleExplain} disabled={loadingExplain}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-neon-blue/10 border border-neon-blue/20 text-xs font-medium text-neon-blue hover:bg-neon-blue/20 transition-colors disabled:opacity-50">
            {loadingExplain
              ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" />Analisando sua vantagem...</>
              : explain
                ? <><Sparkles className="w-3.5 h-3.5" />Ocultar explicação</>
                : <><Sparkles className="w-3.5 h-3.5" />Por que eu tenho essa vantagem?</>}
          </button>
          {explainError && <p className="text-xs text-negative/80 px-1">{explainError}</p>}
          {explain && (
            <div className="space-y-2 p-3 rounded-lg bg-neon-blue/5 border border-neon-blue/15 text-xs leading-relaxed">
              <p className="text-muted-foreground">{explain.explanation}</p>
              <div><span className="font-semibold text-foreground/80">Por que o mercado pode errar: </span><span className="text-muted-foreground">{explain.whyMarketMightBeMistaken}</span></div>
              <div><span className="font-semibold text-gold/80">💡 Insight: </span><span className="text-muted-foreground">{explain.keyInsight}</span></div>
              <div><span className="font-semibold text-negative/70">⚠️ Risco: </span><span className="text-muted-foreground">{explain.riskFactor}</span></div>
              <p className="text-[11px] text-muted-foreground pt-1 border-t border-border/15">Análise educacional da IA — nunca uma recomendação de compra.{explain.cached ? " (cache)" : ""}</p>
            </div>
          )}
        </div>
      )}

      {/* Aviso de coerência, NÃO bloqueante: só um desfecho pode acontecer, então
          as suas estimativas no mesmo mercado não podem somar mais que 100%. É
          informação, não permissão — quem quer registrar assim, registra. */}
      {somaEstimativas !== null && somaEstimativas > 100 && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-lg border-l-2 border-gold/50 bg-gold/5">
          <AlertTriangle className="w-3.5 h-3.5 text-gold shrink-0 mt-0.5" />
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Suas estimativas neste mercado somam <span className="font-mono text-foreground">{pct(somaEstimativas)}</span>.
            Como só um desfecho pode acontecer, elas não podem somar mais que 100%.
          </p>
        </div>
      )}

      {/* Registrar a previsão — fecha o loop do Brier (calibração no Dashboard) */}
      {salvo ? (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-positive/10 border border-positive/20">
          <Check className="w-4 h-4 text-positive shrink-0" />
          <p className="text-xs text-foreground">
            Previsão registrada: {salvo.label ? `${salvo.label} a ` : ""}{pct(salvo.valor, 1)}
            {" "}(mercado {pct(preco * 100, 1)}). Acompanhe sua calibração no{" "}
            <Link href="/dashboard"><span className="text-gold hover:underline cursor-pointer">Dashboard</span></Link>.
          </p>
        </div>
      ) : (
        <button
          onClick={handleSave}
          disabled={encerrado}
          className="alvo-toque w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <BookmarkPlus className="w-4 h-4" />
          {encerrado
            ? "Mercado encerrado"
            : anterior
              ? `Atualizar previsão · ${desfecho?.label ?? "SIM"}`
              : `Registrar previsão · ${desfecho ? `${desfecho.label} ` : ""}${pct(estimativaPp, 1)}`}
        </button>
      )}
      {anterior && !salvo && (
        <p className="text-[11px] text-muted-foreground px-1">
          Você já registrou {pct(anterior.userProb, 1)} aqui. A nova entra como uma versão nova e datada — a
          anterior continua valendo para a calibração daquele dia.
        </p>
      )}

      <details className="group">
        <summary className="text-xs text-muted-foreground hover:text-muted-foreground cursor-pointer flex items-center gap-1 select-none">
          <Info className="w-3 h-3" />Como foi calculado
        </summary>
        <div className="mt-2 p-3 rounded-lg bg-obsidian/40 border border-border/20 space-y-1.5 text-xs text-muted-foreground font-mono">
          {desfecho && <p>desfecho = {desfecho.label}</p>}
          <p>p (preço) = {num(preco, 4)} · q (sua estimativa) = {num(estimativa, 4)}</p>
          {calculavel ? (
            <>
              <p>edge = (q − p) × 100 = {num(v.edgePp, 2)} pp</p>
              <p>EV = q ÷ p − 1 = {num(v.ev!, 3)}</p>
              <p>Kelly = (q − p) ÷ (1 − p) = {num(v.kellyCheio!, 3)}</p>
            </>
          ) : (
            <p>EV e Kelly indisponíveis: preço fora da faixa de 0,5% a 99%.</p>
          )}
        </div>
      </details>
    </div>
  );
}
