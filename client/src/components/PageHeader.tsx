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
}

export default function PageHeader({ title, subtitle, badge, image, probability }: Props) {
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
            className="absolute bottom-2 font-mono text-[9px] text-gold/20 select-none"
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
            <span className="absolute -top-0 left-1 font-mono text-[10px] text-gold/70 whitespace-nowrap">
              {probability}%
            </span>
          </div>
        )}
      </div>

      {/* Thin gold top accent line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold/40 to-transparent" />

      <div className="container relative py-10 md:py-14">
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
            {/* Split title into two gradients: first word gold, rest white */}
            {(() => {
              const words = title.split(" ");
              return (
                <>
                  <span className="text-gradient-gold">{words[0]}</span>
                  {words.length > 1 && (
                    <span className="text-foreground"> {words.slice(1).join(" ")}</span>
                  )}
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
