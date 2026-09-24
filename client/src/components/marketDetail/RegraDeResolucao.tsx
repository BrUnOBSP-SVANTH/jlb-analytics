/**
 * Como este mercado resolve — a regra que a PLATAFORMA publica.
 *
 * O QUE FALTAVA (Auditoria 21/09, UXP-02). A tela mostrava preço, prazo,
 * volume, histórico e análise de IA, e não mostrava o que decide o resultado.
 * É a informação que separa a aposta que a pessoa acha que está fazendo da que
 * realmente existe:
 *
 *  · "Xi Jinping deixa o poder" resolve por REMOÇÃO do cargo num intervalo de
 *    datas — não por renúncia anunciada, não por perda de influência;
 *  · no Kalshi, jogo adiado que começa em até 48h continua valendo; passou
 *    disso, o mercado cancela e devolve. Quem não leu acha que "adiou, perdi".
 *
 * Num site que existe para ensinar a ler probabilidade, esconder a regra é
 * esconder metade da conta.
 *
 * ⚠️ FICA EM INGLÊS, e de propósito. O texto é da plataforma e é ele que vale
 * juridicamente na liquidação; tradução automática de cláusula é onde um "if"
 * vira um "quando" e muda o que a pessoa entende que comprou. O aviso diz de
 * quem é o texto, e o link leva ao original.
 */
import { useEffect, useState } from "react";
import { ScrollText, ExternalLink } from "lucide-react";
import { buscarJson } from "@/lib/api";
import { nomeDaPlataforma } from "@shared/plataforma";

interface Regra {
  regra: string | null;
  /** Kalshi publica em duas partes; a segunda trata do que dá errado. */
  regraSecundaria?: string | null;
  /** Polymarket às vezes aponta a fonte oficial do resultado. */
  fonteDaRegra?: string | null;
}

export function RegraDeResolucao({ source, rawId, externalUrl }: {
  source: string;
  rawId: string;
  externalUrl?: string;
}) {
  const [dado, setDado] = useState<Regra | null>(null);

  useEffect(() => {
    if (!rawId || (source !== "polymarket" && source !== "kalshi")) return;
    let vivo = true;
    // `buscarJson` e não `fetch`: dedup de requisição em voo e cache curto — a
    // regra não muda durante a visita.
    void buscarJson<Regra>(`/api/${source}/regra/${encodeURIComponent(rawId)}`)
      .then((d) => { if (vivo) setDado(d); })
      .catch(() => { /* a fonte não respondeu: a seção não aparece */ });
    return () => { vivo = false; };
  }, [source, rawId]);

  if (!dado?.regra) return null;
  const plataforma = nomeDaPlataforma(source) ?? "plataforma";

  return (
    <div className="glass-card rounded-xl p-6 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-[var(--titulo)] flex items-center gap-2">
          <ScrollText className="w-4 h-4 text-neon-blue" />
          Como este mercado resolve
        </h2>
        {externalUrl && (
          <a href={externalUrl} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors shrink-0">
            Original no {plataforma}
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground">
        Texto do {plataforma}, em inglês. É ele que vale na liquidação — por isso
        não traduzimos.
      </p>

      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground whitespace-pre-line" data-fonte="externa">
        <p>{dado.regra}</p>
        {dado.regraSecundaria && (
          <div className="pt-3 border-t border-border/20">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground/70 mb-1">
              Se algo sair do previsto
            </p>
            <p>{dado.regraSecundaria}</p>
          </div>
        )}
      </div>

      {dado.fonteDaRegra && (
        <p className="text-[11px] text-muted-foreground">
          Resultado oficial em{" "}
          <a href={dado.fonteDaRegra} target="_blank" rel="noopener noreferrer"
            className="text-gold hover:underline break-all">{dado.fonteDaRegra}</a>
        </p>
      )}
    </div>
  );
}
