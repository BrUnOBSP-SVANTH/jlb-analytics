/**
 * Termo — mostra a palavra técnica com a explicação a um toque de distância.
 *
 * DECISÃO DE DESENHO. O caminho óbvio seria trocar "Brier" por "nota das
 * previsões" em todo lugar. Não fizemos: o termo exato é parte do produto — um
 * site que promete rigor não pode fugir do vocabulário do rigor. O problema nunca
 * foi a palavra existir, foi ela aparecer sem tradução, 1.300 vezes.
 *
 * ⚠️ Abre por CLIQUE/TOQUE, não por hover. O público é brasileiro e majoritariamente
 * de celular, e em tela de toque o hover simplesmente não existe — uma explicação
 * que só aparece com mouse não chega em quem mais precisa dela.
 *
 * O sublinhado pontilhado é o convite: sinaliza "isto tem explicação" sem poluir
 * a leitura de quem já sabe o que é.
 */
import { useState, useRef, useEffect } from "react";
import { buscarVerbete } from "@/lib/glossario";

export function Termo({ nome, children }: { nome: string; children?: React.ReactNode }) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLSpanElement>(null);
  const verbete = buscarVerbete(nome);

  // Fecha ao clicar fora ou apertar Esc — comportamento esperado de qualquer
  // camada flutuante; sem isso ela fica presa na tela do celular.
  useEffect(() => {
    if (!aberto) return;
    const foraDaCaixa = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAberto(false); };
    document.addEventListener("mousedown", foraDaCaixa);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", foraDaCaixa);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  // Termo sem verbete escrito ainda: renderiza normal, sem sublinhado nem promessa
  // de explicação que não existe.
  if (!verbete) return <>{children ?? nome}</>;

  return (
    <span className="relative inline-block" ref={caixa}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        aria-label={`O que significa ${verbete.termo}`}
        className="underline decoration-dotted decoration-from-font underline-offset-2
                   decoration-muted-foreground/60 hover:decoration-gold
                   focus:outline-none focus-visible:ring-1 focus-visible:ring-gold rounded-sm
                   cursor-help transition-colors"
      >
        {children ?? nome}
      </button>

      {aberto && (
        <span
          role="tooltip"
          className="absolute z-50 left-0 top-full mt-1.5 w-[min(19rem,80vw)]
                     rounded-lg border border-border/60 bg-popover shadow-lg p-3 text-left
                     font-normal normal-case tracking-normal"
        >
          <span className="block text-xs font-semibold text-foreground mb-1">{verbete.termo}</span>
          <span className="block text-xs text-muted-foreground leading-relaxed">{verbete.simples}</span>
          {verbete.tecnico && (
            <span className="block mt-2 pt-2 border-t border-border/40 text-[11px] text-muted-foreground/70 leading-relaxed">
              <span className="font-medium">Definição técnica:</span> {verbete.tecnico}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
