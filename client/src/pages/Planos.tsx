/**
 * Planos — a página que faltava (NEG-02).
 *
 * A auditoria: "Assinar Premium existe apenas dentro de /perfil, sem preço em
 * lugar nenhum. Não há link de planos no menu nem no rodapé; a primeira menção a
 * Premium na navegação é um filtro do Leaderboard."
 *
 * O efeito disso é o oposto do pretendido: a cota de IA aparece como um limite
 * que atrapalha, sem nunca aparecer como uma escolha que a pessoa pode fazer.
 * Cota sem preço à vista irrita em vez de converter.
 *
 * ⚠️ SOBRE O PREÇO. Ele NÃO está escrito aqui. Vem de
 * `VITE_PREMIUM_PRECO_BRL`, porque é decisão do fundador e porque inventar um
 * número numa página de preços seria a coisa mais grave que este site poderia
 * fazer — ele vende, literalmente, não inventar números. Enquanto a variável não
 * estiver definida, a página diz que o preço está sendo definido e oferece o
 * e-mail de contato. Estado honesto é melhor que placeholder.
 */
import { Link } from "wouter";
import PageHeader from "@/components/PageHeader";
import AnimatedSection from "@/components/AnimatedSection";
import { useSEO } from "@/hooks/useSEO";
import { openUpgrade } from "@/lib/upgrade";
import { Check, Minus, Star, Mail, ArrowRight, ShieldCheck } from "lucide-react";
import { reaisExatos } from "@shared/formato";

/** Mesma cota que o servidor aplica (FREE_LIMIT em middleware/aiCredits.ts). */
const COTA_GRATIS = 4;

const CONTATO = "contato.jlbanalytics@gmail.com";

interface Linha {
  recurso: string;
  gratis: string | boolean;
  premium: string | boolean;
  nota?: string;
}

const COMPARATIVO: Linha[] = [
  { recurso: "Mercados ao vivo do Polymarket e Kalshi", gratis: true, premium: true },
  { recurso: "Os cinco níveis da trilha, com as calculadoras", gratis: true, premium: true,
    nota: "A parte educacional é gratuita e continua sendo. Não é isca." },
  { recurso: "Track Record auditável", gratis: true, premium: true },
  { recurso: "Banca Simulada", gratis: true, premium: true },
  { recurso: "Registrar previsões e medir sua calibração", gratis: true, premium: true },
  { recurso: "Análises de mercado por IA", gratis: `${COTA_GRATIS} por mês`, premium: "sem limite" },
  { recurso: "Previsão Guiada e Briefing por IA", gratis: "dentro da mesma cota", premium: "sem limite" },
  { recurso: "Histórico sincronizado entre aparelhos", gratis: true, premium: true },
  { recurso: "Prioridade em recursos novos", gratis: false, premium: true },
];

function Marca({ v }: { v: string | boolean }) {
  if (v === true) return <Check className="w-4 h-4 text-positive mx-auto" aria-label="incluído" />;
  if (v === false) return <Minus className="w-4 h-4 text-muted-foreground mx-auto" aria-label="não incluído" />;
  return <span className="text-xs text-foreground">{v}</span>;
}

export default function Planos() {
  useSEO(
    "Planos e preços",
    "O que é gratuito na JLB Analytics e o que o Premium acrescenta. A trilha educacional inteira é grátis; o Premium tira o limite das análises de IA.",
  );

  const bruto = import.meta.env.VITE_PREMIUM_PRECO_BRL as string | undefined;
  const preco = bruto && Number.isFinite(Number(bruto)) ? Number(bruto) : null;

  return (
    <div>
      <PageHeader
        badge="Planos"
        title="O que é grátis, e o que o Premium acrescenta"
        subtitle="A trilha educacional inteira, o Track Record e a Banca Simulada são gratuitos — e continuam sendo. O Premium tira o limite das análises de IA, que é o que custa dinheiro para rodar."
      />

      <div className="container py-10 space-y-6 max-w-3xl">
        <AnimatedSection>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Grátis */}
            <div className="panel p-6 space-y-3">
              <p className="text-sm font-semibold text-foreground">Grátis</p>
              <p className="numeric-hero text-4xl text-foreground leading-none">R$ 0</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Sem cartão, sem período de teste que vira cobrança. A conta gratuita existe para
                você medir a própria calibração — não para provar o produto por 7 dias.
              </p>
              <Link href="/login"
                className="alvo-toque inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border/40 text-sm font-medium text-foreground hover:border-primary/40 transition-colors">
                Criar conta <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </Link>
            </div>

            {/* Premium */}
            <div className="panel p-6 space-y-3 border-gold/25 bg-gold/[0.04]">
              <p className="text-sm font-semibold text-gold inline-flex items-center gap-1.5">
                <Star className="w-4 h-4" aria-hidden="true" /> Premium
              </p>
              {preco !== null ? (
                <>
                  <p className="numeric-hero text-4xl text-foreground leading-none">
                    {reaisExatos(preco)}<span className="text-base text-muted-foreground"> /mês</span>
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Cancelamento a qualquer momento, pelo próprio painel. Sem fidelidade.
                  </p>
                  <button
                    onClick={() => openUpgrade({ reason: "manual" })}
                    className="alvo-toque inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity">
                    Assinar Premium <ArrowRight className="w-4 h-4" aria-hidden="true" />
                  </button>
                </>
              ) : (
                <>
                  {/* Sem preço definido, a página diz isso — não inventa número.
                      Numa plataforma que vende rigor, um preço de mentira numa
                      página de preços é a contradição mais cara possível. */}
                  <p className="text-2xl font-semibold text-foreground leading-tight">Preço em definição</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Ainda estamos fechando o valor. Preferimos deixar esta página sem número a
                    publicar um que vai mudar — é a mesma regra que aplicamos aos dados do site.
                  </p>
                  <a href={`mailto:${CONTATO}?subject=Interesse%20no%20JLB%20Premium`}
                    className="alvo-toque inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gold/40 bg-gold/10 text-sm font-semibold text-gold hover:bg-gold/20 transition-colors">
                    <Mail className="w-4 h-4" aria-hidden="true" /> Avise-me quando abrir
                  </a>
                </>
              )}
            </div>
          </div>
        </AnimatedSection>

        <AnimatedSection>
          <div className="panel p-6">
            <p className="text-sm font-semibold text-foreground mb-4">O que muda, item a item</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground border-b border-border/30">
                    <th className="text-left font-medium py-2">Recurso</th>
                    <th className="text-center font-medium py-2 w-28">Grátis</th>
                    <th className="text-center font-medium py-2 w-28">Premium</th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARATIVO.map((l) => (
                    <tr key={l.recurso} className="border-b border-border/15 last:border-0">
                      <td className="py-2.5 pr-3 text-foreground/90">
                        {l.recurso}
                        {l.nota && <span className="block text-xs text-muted-foreground mt-0.5">{l.nota}</span>}
                      </td>
                      <td className="py-2.5 text-center"><Marca v={l.gratis} /></td>
                      <td className="py-2.5 text-center"><Marca v={l.premium} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </AnimatedSection>

        <AnimatedSection>
          <div className="rounded-2xl border border-border/30 bg-secondary/10 p-5">
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck className="w-4 h-4 text-positive shrink-0" aria-hidden="true" />
              <p className="text-sm font-semibold text-foreground">O que o Premium não é</p>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Não existe versão paga que preveja melhor. A IA é a mesma, o Track Record é o mesmo, e os
              erros dela aparecem para quem paga e para quem não paga — estão publicados na{" "}
              <Link href="/track-record" className="text-gold hover:underline">mesma página pública</Link>.
              O Premium tira o limite de quantas análises você pede por mês, e nada além disso. Se
              alguém prometer retorno garantido em mercado preditivo, incluindo nós, é hora de
              desconfiar.
            </p>
          </div>
        </AnimatedSection>
      </div>
    </div>
  );
}
