/**
 * ApostaCard — uma aposta da banca.
 *
 * Duas caras, porque são dois momentos diferentes da mesma aposta:
 *  • ABERTA  → o que ainda pode acontecer: quanto paga se acertar, quanto se
 *    perde se errar, e quanto ela vale agora ao preço de mercado.
 *  • FECHADA → o que aconteceu de verdade, e de onde veio esse veredito. A
 *    procedência importa: o número não é chute nosso, é a liquidação oficial da
 *    plataforma que pagaria a aposta se ela fosse real.
 */
import { useState } from "react";
import { ExternalLink, Trash2, CheckCircle2, XCircle, Clock } from "lucide-react";
import AnimatedSection from "@/components/AnimatedSection";
import type { ApostaBanca } from "@/lib/banca";
import { retornoSeAcertar, lucroSeAcertar, valorDeMercado, precoDoLado, reais } from "@shared/banca";

const FONTE_LABEL: Record<string, string> = {
  kalshi_result: "liquidação oficial da Kalshi",
  polymarket_uma: "oráculo UMA do Polymarket",
};

export function ApostaCard({ a, onCancelar }: { a: ApostaBanca; onCancelar: (id: string) => void }) {
  const [confirmando, setConfirmando] = useState(false);

  const precoEntrada = precoDoLado(a.lado, a.precoEntrada);
  const acertou = a.resolvido ? (a.lado === "sim") === a.desfecho : null;
  const lucroFechado = a.pago !== null ? a.pago - a.valor : null;
  const valorHoje = valorDeMercado(a);
  const variacao = a.precoAtual !== undefined ? valorHoje - a.valor : null;

  const corResultado = acertou === null ? "text-muted-foreground" : acertou ? "text-positive" : "text-negative";

  return (
    <AnimatedSection>
      <div className={`glass-card rounded-xl p-5 transition-colors ${
        a.resolvido ? "opacity-95" : "hover:border-primary/20"
      }`}>
        {/* Cabeçalho: lado, pergunta, link para o mercado real */}
        <div className="flex items-start gap-3 mb-3">
          <div className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
            a.lado === "sim" ? "border-positive/30 bg-positive/10 text-positive" : "border-negative/30 bg-negative/10 text-negative"
          }`}>
            {a.lado === "sim" ? "SIM" : "NÃO"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground leading-snug line-clamp-2 mb-1">{a.pergunta}</p>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground flex-wrap">
              <span className={`px-1.5 py-0.5 rounded-full border ${
                a.fonte === "polymarket" ? "border-neon-blue/30 text-neon-blue" : "border-green-500/30 text-green-400"
              }`}>{a.fonte === "polymarket" ? "Polymarket" : "Kalshi"}</span>
              <span>{new Date(a.criadaEm).toLocaleDateString("pt-BR")}</span>
              <span className="font-mono">{reais(a.valor)} a {reais(precoEntrada)} por cota</span>
            </div>
          </div>
          {a.urlExterna && (
            <a href={a.urlExterna} target="_blank" rel="noopener noreferrer"
              className="text-muted-foreground/40 hover:text-primary transition-colors" aria-label="Abrir o mercado real">
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>

        {a.resolvido ? (
          /* ── Fechada: o que aconteceu ── */
          <div className="pt-3 border-t border-border/20 space-y-2">
            <div className="flex items-center justify-between">
              <span className={`flex items-center gap-1.5 text-xs font-semibold ${corResultado}`}>
                {acertou ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                {acertou ? "Você acertou" : "Você errou"} — deu {a.desfecho ? "SIM" : "NÃO"}
              </span>
              <span className={`text-base font-mono font-bold tabular-nums ${corResultado}`}>
                {lucroFechado !== null && (lucroFechado >= 0 ? "+" : "−")}{reais(Math.abs(lucroFechado ?? 0))}
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Voltou {reais(a.pago ?? 0)} para a banca
              {a.fonteResolucao && FONTE_LABEL[a.fonteResolucao] ? ` · resultado pela ${FONTE_LABEL[a.fonteResolucao]}` : ""}
              {a.liquidadaEm ? ` · ${new Date(a.liquidadaEm).toLocaleDateString("pt-BR")}` : ""}
            </p>
          </div>
        ) : (
          /* ── Aberta: o que ainda pode acontecer ── */
          <div className="pt-3 border-t border-border/20 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[9px] text-positive/80 uppercase tracking-wider mb-0.5">Se acertar</p>
                <p className="text-sm font-mono font-bold text-positive tabular-nums">{reais(retornoSeAcertar(a))}</p>
                <p className="text-[9px] text-muted-foreground">lucro de {reais(lucroSeAcertar(a))}</p>
              </div>
              <div>
                <p className="text-[9px] text-negative/80 uppercase tracking-wider mb-0.5">Se errar</p>
                <p className="text-sm font-mono font-bold text-negative tabular-nums">−{reais(a.valor)}</p>
                <p className="text-[9px] text-muted-foreground">perde o que apostou</p>
              </div>
            </div>

            <div className="flex items-center justify-between text-[10px]">
              <span className="text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {a.precoAtual !== undefined ? (
                  <>Vale {reais(valorHoje)} agora ({Math.round(precoDoLado(a.lado, a.precoAtual) * 100)}% de chance)</>
                ) : (
                  <>Aguardando o resultado oficial</>
                )}
              </span>
              {variacao !== null && Math.abs(variacao) >= 0.01 && (
                <span className={`font-mono ${variacao > 0 ? "text-positive" : "text-negative"}`}>
                  {variacao > 0 ? "+" : "−"}{reais(Math.abs(variacao))}
                </span>
              )}
            </div>

            <div className="flex justify-end">
              {confirmando ? (
                <div className="flex items-center gap-1">
                  <button onClick={() => onCancelar(a.id)}
                    className="text-[10px] px-2 py-1 rounded bg-negative/15 border border-negative/30 text-negative hover:bg-negative/25 transition-colors">
                    Cancelar e devolver {reais(a.valor)}
                  </button>
                  <button onClick={() => setConfirmando(false)}
                    className="text-[10px] px-2 py-1 rounded border border-border/30 text-muted-foreground hover:text-foreground transition-colors">
                    Voltar
                  </button>
                </div>
              ) : (
                <button onClick={() => setConfirmando(true)}
                  className="p-1.5 rounded text-muted-foreground/40 hover:text-negative hover:bg-negative/10 transition-colors"
                  aria-label="Cancelar aposta">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </AnimatedSection>
  );
}
