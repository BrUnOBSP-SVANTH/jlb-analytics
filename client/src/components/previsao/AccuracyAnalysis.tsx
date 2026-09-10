/**
 * AccuracyAnalysis — onde a IA tem (ou não tem) vantagem, por tema.
 *
 * O QUE MUDOU (auditoria de 09/09/2026 — TRK-01 a TRK-04, TRK-09).
 * Este bloco calculava tudo no navegador a partir das 50 resoluções mais
 * recentes, com uma taxonomia própria de 20 categorias. O resultado é que na
 * MESMA página ele dizia "batemos o mercado: 43%" enquanto o card de manchete,
 * dez centímetros acima, dizia 12%. Nenhum dos dois estava errado: eram
 * perguntas diferentes (divergência × Brier) sobre amostras diferentes (50
 * linhas × todas as resolvidas) — só que nada na tela dizia isso, e a conclusão
 * natural de quem lê é que um dos dois é maquiagem.
 *
 * A tabela por tema, com ~5 casos por categoria, ainda violava a regra que a
 * própria página publica em letras grandes: "só exibimos os números a partir de
 * 20 resolvidas".
 *
 * Agora as duas medidas vêm do servidor, da mesma amostra e do mesmo
 * denominador (`server/lib/amostraIA.ts`), e cada card diz qual pergunta
 * responde.
 */
import { useState, useEffect } from "react";
import AnimatedSection from "@/components/AnimatedSection";
import { pct, plural } from "@shared/formato";
import { TrendingUp, TrendingDown, Minus, Info, BarChart3, Check, Target } from "lucide-react";

interface TrackRecord {
  available: boolean;
  resolvedCount: number;
  settledCount: number;
  minAmostra: number;
  hitRate: number | null;
  marketHitRate: number | null;
  edgeRate: number | null;
  edgeCount: number;
  aiBrier: number | null;
  marketBrier: number | null;
  skillVsMarket: number | null;
}

interface TemaLinha {
  tema: string; n: number;
  acerto: number | null;
  acertoMercado: number | null;
  acertoAoDivergir: number | null;
  divergimos: number;
}

interface PorCategoria {
  available: boolean;
  temas?: TemaLinha[];
  semAmostra?: { tema: string; n: number }[];
  minAmostra?: number;
}

// A MESMA lista de `PorTema.tsx`. Duas tabelas na mesma tela com taxonomias
// diferentes ("Geopolítica" aqui, "Outros" ali) foi o achado TRK-04.
const NOMES: Record<string, string> = {
  esports: "E-sports", sports: "Esportes", tennis: "Tênis", crypto: "Cripto",
  politics: "Política", economy: "Economia", culture: "Cultura", science: "Ciência",
  climate: "Clima", other: "Outros",
};
const nomeTema = (t: string) => NOMES[t] ?? t;

/**
 * O skill saía como "−0%" quando a diferença era um arredondamento (TRK-09).
 * "−0%" não é número: é uma diferença tão pequena que o sinal é ruído. Abaixo do
 * limiar a resposta honesta é "empatamos", escrita com todas as letras.
 */
function SkillBadge({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  if (Math.abs(value) < 0.005) {
    return <span className="inline-flex items-center gap-1 text-muted-foreground"><Minus className="w-3.5 h-3.5" aria-hidden="true" />empate</span>;
  }
  const bom = value > 0;
  const Icon = bom ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 font-semibold ${bom ? "text-positive" : "text-negative"}`}>
      <Icon className="w-3.5 h-3.5" aria-hidden="true" />{bom ? "+" : "−"}{Math.abs(value * 100).toFixed(0)}%
    </span>
  );
}

export function AccuracyAnalysis() {
  const [tr, setTr] = useState<TrackRecord | null>(null);
  const [cat, setCat] = useState<PorCategoria | null>(null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let vivo = true;
    Promise.all([
      fetch("/api/ai/track-record").then((r) => r.json() as Promise<TrackRecord>),
      fetch("/api/ai/by-category").then((r) => r.json() as Promise<PorCategoria>),
    ])
      .then(([a, b]) => { if (vivo) { setTr(a); setCat(b); } })
      .catch(() => { if (vivo) setErro(true); });
    return () => { vivo = false; };
  }, []);

  if (erro) return null;
  if (!tr || !cat) return <div className="panel p-6"><div className="h-40 rounded-xl bg-muted/20 animate-pulse" /></div>;
  if (!tr.available) return null;

  const N = tr.resolvedCount;
  const minimo = tr.minAmostra ?? 20;
  const amostraPequena = N < minimo;
  const temas = cat.temas ?? [];

  return (
    <AnimatedSection>
      <div className="panel p-6 space-y-5">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-neon-blue shrink-0" aria-hidden="true" />
          <p className="text-sm font-semibold text-foreground">Análise de acurácia — onde confiar (ou não) na IA</p>
        </div>

        {amostraPequena && (
          <div className="flex items-start gap-2 text-xs text-muted-foreground bg-secondary/20 border border-border/20 rounded-lg p-2.5">
            <Info className="w-3.5 h-3.5 text-neon-blue shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              Amostra pequena ({plural(N, "mercado", "mercados")}). Isto mostra a{" "}
              <strong className="text-foreground/80">direção</strong>, não um veredito — a prova amadurece
              conforme mais mercados liquidam pelo resultado oficial.
            </span>
          </div>
        )}

        {/* AS DUAS MEDIDAS — mesma amostra, perguntas diferentes, ditas em voz alta */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-xl border border-positive/25 bg-positive/[0.04] p-4">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <p className="text-xs uppercase tracking-wide text-positive font-semibold inline-flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5" aria-hidden="true" /> Acertamos a direção
              </p>
              <p className="text-2xl font-bold text-foreground tabular-nums">{pct(tr.hitRate)}</p>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              A IA sabe qual lado é o <strong className="text-foreground/80">mais provável</strong> — vai acontecer ou não?
              {tr.marketHitRate !== null && <> O mercado acerta {pct(tr.marketHitRate)} nas mesmas perguntas.</>}
              <span className="text-foreground/80"> É a parte fácil: quase nenhum mercado é 50/50, então saber o lado óbvio já acerta muito.</span>
            </p>
          </div>

          <div className="rounded-xl border border-gold/30 bg-gold/[0.05] p-4">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <p className="text-xs uppercase tracking-wide text-gold font-semibold inline-flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5" aria-hidden="true" /> Batemos o mercado
              </p>
              <p className="text-2xl font-bold text-foreground tabular-nums">{pct(tr.edgeRate)}</p>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Quando a IA <strong className="text-foreground/80">discorda do preço</strong> e arrisca dizer que o mercado
              errou, ela acerta? Em {plural(tr.edgeCount, "caso de divergência", "casos de divergência")}.
              <span className="text-foreground/80"> É o teste mais difícil que existe — vencer a sabedoria da multidão.</span>
            </p>
          </div>
        </div>

        {/* O denominador, escrito uma vez, valendo para os dois cards acima */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>
            <strong className="text-foreground tabular-nums">{N}</strong> mercados resolvidos
            {tr.settledCount > 0 && <>, {tr.settledCount} pelo resultado oficial</>}
          </span>
          <span className="text-border/50" aria-hidden="true">·</span>
          <span className="inline-flex items-center gap-1">Calibração vs mercado: <SkillBadge value={tr.skillVsMarket} /></span>
        </div>

        {/* Por tema — a mesma régua de amostra do resto do site */}
        {temas.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Por tema</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-muted-foreground text-left">
                    <th className="py-1.5 pr-2 font-medium">Tema</th>
                    <th className="py-1.5 px-2 font-medium text-right">Mercados</th>
                    <th className="py-1.5 px-2 font-medium text-right">Direção</th>
                    <th className="py-1.5 pl-2 font-medium text-right">Ao divergir</th>
                  </tr>
                </thead>
                <tbody>
                  {temas.map((t) => (
                    <tr key={t.tema} className="border-t border-border/10">
                      <td className="py-1.5 pr-2 text-foreground">{nomeTema(t.tema)}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums text-muted-foreground">{t.n}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums text-foreground">{pct(t.acerto)}</td>
                      <td className="py-1.5 pl-2 text-right tabular-nums text-foreground">{pct(t.acertoAoDivergir)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {(cat.semAmostra?.length ?? 0) > 0 && (
              <p className="text-xs text-muted-foreground leading-relaxed mt-2">
                Ainda sem prova suficiente (menos de {minimo} casos):{" "}
                {cat.semAmostra!.map((t) => `${nomeTema(t.tema)} (${t.n})`).join(", ")}.
              </p>
            )}
          </div>
        )}

        <p className="text-xs text-muted-foreground leading-relaxed">
          <strong className="text-foreground/80">Direção</strong> = acertou o lado mais provável.{" "}
          <strong className="text-foreground/80">Ao divergir</strong> = das vezes em que a IA discordou do
          preço, quantas ela acertou — o teste que mede vantagem de verdade.{" "}
          <strong className="text-foreground/80">Calibração</strong> = quanto o Brier da IA é melhor (+) ou
          pior (−) que o do mercado. Cada mercado conta uma vez, e os dois números acima dividem pelo mesmo
          conjunto de {N} resoluções.
        </p>
      </div>
    </AnimatedSection>
  );
}
