/**
 * Planos — a página que faltava (NEG-02), agora desenhada.
 *
 * O PROBLEMA DA PRIMEIRA VERSÃO. Eu a montei funcional: dois cards de plano e
 * uma tabela de nove linhas com duas colunas. Mas cinco dessas nove linhas eram
 * "sim" nas duas colunas — cinco fileiras de dois tiques verdes idênticos, que
 * não comparam nada. O leitor percorria a tabela inteira para descobrir, na
 * sexta linha, que só uma coisa muda.
 *
 * A DECISÃO DE DESENHO: se só uma coisa muda, a página é sobre essa coisa.
 *
 * Ela abre dizendo o que é grátis — que é quase tudo, e é o argumento forte —,
 * depois mostra a ÚNICA diferença com os dois números frente a frente, e só
 * então fala de preço. A ordem importa: uma página de planos que abre pelo
 * preço pede uma decisão antes de dar a informação para tomá-la.
 *
 * ⚠️ O PREÇO NÃO ESTÁ ESCRITO NO CÓDIGO. Vem de `VITE_PREMIUM_PRECO_BRL`. Sem a
 * variável, a página diz que o preço está sendo definido e oferece o contato.
 * Num site que vende não inventar números, um preço de mentira numa página de
 * preços seria a contradição mais cara possível.
 */
import { Link } from "wouter";
import PageHeader from "@/components/PageHeader";
import AnimatedSection from "@/components/AnimatedSection";
import { useSEO } from "@/hooks/useSEO";
import { openUpgrade } from "@/lib/upgrade";
import { Check, Mail } from "lucide-react";
import { reaisExatos, num } from "@shared/formato";
import { COTA_GRATIS_MENSAL, CONSOME_COTA } from "@shared/planos";

const CONTATO = "contato.jlbanalytics@gmail.com";

/** "a, b e c" — o "e" antes do último item, como se escreve em português. */
function listar(itens: readonly string[]): string {
  if (itens.length < 2) return itens[0] ?? "";
  return `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`;
}

/**
 * O que a conta gratuita já dá.
 *
 * Esta lista é o argumento da página, e por isso ela é uma LISTA e não uma
 * coluna de tabela: uma coluna de tiques ao lado de outra coluna de tiques
 * iguais convida a comparar duas coisas que são a mesma.
 */
const NO_GRATIS = [
  "Mercados ao vivo do Polymarket, da Kalshi e do Manifold",
  "Os cinco níveis da trilha, com todas as calculadoras",
  "O Track Record auditável, inclusive os erros",
  "A Banca Simulada, com dinheiro fictício em mercado real",
  "Registrar previsões e medir a sua calibração ao longo do tempo",
  "Histórico sincronizado entre os seus aparelhos",
];

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
        compacto
        title="Quase tudo aqui é grátis"
        subtitle="A trilha educacional inteira, o Track Record e a Banca Simulada não custam nada — e vão continuar assim. O Premium muda uma coisa só."
      />

      <div className="container py-10">
        <div className="max-w-3xl">

        {/* ── O QUE É GRÁTIS ─────────────────────────────────────────────── */}
        <AnimatedSection>
          <section className="mb-12">
            <h2 className="text-lg font-display font-semibold text-[var(--titulo)] mb-4">
              Sem pagar nada, sem cartão, sem período de teste
            </h2>
            <ul className="space-y-2.5">
              {NO_GRATIS.map((item) => (
                <li key={item} className="flex items-start gap-3 text-[0.9375rem] text-foreground/90 leading-snug">
                  <Check className="w-4 h-4 text-positive shrink-0 mt-0.5" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
            <p className="text-sm text-muted-foreground mt-5 max-w-xl leading-relaxed">
              A conta gratuita existe para você medir a própria calibração, não para provar o produto
              por sete dias. Nada aqui vira cobrança sozinho.
            </p>
            <Link href="/login"
              className="alvo-toque inline-flex items-center gap-2 mt-5 px-4 py-2 rounded-lg border border-border/50 text-sm font-medium text-foreground hover:border-primary/50 transition-colors">
              Criar conta grátis
            </Link>
          </section>
        </AnimatedSection>

        {/* ── A ÚNICA DIFERENÇA ──────────────────────────────────────────── */}
        <AnimatedSection>
          <section className="mb-12 border-y border-border/40 py-10">
            <h2 className="text-lg font-display font-semibold text-[var(--titulo)] mb-1">
              O que o Premium muda
            </h2>
            <p className="text-sm text-muted-foreground mb-7 max-w-xl">
              Uma coisa: quantas análises de IA você pode pedir por mês. É a parte que custa dinheiro
              de verdade para rodar.
            </p>

            {/* Os dois números frente a frente — a mesma leitura do placar do
                Track Record. Quando a comparação é de UM item, ela merece ser
                uma imagem, e não uma linha de tabela. */}
            <div className="flex items-end gap-10 sm:gap-16 flex-wrap">
              <div>
                <p className="font-mono font-semibold tabular-nums text-foreground leading-[0.85] text-[3rem] sm:text-[4rem]">
                  {num(COTA_GRATIS_MENSAL)}
                </p>
                <p className="text-sm text-muted-foreground mt-3">análises por mês, na conta grátis</p>
              </div>

              <div>
                {/* O ∞ nasce oticamente menor que um algarismo no mesmo corpo, e
                    mais alto na caixa. Os ajustes existem para os dois pousarem
                    na mesma linha de base e pesarem igual — são o mesmo dado. */}
                <p className="font-mono font-semibold text-gold leading-[0.85] text-[3.75rem] sm:text-[5rem] -mb-[0.4rem] sm:-mb-[0.55rem]">
                  ∞
                </p>
                <p className="text-sm text-muted-foreground mt-3">no Premium</p>
              </div>
            </div>

            <p className="text-sm text-muted-foreground mt-7 max-w-xl leading-relaxed">
              A cota vale para tudo que usa IA: {listar(CONSOME_COTA)}. Enquanto ela não acaba, as
              duas contas são idênticas.
            </p>
          </section>
        </AnimatedSection>

        {/* ── O QUE O PREMIUM NÃO É ──────────────────────────────────────────
            Esta seção é uma RESSALVA, e por isso não usa o mesmo título
            dourado das outras: quatro blocos com tratamento idêntico foi
            exatamente o defeito que a auditoria apontou no Track Record. A
            régua à esquerda é a mesma forma que o site já usa para "leia isto
            antes de acreditar em nós" — a forma diz o que o texto é antes de
            alguém começar a ler. */}
        <AnimatedSection>
          <section className="mb-12 border-l-2 border-border pl-5">
            <h2 className="text-sm font-semibold text-foreground mb-2">
              O que o Premium não é
            </h2>
            <p className="text-[0.9375rem] text-muted-foreground leading-relaxed">
              Não existe versão paga que preveja melhor. A IA é a mesma, o Track Record é o mesmo, e
              os erros dela aparecem para quem paga e para quem não paga — estão publicados na{" "}
              <Link href="/track-record" className="text-gold hover:underline">mesma página pública</Link>,
              inclusive a parte em que perdemos do mercado. O Premium tira o limite de quantas análises
              você pede por mês, e nada além disso. Se alguém prometer retorno garantido em mercado
              preditivo, incluindo nós, é hora de desconfiar.
            </p>
          </section>
        </AnimatedSection>

        {/* ── O PREÇO ────────────────────────────────────────────────────── */}
        <AnimatedSection>
          <section className="rounded-2xl border border-gold/25 bg-gold/[0.03] p-6 sm:p-8">
            {preco !== null ? (
              <>
                <p className="font-mono font-semibold tabular-nums text-foreground leading-none text-[2.5rem]">
                  {reaisExatos(preco)}<span className="text-base text-muted-foreground font-sans"> por mês</span>
                </p>
                <p className="text-sm text-muted-foreground mt-3 mb-5 max-w-xl">
                  Cancelamento a qualquer momento, pelo próprio painel. Sem fidelidade e sem multa.
                </p>
                <button
                  onClick={() => openUpgrade({ reason: "manual" })}
                  className="alvo-toque inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity">
                  Assinar Premium
                </button>
              </>
            ) : (
              <>
                {/* Sem preço definido, a página diz isso — e não inventa número.
                    É a mesma regra que aplicamos aos dados do site. */}
                <p className="text-2xl font-display font-semibold text-foreground leading-tight">
                  O preço ainda não está fechado
                </p>
                <p className="text-sm text-muted-foreground mt-3 mb-5 max-w-xl leading-relaxed">
                  Preferimos deixar esta página sem número a publicar um que vai mudar — é a mesma
                  regra que aplicamos a todo dado daqui. Deixe o seu e-mail e avisamos quando abrir.
                </p>
                <a href={`mailto:${CONTATO}?subject=Interesse%20no%20JLB%20Premium`}
                  className="alvo-toque inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-gold/40 bg-gold/10 text-sm font-semibold text-gold hover:bg-gold/20 transition-colors">
                  <Mail className="w-4 h-4" aria-hidden="true" /> Avise-me quando abrir
                </a>
              </>
            )}
          </section>
        </AnimatedSection>
        </div>
      </div>
    </div>
  );
}
