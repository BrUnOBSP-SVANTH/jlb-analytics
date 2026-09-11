/**
 * PageHeader — JLB Analytics
 * Visual único: grade de probabilidade + badge contextual + gradiente direcional.
 * A grade (0% → 25% → 50% → 75% → 100%) reforça que probabilidade é a unidade
 * fundamental da plataforma — não preço, não retorno.
 *
 * Animações em CSS puro (tw-animate-css + transition) — sem framer-motion.
 */

interface Props {
  title: string;
  subtitle?: string;
  badge?: string;
  image?: string;
  /** Valor 0-100 que acende o indicador na grade. Opcional. */
  probability?: number;
  /**
   * Versão enxuta, para TELA DE TRABALHO (DSH-07).
   *
   * A auditoria apontou "hero de marketing dentro de uma tela de aplicação": o
   * Dashboard, que a pessoa abre para consultar os próprios números, começava
   * com o mesmo tratamento de uma landing page — 56px de respiro vertical e uma
   * grade decorativa antes de qualquer dado. Numa tela de conversão isso
   * convida; numa de trabalho, atrasa.
   *
   * A grade sai (é enfeite, e o `aria-hidden` já dizia isso) e o respiro cai
   * pela metade. O título e o badge continuam iguais.
   */
  compacto?: boolean;
}

export default function PageHeader({ title, subtitle, badge, image, probability, compacto = false }: Props) {
  return (
    <section className="relative overflow-hidden border-b border-border/20">
      {/* Background image */}
      {image && (
        <div className="absolute inset-0">
          <img src={image} alt="" className="w-full h-full object-cover opacity-10" />
          <div className="absolute inset-0 bg-gradient-to-r from-background via-background/90 to-background/60" />
        </div>
      )}

      {/* Probability grid — linhas verticais a cada 25% */}
      {!compacto && (
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        {[25, 50, 75].map((pct) => (
          <div
            key={pct}
            className="absolute top-0 bottom-0 w-px bg-gold/8"
            style={{ left: `${pct}%` }}
          />
        ))}
        {/* Labels da grade — apenas no fundo, ultra-suaves */}
        {[0, 25, 50, 75, 100].map((pct) => (
          <span
            key={pct}
            className="absolute bottom-2 font-mono text-[11px] text-gold/20 select-none"
            style={{
              left: `${pct}%`,
              // Pontas alinhadas para dentro — centralizar em 0%/100% cortava metade do texto
              transform: pct === 0 ? "translateX(6px)" : pct === 100 ? "translateX(calc(-100% - 6px))" : "translateX(-50%)",
            }}
          >
            {pct}%
          </span>
        ))}
        {/* Indicador de probabilidade (opcional) — transição suave no left (era spring) */}
        {probability !== undefined && (
          <div
            className="absolute top-0 bottom-6 w-0.5 bg-gold/50 transition-[left] duration-700 ease-out"
            style={{ left: `${probability}%` }}
          >
            <span className="absolute -top-0 left-1 font-mono text-[11px] text-gold/70 whitespace-nowrap">
              {probability}%
            </span>
          </div>
        )}
      </div>
      )}

      {/* Thin gold top accent line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold/40 to-transparent" />

      <div className={`container relative ${compacto ? "py-6 md:py-7" : "py-10 md:py-14"}`}>
        <div className="max-w-3xl">
          {badge && (
            <div
              className="inline-flex items-center gap-1.5 mb-4 animate-in fade-in slide-in-from-bottom-2 duration-500"
              style={{ animationFillMode: "backwards" }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse" />
              <span className="text-[11px] font-semibold text-gold/80 uppercase tracking-[0.2em]">
                {badge}
              </span>
            </div>
          )}

          <h1
            className="text-3xl md:text-[2.6rem] font-display font-bold leading-tight animate-in fade-in slide-in-from-bottom-4 duration-500"
            style={{ animationDelay: "80ms", animationFillMode: "backwards" }}
          >
            {/*
              A primeira palavra sai em dourado — é a assinatura dos títulos da
              casa. O que faltava era a exceção: em "O que é grátis, e o que o
              Premium acrescenta" a primeira palavra é a LETRA "O", e a tela
              mostrava um O dourado gigante sozinho antes do resto em branco.

              A regra passa a ser por TAMANHO e não por contagem de palavras:
              o dourado pega palavras até juntar um pedaço que se sustente
              sozinho. Artigo e preposição nunca ficam pendurados.
            */}
            {(() => {
              const palavras = title.split(" ");
              let corte = 1;
              while (corte < palavras.length && palavras.slice(0, corte).join(" ").length < 4) corte++;
              const destaque = palavras.slice(0, corte).join(" ");
              const resto = palavras.slice(corte).join(" ");
              return (
                <>
                  <span className="text-gradient-gold">{destaque}</span>
                  {resto && <span className="text-foreground"> {resto}</span>}
                </>
              );
            })()}
          </h1>

          {subtitle && (
            <p
              className="mt-3 text-muted-foreground max-w-2xl text-sm md:text-base leading-relaxed animate-in fade-in slide-in-from-bottom-4 duration-500"
              style={{ animationDelay: "160ms", animationFillMode: "backwards" }}
            >
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {/* Bottom fade */}
      <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-background to-transparent pointer-events-none" />
    </section>
  );
}
