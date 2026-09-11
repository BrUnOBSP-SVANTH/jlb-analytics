/**
 * AmostraHonesta — responde à objeção mais justa que um leitor pode ter:
 * "vocês não mostram só as previsões que acertaram?".
 *
 * O site publicava a taxa de acerto das resolvidas sem dizer quantas ainda estão
 * em aberto. Sem isso, o número mais honesto do mundo continua parecendo escolha
 * a dedo — e a desconfiança é razoável, não paranoia.
 *
 * Mostra as duas coisas que respondem de verdade: quantas ainda vão ser pontuadas
 * (quer ajudem, quer atrapalhem) e se as em aberto são tão difíceis quanto as já
 * resolvidas.
 */
import { useEffect, useState } from "react";
import { ClipboardList } from "lucide-react";
import { buscarJson } from "@/lib/api";
import { num } from "@shared/formato";

interface Dados {
  available: boolean;
  total?: number; resolvidos?: number; emAberto?: number;
  dificuldadeResolvidos?: number | null; dificuldadeAbertos?: number | null;
  perfilComparavel?: boolean | null;
}

export function AmostraHonesta() {
  const [d, setD] = useState<Dados | null>(null);

  useEffect(() => {
    let vivo = true;
    buscarJson<Dados>("/api/ai/sample-transparency")
      .then((j) => { if (vivo) setD(j); })
      .catch(() => { if (vivo) setD({ available: false }); });
    return () => { vivo = false; };
  }, []);

  if (!d?.available || !d.total) return null;
  const pct = Math.round(((d.resolvidos ?? 0) / d.total) * 100);

  return (
    <section>
      <h2 className="text-lg font-display font-semibold text-[var(--titulo)] mb-1">Mostramos só as que acertamos?</h2>
      <p className="text-xs text-muted-foreground leading-relaxed mb-4">
        Não — e aqui está como conferir. Registramos a previsão <strong className="text-foreground">antes</strong>{" "}
        de o mercado resolver e nunca reescrevemos o passado. As que ainda não resolveram vão entrar
        no placar quando resolverem, ajudando ou atrapalhando.
      </p>

      <div className="flex items-baseline gap-2 mb-1">
        <span className="font-mono text-2xl font-bold text-foreground tabular-nums">{num(d.resolvidos)}</span>
        <span className="text-xs text-muted-foreground">de {num(d.total)} previsões já foram pontuadas</span>
      </div>
      {/* A barra torna a proporção imediata: o pedaço claro é o que ainda vai contar. */}
      <div className="h-2 rounded-full bg-secondary/50 overflow-hidden mb-2">
        <div className="h-full bg-gold/60" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[11px] text-muted-foreground/80 mb-4">
        <strong className="text-foreground/90">{num(d.emAberto)}</strong> ainda em aberto, esperando o resultado oficial.
      </p>

      {d.perfilComparavel !== null && (
        <div className="rounded-lg border border-border/30 bg-secondary/10 p-3">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            <strong className="text-foreground/90">As que faltam são igualmente difíceis?</strong>{" "}
            {d.perfilComparavel ? (
              <>
                Sim. Medimos o quanto cada mercado já é “decidido” — um a 50% é uma moeda, um a 95% é
                quase certeza. As resolvidas ficam a {num(d.dificuldadeResolvidos, 1)} pontos do meio e as em
                aberto a {num(d.dificuldadeAbertos, 1)}. Perfis parecidos, ou seja, não resolveram só as fáceis.
              </>
            ) : (
              <>
                Não exatamente: as resolvidas ficam a {num(d.dificuldadeResolvidos, 1)} pontos do meio e as em
                aberto a {num(d.dificuldadeAbertos, 1)}. A diferença é grande o bastante para que o placar de
                hoje talvez não represente o conjunto todo — e preferimos avisar.
              </>
            )}
          </p>
        </div>
      )}
    </section>
  );
}
