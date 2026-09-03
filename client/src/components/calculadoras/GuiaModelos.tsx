/**
 * GuiaModelos — guia educacional dos modelos quantitativos (ModelGuide + MODELS +
 * ModelCard + GuiaModelos). Extraido de pages/Calculadoras.tsx.
 */
import { Termo } from "@/components/Termo";
import { useState } from "react";
import {
  type LucideIcon, Calculator, Percent, Target, TrendingUp,
  CheckCircle, AlertCircle, ChevronUp, ChevronDown, BookOpen,
} from "lucide-react";
import AnimatedSection from "@/components/AnimatedSection";

interface ModelGuide {
  id: string;
  icon: LucideIcon;
  name: string;
  tagline: string;
  whenToUse: string[];
  howItWorks: string;
  accuracy: string;
  accuracyColor: string;
  limitacao: string;
  polymarketUso: string;
  steps: string[];
  benchmarks: [string, string][];
}

const MODELS: ModelGuide[] = [
  {
    id: "ev",
    icon: Calculator,
    name: "Valor Esperado (EV)",
    tagline: "O motor de toda decisão racional em mercados",
    whenToUse: [
      "Antes de qualquer posição — sem EV+ não há razão matemática para entrar",
      "Para comparar múltiplas posições e escolher a melhor",
      "Para calcular retorno esperado de uma estratégia ao longo do tempo",
    ],
    howItWorks: "EV = Σ (probabilidade × retorno). Se a soma dos resultados esperados for positiva, a posição tem vantagem matemática. A chave é que sua estimativa de probabilidade precisa ser mais precisa que a do mercado.",
    accuracy: "~100% (matemático)",
    accuracyColor: "text-positive border-positive/30 bg-positive/10",
    limitacao: "O resultado depende 100% da qualidade da sua estimativa de probabilidade. Se você subestima ou superestima, o EV calculado é enganoso.",
    polymarketUso: "No Polymarket, o preço de mercado (ex: 0.65) é a probabilidade implícita. Se você acha que a chance real é 75%, o EV = 0.75×(1/0.65 − 1) − 0.25 > 0.",
    steps: [
      "1. Identifique um evento e estime a probabilidade real (ex: 65%)",
      "2. Veja a odd ou probabilidade implícita do mercado (ex: 55%)",
      "3. Se sua prob > prob do mercado, EV é positivo",
      "4. Calcule: EV = sua_prob × (1/prob_mercado − 1) − (1 − sua_prob)",
      "5. Se EV > 0, considere entrar. Use Kelly para dimensionar.",
    ],
    benchmarks: [
      ["EV > +5%", "Posição atraente — procure confirmar com mais dados"],
      ["EV > +10%", "Oportunidade forte — rara em mercados eficientes"],
      ["EV 0–5%", "Marginal — só entre se tiver alta confiança na sua estimativa"],
      ["EV < 0", "Não aposte — você está pagando para perder no longo prazo"],
    ],
  },
  {
    id: "overround",
    icon: Percent,
    name: "Overround / Margem",
    tagline: "Detecta quanto a casa está cobrando de pedágio",
    whenToUse: [
      "Antes de comparar odds entre mercados e casas",
      "Para identificar mercados mais justos (menor margem)",
      "Para calcular a odd 'fair' sem a comissão da casa",
    ],
    howItWorks: "A soma das probabilidades implícitas de todas as odds deveria ser 100% se não houvesse margem. Quando passa de 100%, o excesso é o overround — o lucro garantido da casa independente do resultado.",
    accuracy: "~100% (matemático)",
    accuracyColor: "text-positive border-positive/30 bg-positive/10",
    limitacao: "Overround baixo não significa que o mercado está precificado corretamente — só que a margem da casa é pequena. Você ainda precisa estimar melhor que o consenso.",
    polymarketUso: "Polymarket e Kalshi têm overround de ~1-3% (taxa de protocolo). Casas esportivas tradicionais têm 5-10%. A diferença entre a odd da Betano e a probabilidade do Polymarket frequentemente revela valor.",
    steps: [
      "1. Colete as odds de todos os resultados possíveis (ex: 1.90 / 1.90)",
      "2. Calcule 1/odd para cada resultado",
      "3. Some todos os valores — se > 1, o excesso é o overround",
      "4. Calcule a fair odd: divide cada prob implícita pela soma total",
      "5. Compare a fair odd com sua estimativa para calcular o EV real",
    ],
    benchmarks: [
      ["< 2%", "Mercado preditivo (Polymarket/Kalshi) — quase justo"],
      ["2–4%", "Exchange (Betfair) — boa opção"],
      ["4–6%", "Casa esportiva competitiva — aceitável"],
      ["> 8%", "Loteria ou mercado de alto risco — evitar"],
    ],
  },
  {
    id: "brier",
    icon: Target,
    name: "Brier Score",
    tagline: "O único indicador honesto de qualidade de previsão",
    whenToUse: [
      "Para medir se suas previsões passadas foram boas ou só 'pareciam' boas",
      "Para comparar sua calibração com a do mercado (Polymarket)",
      "Para identificar áreas onde você sistemicamente erra (viés de confiança)",
    ],
    howItWorks: "Para cada previsão, calcula (sua_prob − resultado)². Médio ao longo de muitas previsões. Um forecaster que diz 70% em algo que acontece 70% das vezes tem BS próximo de 0.21 — melhor que quem diz 90% e erra frequentemente.",
    accuracy: "Benchmark: Superforecasters do GJP têm BS ≈ 0.14",
    accuracyColor: "text-neon-blue border-neon-blue/30 bg-neon-blue/10",
    limitacao: "Requer muitas previsões para ser estatisticamente significativo (mínimo 30). Com poucas previsões, o BS pode variar por sorte.",
    polymarketUso: "O Polymarket publica o preço histórico de cada mercado antes do resultado. Você pode comparar: se o mercado tinha 70% e você tinha 80% em um evento que aconteceu, quem teve menor BS estava mais calibrado.",
    steps: [
      "1. Antes de cada evento, registre sua estimativa (ex: 65%)",
      "2. Após o resultado, anote se aconteceu (1) ou não (0)",
      "3. Calcule (0.65 − 1)² = 0.1225 para esse evento",
      "4. Acumule 20+ previsões e tire a média",
      "5. Compare seu BS com o BS do Polymarket no mesmo período",
    ],
    benchmarks: [
      ["< 0.10", "Forecaster experiente — calibração excelente"],
      ["0.10–0.15", "Bom — melhor que a maioria das pessoas"],
      ["0.15–0.20", "Mediano — espaço para melhorar a calibração"],
      ["0.20–0.25", "Fraco — previsões sistematicamente imprecisas"],
      ["> 0.25", "Pior que chutar 50% sempre — revisar metodologia"],
    ],
  },
  {
    id: "kelly",
    icon: TrendingUp,
    name: "Critério de Kelly",
    tagline: "O tamanho certo da posição para crescer sem risco de ruína",
    whenToUse: [
      "Após confirmar que uma posição tem EV positivo",
      "Para gerenciar o bankroll de forma sustentável no longo prazo",
      "Para comparar o tamanho relativo de diferentes posições",
    ],
    howItWorks: "f* = (b×p − q) / b. Maximiza o crescimento logarítmico do bankroll. Passar do Kelly é matematicamente equivalente a aceitar variância crescente sem recompensa adicional — a chance de ruína aumenta exponencialmente.",
    accuracy: "Crescimento ótimo provado matematicamente (Shannon/Kelly, 1956)",
    accuracyColor: "text-gold border-gold/30 bg-gold/10",
    limitacao: "Assume que sua estimativa de p é precisa. Na prática, há incerteza — daí usar ½ Kelly como proteção contra erros de estimativa.",
    polymarketUso: "No Polymarket, você opera contra o mercado. Se o mercado diz 60% e você acha 75%, o edge = 15pp. Com odd implícita de 1/0.6 = 1.67, o Kelly seria: (0.67×0.75 − 0.25) / 0.67 ≈ 37% — o que seria muito. Use ½ ou ¼ Kelly.",
    steps: [
      "1. Calcule o EV — só prossiga se positivo",
      "2. Identifique b = odd − 1, p = sua prob, q = 1 − p",
      "3. Aplique f* = (b×p − q) / b",
      "4. Multiplique por ½ para ser conservador (½ Kelly)",
      "5. Aposte f* × bankroll. Recalcule após cada resultado.",
    ],
    benchmarks: [
      ["f* < 5%", "Posição pequena — edge marginal ou incerteza alta"],
      ["f* 5–15%", "Posição moderada — edge razoável"],
      ["f* 15–25%", "Posição grande — edge forte, use ½ Kelly"],
      ["f* > 25%", "Suspeite da sua estimativa — improvável em mercados eficientes"],
    ],
  },
];

function ModelCard({ model }: { model: ModelGuide }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = model.icon;

  return (
    <AnimatedSection>
      <div className="glass-card rounded-xl overflow-hidden">
        <div className="p-5">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                <Icon className="w-4 h-4 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground text-sm">{model.name}</h3>
                <p className="text-xs text-muted-foreground">{model.tagline}</p>
              </div>
            </div>
            <span className={`shrink-0 text-[9px] font-semibold px-2 py-0.5 rounded-full border ${model.accuracyColor}`}>
              {model.accuracy}
            </span>
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed mb-3">{model.howItWorks}</p>

          <div className="mb-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">Quando usar</p>
            <ul className="space-y-1">
              {model.whenToUse.map((u) => (
                <li key={u} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <CheckCircle className="w-3 h-3 text-positive shrink-0 mt-0.5" />
                  {u}
                </li>
              ))}
            </ul>
          </div>

          <div className="p-3 rounded-lg bg-gold/5 border border-gold/20 mb-3">
            <p className="text-[10px] font-semibold text-gold uppercase tracking-wider mb-1">Uso em Mercados Preditivos</p>
            <p className="text-xs text-muted-foreground leading-relaxed">{model.polymarketUso}</p>
          </div>

          <button
            onClick={() => setExpanded((v) => !v)}
            className="w-full flex items-center justify-between text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
          >
            <span>{expanded ? "Ocultar" : "Ver"} passo a passo e benchmarks</span>
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {expanded && (
          <div className="border-t border-border/20 p-5 space-y-4 bg-obsidian/20">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Passo a passo</p>
              <ol className="space-y-1">
                {model.steps.map((s) => (
                  <li key={s} className="text-xs text-muted-foreground leading-relaxed">{s}</li>
                ))}
              </ol>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Benchmarks de referência</p>
              <div className="space-y-1">
                {model.benchmarks.map(([v, l]) => (
                  <div key={v} className="flex justify-between text-xs gap-4">
                    <span className="text-muted-foreground">{l}</span>
                    <span className="font-mono text-foreground shrink-0">{v}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-negative/5 border border-negative/20">
              <div className="flex gap-2">
                <AlertCircle className="w-3.5 h-3.5 text-negative shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground"><strong className="text-foreground">Limitação:</strong> {model.limitacao}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </AnimatedSection>
  );
}

export function GuiaModelos() {
  return (
    <div className="space-y-6">
      <AnimatedSection>
        <div className="p-5 rounded-xl border border-gold/20 bg-gold/5">
          <div className="flex gap-3">
            <BookOpen className="w-5 h-5 text-gold shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-foreground mb-1">Como usar este guia</p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Cada modelo resolve um problema específico. A sequência correta é:{" "}
                <strong className="text-foreground"><Termo nome="overround">Overround</Termo></strong> (qual o custo do mercado?) →{" "}
                <strong className="text-foreground"><Termo nome="ev">EV</Termo></strong> (vale a pena entrar?) →{" "}
                <strong className="text-foreground"><Termo nome="kelly">Kelly</Termo></strong> (quanto pôr?) →{" "}
                <strong className="text-foreground"><Termo nome="brier">Brier Score</Termo></strong> (minhas previsões foram boas?).
              </p>
              <p className="text-xs text-gold/80 font-medium mt-2">
                No Polymarket e Kalshi, o preço de mercado já é a probabilidade — use diretamente nas fórmulas.
              </p>
            </div>
          </div>
        </div>
      </AnimatedSection>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {MODELS.map((m) => <ModelCard key={m.id} model={m} />)}
      </div>
    </div>
  );
}
