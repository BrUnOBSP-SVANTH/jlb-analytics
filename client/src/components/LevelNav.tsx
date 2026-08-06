/**
 * LevelNav — rodapé de navegação da trilha educacional.
 * Fecha o buraco "trilha sem trilho": cada nível ganha um CTA claro para o
 * próximo, e o Nível 5 encerra com a ponte para virar forecaster (registrar
 * previsões e medir calibração). Antes cada nível era um beco sem saída.
 */
import { Link } from "wouter";
import { ArrowRight, ArrowLeft, GraduationCap, Target, LineChart } from "lucide-react";

const LEVELS: Record<number, { title: string; teaser: string }> = {
  1: { title: "Fundamentos", teaser: "Valor esperado, margem da casa e atualização bayesiana" },
  2: { title: "Leitura de Dados", teaser: "Correlação vs. causalidade, intervalo de confiança e anomalias" },
  3: { title: "Modelos Básicos", teaser: "Taylor, Poisson, GARCH, ENSO e Elo — o que cada um calcula e quando falha" },
  4: { title: "Vieses e Psicologia", teaser: "Prospect Theory, Brier/calibração, falácia do jogador e overconfidence" },
  5: { title: "Análise Integrada", teaser: "Quando o modelo diverge do mercado e ensemble ponderado por skill" },
};

export default function LevelNav({ current }: { current: number }) {
  const prev = current > 1 ? current - 1 : null;
  const next = current < 5 ? current + 1 : null;

  return (
    <nav aria-label="Navegação da trilha" className="pt-6 border-t border-border/30 space-y-4">
      {next && (
        <Link href={`/nivel/${next}`}>
          <div className="group glass-card rounded-xl p-5 flex items-center gap-4 cursor-pointer hover:border-primary/40 transition-colors">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <GraduationCap className="w-5 h-5 text-primary" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Próximo nível</p>
              <p className="text-sm font-semibold text-foreground">Nível {next}: {LEVELS[next].title}</p>
              <p className="text-xs text-muted-foreground line-clamp-1">{LEVELS[next].teaser}</p>
            </div>
            <ArrowRight className="w-5 h-5 text-primary shrink-0 group-hover:translate-x-1 transition-transform" aria-hidden="true" />
          </div>
        </Link>
      )}

      {current === 5 && (
        <div className="glass-card rounded-xl p-5 border border-gold/25 bg-gold/5">
          <div className="flex items-center gap-2 mb-1.5">
            <Target className="w-4 h-4 text-gold" aria-hidden="true" />
            <p className="text-sm font-semibold text-foreground">Trilha concluída. Agora vire forecaster.</p>
          </div>
          <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
            A teoria só vira habilidade quando você registra previsões e mede sua calibração
            (Brier Score) contra o mercado real. É assim que se descobre se você tem vantagem de verdade.
          </p>
          <div className="flex gap-2 flex-wrap">
            <Link href="/apostas">
              <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gold text-on-accent text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer">
                <Target className="w-3.5 h-3.5" aria-hidden="true" /> Fazer minha primeira previsão
              </span>
            </Link>
            <Link href="/dashboard">
              <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-secondary/50 border border-border/30 text-xs text-foreground hover:bg-secondary/70 transition-colors cursor-pointer">
                <LineChart className="w-3.5 h-3.5" aria-hidden="true" /> Ver meu Dashboard
              </span>
            </Link>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between text-xs">
        {prev ? (
          <Link href={`/nivel/${prev}`}>
            <span className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
              <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" /> Nível {prev}: {LEVELS[prev].title}
            </span>
          </Link>
        ) : (
          <span />
        )}
        <Link href="/educacao">
          <span className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
            Voltar à Trilha
          </span>
        </Link>
      </div>
    </nav>
  );
}
