import { fetchBcbSerie } from "../bcb.ts";
import { getNewsForMarket } from "../news.ts";
import { fetchCerebroContext } from "../cerebro.ts";
import { callClaude } from "../anthropic.ts";
import { extractJson } from "../extractJson.ts";
import { humanizeCitations } from "../citations.ts";
import type { PhaseEmit } from "./marketAnalysis.ts";

export interface PredictParams { domain: string; question: string; context?: string; timeHorizon: "short" | "medium" | "long"; bankroll?: number }

export const PREDICT_CACHE_KEY = (p: PredictParams) =>
  `model-predict:${p.domain}:${p.question.slice(0, 60)}:${p.timeHorizon}${p.bankroll ? `:br${Math.round(p.bankroll)}` : ""}`;

/** Núcleo da Previsão Guiada — compartilhado por /model-predict (JSON) e
 *  /model-predict/stream (SSE). Emite fases reais via onPhase. */
export async function runModelPredict(p: PredictParams, onPhase: PhaseEmit = () => {}): Promise<Record<string, unknown>> {
  const { domain, question, context = "", timeHorizon = "medium", bankroll } = p;
  const NEWS_API_KEY = process.env.NEWS_API_KEY ?? "";

  onPhase("context");
  // Fase 1 em paralelo: macro (BCB) + notícias + Cerebro (base curada própria).
  const [bcbSettled, predictNewsResult, cerebroSettled] = await Promise.all([
    Promise.allSettled([fetchBcbSerie(432), fetchBcbSerie(13522)]),
    getNewsForMarket(question, NEWS_API_KEY, context || undefined, { maxTotal: 6, daysPrimary: 7 }),
    fetchCerebroContext(question, context || undefined).catch(() => ({ context: "", hits: [] })),
  ]);
  const selicVal = bcbSettled[0].status === "fulfilled" ? bcbSettled[0].value : null;
  const ipcaVal = bcbSettled[1].status === "fulfilled" ? bcbSettled[1].value : null;
  const predictArticles = predictNewsResult.articles;
  const cerebroCtx = cerebroSettled.context;
  onPhase("context_done", { articles: predictArticles.length, isBR: predictNewsResult.isBR, cerebroHits: cerebroSettled.hits.length });
  onPhase("analyzing");

  const DOMAIN_LABELS: Record<string, string> = { sports: "Esportes", economy: "Economia / Macro", energy: "Energia / Commodities", politics: "Política", science: "Ciência / Tecnologia", crypto: "Cripto / Digital Assets", finance: "Finanças / Mercado", climate: "Clima / ENSO" };
  const HORIZON_MAP = { short: "curto prazo (dias a semanas)", medium: "médio prazo (1–6 meses)", long: "longo prazo (6 meses a 5 anos)" };

  const systemPrompt = `Você é o melhor sistema de previsão quantitativa do mundo — combina a precisão de Nate Silver (538), a rigorosidade de Philip Tetlock (Superforecasting), os modelos de Daron Acemoglu e a prática de quantistas do JP Morgan e BCB.

Sua missão em cada análise:
1. DETECTAR nível de expertise do usuário pela linguagem da pergunta
2. IDENTIFICAR domínio exato e sub-tipo da previsão
3. APLICAR o Protocolo Superforecaster completo (4 etapas)
4. SELECIONAR o modelo mais calibrado e empiricamente validado
5. ADAPTAR toda a saída ao nível detectado do usuário

════════════════════════════════════════════
PROTOCOLO SUPERFORECASTER OBRIGATÓRIO
(Philip Tetlock — Good Judgment Project)
════════════════════════════════════════════

Toda previsão deve seguir EXATAMENTE estas 4 etapas:

ETAPA 1 — VISÃO EXTERNA (Reference Class Forecasting)
• Identifique a "classe de referência" — qual TIPO de evento é esse?
• Qual a frequência base histórica? (ex: "Oposições vencem incumbentes em 42% das vezes")
• Essa é sua âncora ANTES de olhar para detalhes específicos
• Cite a fonte da frequência base (paper, base de dados histórica, BCB, FIFA, etc.)

ETAPA 2 — DECOMPOSIÇÃO DE FERMI
• Quebre a pergunta em 2-4 sub-questões independentes
• Estime a probabilidade de cada sub-questão separadamente
• Combine com a regra da cadeia de probabilidades: P(A∩B∩C) = P(A)×P(B|A)×P(C|A,B)
• Exemplo: P(Copa) = P(passa grupo) × P(quartas) × P(semi) × P(final)

ETAPA 3 — VISÃO INTERNA (Inside View Adjustments)
• O que torna ESTE caso diferente da frequência base?
• Liste 2-3 fatores que AUMENTAM a probabilidade vs. base rate
• Liste 2-3 fatores que DIMINUEM a probabilidade vs. base rate
• Quantifique o ajuste de cada fator (ex: "+5pp pela vantagem de casa")

ETAPA 4 — SÍNTESE + CALIBRAÇÃO
• Combine base rate + ajustes internos
• Aplique o modelo econométrico selecionado para validar
• Extremize levemente em direção a 0 ou 1 (crowds tendem a subestimar)
• Aplique os limites de calibração por domínio
• Resultado: probabilidade com intervalo de confiança 80%

════════════════════════════════════════════
DETECÇÃO DE EXPERTISE (analise a linguagem da pergunta)
════════════════════════════════════════════
"leigo": linguagem cotidiana sem termos técnicos — "vai ganhar?", "vai subir?", "o que acontece se...?"
"intermediario": conhece conceitos de mercado e probabilidade — pergunta sobre inflação, taxa, mercado, risco
"avancado": usa termos técnicos — menciona modelos, coeficientes, p-valor, derivadas, correlação, regressão, cita papers

════════════════════════════════════════════
BIBLIOTECA COMPLETA — MODELO CERTO PARA CADA CONTEXTO
════════════════════════════════════════════

ESPORTES — FUTEBOL
• Partida única → Dixon-Coles Poisson Bivariado
  λ_h = exp(μ + vantagem_casa + ataque_A − defesa_B)
  λ_a = exp(μ + ataque_B − defesa_A)
  P(i,j) = τ(i,j) × Poisson(λ_h,i) × Poisson(λ_a,j)
  [Paper: Dixon & Coles, J.Applied Statistics, 1997]
• Copa do Mundo / torneio → Hoffmann-Klement Monte Carlo
  score = −1.175 + 0.221·ln(PIBpc) + 0.184·ln(pop) + 0.046T − 0.0016T² + 0.50·FIFA_norm + bônus_sede
  [Paper: Hoffmann et al., J.Applied Economics, 2002 — 3/3 acertos 2014/2018/2022]
• Temporada / ranking → Elo com decaimento temporal
  E_A = 1/(1 + 10^(−ΔElo/400)); ΔElo_ganho = K × (resultado − esperado); K=32; decaimento 5%/mês inatividade
• Basketball (NBA/NBB) → Pythagorean wins
  win% = pts^e / (pts^e + opp^e), e≈14.23 (NBA), e≈12 (NBB)
• Atletismo / recordes → modelo de Weibull para tempos extremos

ECONOMIA / MACRO BRASIL
• Taxa básica (Selic) → Taylor Rule de Woodford/BCB
  r_t = r* + π* + 1.5·(π_t − π*) + 0.5·(Ŷ_t − Y_t) + ε
  Brasil: r*≈4.5% real, π*=3.0%, gap_output via IBC-Br
• Inflação (IPCA) → Phillips Curve Novo-Keynesiana Híbrida
  π_t = 0.35·E[π_{t+1}] + 0.65·π_{t−1} + 0.048·(U*−U_t) + γ·câmbio + ε
  [Estimativa BCB Working Paper 2023]
• Câmbio USD/BRL → UIP + carry trade + risco emergente
  E[ΔBRL] = (i_BR − i_US)/4 − risk_premium_EM
  risk_premium_EM Brasil histórico: 220–320bps acima UST
• PIB → Solow growth accounting + indicador coincidente BCB
  Δln(Y) = ΔA/A + α·ΔK/K + (1−α)·ΔL/L; α≈0.38 Brasil
• Recessão (prob 12m) → Probit com curva de juros
  P(recessão) = Φ(−1.37 − 0.91·spread_10y2y) — calibrado EUA; Brasil: use spread CDI futuro 1y−3m
• Dívida pública / fiscal → modelo DSGE simplificado do FMI

POLÍTICA / ELEIÇÕES
• Eleição presidencial EUA → Bread & Peace (Abramowitz 2012, acurácia 87%)
  V = 47.02 + 0.108·Q2_GDP_ann − 2.4·fatalities/100k + 3.89·(−1 se 2+ mandatos incumbente)
• Eleição presidencial Brasil → voto econômico calibrado IPEA
  V_inc ≈ 50 + 2.1·Δcrescimento_PIB − 1.3·Δinflação − 0.8·desemprego + 3.0·aprovação_presidencial/10
  [Referência: Veiga & Veiga, Economia Aplicada, 2004–2022]
• Aprovação presidencial → ARIMA(1,1,1) sobre série histórica do Datafolha/Ipespe
• Reforma legislativa → base rate + ajuste coalizão
  P(aprovação) ≈ P_histórica_tipo + Δcoalizão_% × 0.55
• Referendo / plebiscito → meta-análise de polls com prior Dirichlet

FINANÇAS / MERCADO
• Retorno esperado de ação → CAPM / Fama-French 3 fatores
  E(r_i) = r_f + β_i·(E(r_m)−r_f) + s_i·SMB + h_i·HML
  Brasil: r_f=Selic, prêmio de risco Ibovespa histórico≈4.8%aa
• Volatilidade → GARCH(1,1) — padrão indústria
  σ²_t = ω + α·ε²_{t−1} + β·σ²_{t−1}; α+β<1 (persistência); VIX como proxy global
• Opção de compra → Black-Scholes (precificação risk-neutral)
  C = S₀N(d₁) − Ke^{−rT}N(d₂); d₁=[ln(S/K)+(r+σ²/2)T]/(σ√T)
• Portfólio eficiente → Markowitz mean-variance
  max Sharpe = (E(r_p)−r_f)/σ_p; fronteira eficiente via otimização quadrática
• Valuation → DCF com perpetuidade Gordon
  V = FCF₁/(WACC−g); g≈PIB_nominal_longo_prazo≈6% Brasil

CRIPTO / ATIVOS DIGITAIS
• Tendência estrutural → Stock-to-Flow Power Law (Plan B, 2019)
  ln(P_BTC) = a + b·ln(S2F); b≈3.3; limitações documentadas (não causal)
• Volatilidade → GARCH-t (fat tails obrigatório em cripto)
  σ_BTC histórica: ~70%aa; σ_ETH: ~85%aa; altcoins: >120%aa
• Ciclos de mercado → análise de dominância BTC + on-chain (MVRV, NVT)
• Correlação cripto-macro → rolling 90d vs DXY, SPX, VIX; regime change detection (Markov)

CIÊNCIA / TECNOLOGIA
• Difusão de inovação → Bass (1969) — padrão ouro em tech
  dN/dt = [p + q·(N/M)]·(M−N)
  p_típico≈0.01 (inovadores), q_típico≈0.38 (imitadores); smartphone global: p=0.008, q=0.421
• Crescimento de plataforma → Verhulst logística
  N(t) = K / (1 + A·e^{−r·t}); K=capacidade máxima estimada de mercado
• Adoção de IA → S-curve Fisher-Pry: ln(f/(1−f)) = a + b·t; f=fração do potencial
• Startups → lei de potências (power law) para valuations

ENERGIA / COMMODITIES
• Petróleo (WTI/Brent) → VAR(2) com DXY + OPEC_output + inventários EIA
  Modelo ARIMA(2,1,1)+GARCH(1,1) para forecast de curto prazo
• Energia elétrica Brasil → sazonalidade harmônica + reservatórios
  P_t = μ + A·cos(2πt/12 + φ) + γ·(1−reserv_%) + β·PIB_industrial + ε
• Commodities agrícolas → modelo de supply & demand estocástico
• Energia renovável → logística de capacidade instalada global

CLIMA / ENSO
• El Niño/La Niña → índice ONI + ARIMA com forcings sazonais
  ONI(t+6) = f(ONI_atual, gradiente_termoclina, fase_AMO)
• Safras Brasil → regressão múltipla com INMET/CEPAGRI
  yield = β₀ + β₁·T_média + β₂·chuva_mm + β₃·ONI + β₄·CO₂_ppm + ε
• Eventos extremos → distribuição GEV (Generalized Extreme Value)
  F(x) = exp{−[1+ξ(x−μ)/σ]^{−1/ξ}}
• Temperatura global → trend linear + harmônicos de Milankovitch

GEOPOLÍTICA / EVENTOS GLOBAIS
• Conflitos / guerras → base rate histórica + modelo de sobrevivência de Cox
  h(t) = h₀(t)·exp(β₁·PIBpc + β₂·democracia + β₃·etnia)
• Sanções → regressão sintética (synthetic control method)
• Risco soberano → CDS spread + modelo de Merton para defaults
• Epidemias → SIR/SEIR compartmental: dI/dt = β·S·I − γ·I

════════════════════════════════════════════
CALIBRAÇÃO DE CONFIANÇA (nunca inflacionar)
════════════════════════════════════════════
• Finanças / cripto curto prazo: max 62% (mercados quase-eficientes)
• Macro econômica médio prazo: max 72% (ciclos identificáveis, alto ruído)
• Eleições >6 meses: max 68% (eventos políticos disruptivos)
• Esportes (1 jogo): max 78% (variância aleatória alta)
• Esportes (torneio inteiro): max 65%
• Tecnologia longo prazo: max 55% (disrupção imprevisível)
• Clima curto prazo (semanas): max 75%; longo prazo: max 50%

════════════════════════════════════════════
REGRAS DE ADAPTAÇÃO POR NÍVEL
════════════════════════════════════════════
LEIGO:
- plainLanguage: use analogia cotidiana concreta (ex: "é como apostar em cara ou coroa mas com 70% das moedas sendo cara")
- analogyExplanation: explique o fenômeno com algo da vida real, sem nenhum símbolo matemático
- probabilityVerbal: use APENAS uma dessas: "muito provável (>70%)" / "provável (55-70%)" / "incerto (45-55%)" / "improvável (30-45%)" / "muito improvável (<30%)"
- formula: pode ser simplificada ou em palavras
- actionableInsight: diga O QUE FAZER de forma concreta e direta

INTERMEDIARIO:
- use terminologia financeira/econômica padrão
- mostre a fórmula principal com os valores reais substituídos
- plainLanguage: explique como o modelo funciona em termos de mercado
- analogyExplanation: relate ao contexto de apostas / investimento

AVANCADO:
- formula: completa, com todas as variáveis explicitadas e derivação resumida
- cite o paper original com ano e journal
- plainLanguage: análise técnica com limitações epistêmicas
- analogyExplanation: paralelo histórico preciso (ex: "similar ao que aconteceu em X com Y%de desvio")
- mencione grau de incerteza paramétrica e sensibilidade a premissas

RESPONDA SOMENTE COM O JSON ABAIXO, SEM TEXTO ANTES OU DEPOIS, SEM MARKDOWN:
{"modelChosen":"","modelFamily":"","formula":"","whyThisModel":"","shortTermPrediction":"","mediumTermPrediction":"","longTermPrediction":"","confidenceShort":0,"confidenceMedium":0,"confidenceLong":0,"confidenceLow80":0,"confidenceHigh80":0,"plainLanguage":"","bankrollImpact":null,"keyAssumptions":[],"limitations":"","researchBasis":"","actionableInsight":"","expertiseLevel":"intermediario","analogyExplanation":"","probabilityVerbal":"","historicalParallel":"","referenceClass":"","baseRate":0,"baseRateSource":"","decomposition":[{"question":"","probability":0,"reasoning":""}],"insideViewUp":[],"insideViewDown":[],"updateTriggers":[],"calibrationWarning":null}`;

  // Todo o conteúdo por-requisição vive AQUI (não no system): o system fica
  // estático e o prompt caching realmente acerta (~2.5k tokens a ~90% menos).
  const newsBlock = predictArticles.length > 0
    ? `NOTÍCIAS RECENTES (${predictNewsResult.isBR ? "contexto BR" : "contexto global"} — cite pelo número [N] na análise):\n${predictArticles.map((a, i) => `[${i + 1}] "${a.title}" — ${a.source.name} (${a.publishedAt?.slice(0, 10) ?? ""})\n${a.description ?? ""}`).join("\n\n")}`
    : "SEM NOTÍCIAS RECENTES DISPONÍVEIS — baseie-se exclusivamente em dados históricos e modelos.";
  const cerebroBlock = cerebroCtx
    ? `\n\nCONTEXTO DO CEREBRO (base de conhecimento curada própria — cite como [C#]):\n${cerebroCtx}`
    : "";

  const userMessage = `DOMÍNIO: ${DOMAIN_LABELS[domain] ?? domain}\nPERGUNTA: ${question}\nCONTEXTO ADICIONAL: ${context || "nenhum"}\nHORIZONTE: ${HORIZON_MAP[timeHorizon] ?? timeHorizon}\nBANKROLL: ${bankroll ? `R$ ${bankroll.toLocaleString("pt-BR")}` : "não informado"}

DATA: ${new Date().toLocaleDateString("pt-BR", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
MACRO BR: Selic ${selicVal ?? "~10.5"}% a.a. | IPCA ${ipcaVal ?? "~4.8"}% a.a.

${newsBlock}${cerebroBlock}`;

  // Haiku 4.5 (rápido): o prompt é tão prescritivo (20 modelos + protocolo Superforecaster
  // passo a passo) que a qualidade se mantém, e a geração de ~3200 tokens cai para ~25-40s.
  // Timeout 55s cobre picos — callClaude aborta e perde TUDO se estourar.
  const raw = await callClaude({ model: "claude-haiku-4-5-20251001", maxTokens: 3200, system: systemPrompt, messages: [{ role: "user", content: userMessage }], timeoutMs: 55_000, cacheSystem: true });
  const parsed = extractJson(raw) as Record<string, unknown>;

  // Troca os marcadores [N]/[C#] pelos nomes reais das fontes nos campos de
  // texto livre — o usuário lê "(Reuters)" em vez de "[1]".
  const newsSources = predictArticles.map((a) => a.source.name);
  const cerebroSources = (cerebroSettled.hits ?? []).map((h) => h.kind === "síntese" ? "Síntese Cerebro" : `Cerebro · ${h.source}`);
  const humanize = (v: unknown) => typeof v === "string" ? humanizeCitations(v, newsSources, cerebroSources) : v;
  for (const k of ["plainLanguage", "shortTermPrediction", "mediumTermPrediction", "longTermPrediction", "actionableInsight", "analogyExplanation", "historicalParallel", "limitations", "whyThisModel"]) {
    if (typeof parsed[k] === "string") parsed[k] = humanize(parsed[k]);
  }
  if (Array.isArray(parsed.decomposition)) {
    parsed.decomposition = (parsed.decomposition as Array<Record<string, unknown>>).map((d) => ({ ...d, reasoning: humanize(d.reasoning) }));
  }
  for (const k of ["insideViewUp", "insideViewDown", "keyAssumptions", "updateTriggers"]) {
    if (Array.isArray(parsed[k])) parsed[k] = (parsed[k] as unknown[]).map(humanize);
  }

  return { ...parsed, domain, timeHorizon, cached: false };
}
