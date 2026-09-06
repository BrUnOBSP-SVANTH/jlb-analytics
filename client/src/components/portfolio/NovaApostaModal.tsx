/**
 * NovaApostaModal — escolher mercado real, lado e valor, vendo ANTES quanto se
 * ganha se acertar e quanto se perde se errar.
 *
 * A decisão que manda nesta tela: o preço de entrada é o do MERCADO, não um
 * número que o usuário arrasta. O modal antigo tinha um slider de "probabilidade
 * de entrada" — dava para comprar a 20% um mercado negociado a 80%, uma compra
 * que não existiria em lugar nenhum. O palpite do usuário continua aqui, mas no
 * lugar certo: comparado ao preço, mostrando se a aposta faz sentido.
 */
import { useState, useEffect, useMemo } from "react";
import { Plus, RefreshCw, TrendingUp, TrendingDown, Search } from "lucide-react";
import AnimatedSection from "@/components/AnimatedSection";
import { Termo } from "@/components/Termo";
import { casaBusca } from "@/lib/marketSearch";
import { carregarMercados, type MercadoBanca } from "@/lib/banca";
import {
  retornoSeAcertar, lucroSeAcertar, precoDoLado, oddsDecimais,
  validarAposta, reais, APOSTA_MINIMA, type Lado,
} from "@shared/banca";

const VALORES_RAPIDOS = [25, 50, 100, 250];

export function NovaApostaModal({
  disponivel,
  onApostar,
  onClose,
}: {
  disponivel: number;
  onApostar: (mercado: MercadoBanca, lado: Lado, valor: number) => void;
  onClose: () => void;
}) {
  const [mercados, setMercados] = useState<MercadoBanca[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [escolhido, setEscolhido] = useState<MercadoBanca | null>(null);
  const [lado, setLado] = useState<Lado>("sim");
  const [valor, setValor] = useState(50);

  useEffect(() => {
    let vivo = true;
    carregarMercados()
      .then((ms) => { if (vivo) { setMercados(ms); setCarregando(false); } })
      .catch(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, []);

  const filtrados = useMemo(
    () => mercados.filter((m) => casaBusca(m.titulo, busca, m.categoria)).slice(0, 25),
    [mercados, busca],
  );

  // A conta que o usuário veio ver. Roda a cada tecla: o número é a resposta,
  // não um relatório que aparece depois de confirmar.
  const conta = useMemo(() => {
    if (!escolhido) return null;
    const aposta = { lado, precoEntrada: escolhido.probSim, valor };
    return {
      preco: precoDoLado(lado, escolhido.probSim),
      retorno: retornoSeAcertar(aposta),
      lucro: lucroSeAcertar(aposta),
      perda: valor,
      odds: oddsDecimais(aposta),
      validacao: validarAposta(valor, escolhido.probSim, lado, disponivel),
    };
  }, [escolhido, lado, valor, disponivel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm px-4">
      <AnimatedSection>
        <div className="w-full max-w-lg glass-card rounded-2xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-[var(--titulo)] flex items-center gap-2">
              <Plus className="w-4 h-4 text-primary" /> Nova aposta simulada
            </h2>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors text-sm" aria-label="Fechar">✕</button>
          </div>

          <p className="text-xs text-muted-foreground">
            Banca disponível: <span className="font-mono font-bold text-foreground">{reais(disponivel)}</span>
          </p>

          {/* ── Escolher o mercado ── */}
          {carregando ? (
            <div className="text-xs text-muted-foreground flex items-center gap-2 py-4">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Carregando os mercados ao vivo…
            </div>
          ) : escolhido ? (
            <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 text-xs">
              <p className="font-medium text-foreground line-clamp-2">{escolhido.titulo}</p>
              <p className="text-muted-foreground mt-1">
                {escolhido.fonte === "polymarket" ? "Polymarket" : "Kalshi"} · o mercado dá{" "}
                <span className="font-mono font-bold text-foreground">{Math.round(escolhido.probSim * 100)}%</span> de chance para SIM
              </p>
              <button onClick={() => setEscolhido(null)} className="text-[10px] text-muted-foreground/60 hover:text-muted-foreground mt-1">
                Trocar mercado
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
                <input
                  type="text" placeholder="Buscar mercado (em português ou inglês)…" value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-lg text-xs bg-secondary/30 border border-border/30 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40"
                />
              </div>
              <div className="max-h-48 overflow-y-auto space-y-0.5">
                {filtrados.map((m) => (
                  <button key={m.id} onClick={() => { setEscolhido(m); setLado("sim"); }}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-secondary/40 transition-colors text-xs text-foreground flex items-center gap-2">
                    <span className="text-muted-foreground font-mono tabular-nums shrink-0 w-9">{Math.round(m.probSim * 100)}%</span>
                    <span className="line-clamp-1">{m.titulo}</span>
                  </button>
                ))}
                {filtrados.length === 0 && (
                  <p className="text-xs text-muted-foreground px-3 py-2">Nenhum mercado com esse termo.</p>
                )}
              </div>
            </div>
          )}

          {escolhido && conta && (
            <>
              {/* ── Escolher o lado ── */}
              <div className="space-y-1.5">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">No que você aposta?</p>
                <div className="flex gap-2">
                  {(["sim", "nao"] as const).map((l) => {
                    const preco = precoDoLado(l, escolhido.probSim);
                    const ativo = lado === l;
                    return (
                      <button key={l} onClick={() => setLado(l)}
                        className={`flex-1 py-2.5 rounded-lg border transition-colors ${
                          ativo
                            ? l === "sim" ? "bg-positive/15 border-positive/40 text-positive" : "bg-negative/15 border-negative/40 text-negative"
                            : "border-border/30 text-muted-foreground hover:text-foreground"
                        }`}>
                        <span className="text-xs font-semibold flex items-center justify-center gap-1">
                          {l === "sim" ? <><TrendingUp className="w-3.5 h-3.5" /> VAI ACONTECER</> : <><TrendingDown className="w-3.5 h-3.5" /> NÃO VAI</>}
                        </span>
                        <span className="block text-[10px] font-mono mt-0.5 opacity-80">
                          cota a {reais(preco)}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-muted-foreground leading-snug">
                  Cada cota paga R$ 1 se você acertar. Quanto mais barata a cota, menos gente acredita
                  naquele lado — e mais ela paga.
                </p>
              </div>

              {/* ── Quanto apostar ── */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>Quanto você aposta</span>
                  <span className="font-mono font-bold text-foreground">{reais(valor)}</span>
                </div>
                <input
                  type="range" min={APOSTA_MINIMA} max={Math.max(APOSTA_MINIMA, Math.floor(disponivel))} step={1}
                  value={Math.min(valor, Math.max(APOSTA_MINIMA, Math.floor(disponivel)))}
                  onChange={(e) => setValor(Number(e.target.value))}
                  className="w-full h-1.5 accent-primary"
                  aria-label="Valor da aposta"
                />
                <div className="flex gap-2 flex-wrap">
                  {VALORES_RAPIDOS.filter((v) => v <= disponivel).map((v) => (
                    <button key={v} onClick={() => setValor(v)}
                      className="px-2 py-0.5 rounded text-[10px] border border-border/30 text-muted-foreground hover:text-foreground transition-colors">
                      {reais(v)}
                    </button>
                  ))}
                  {disponivel >= APOSTA_MINIMA && (
                    <button onClick={() => setValor(Math.floor(disponivel))}
                      className="px-2 py-0.5 rounded text-[10px] border border-border/30 text-muted-foreground hover:text-foreground transition-colors">
                      tudo
                    </button>
                  )}
                </div>
              </div>

              {/* ── A resposta: ganho e perda, lado a lado ── */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl border border-positive/25 bg-positive/5">
                  <p className="text-[10px] text-positive/80 uppercase tracking-wider mb-1">Se você acertar</p>
                  <p className="text-lg font-mono font-bold text-positive tabular-nums">{reais(conta.retorno)}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    lucro de {reais(conta.lucro)} · paga {conta.odds.toFixed(2)}×
                  </p>
                </div>
                <div className="p-3 rounded-xl border border-negative/25 bg-negative/5">
                  <p className="text-[10px] text-negative/80 uppercase tracking-wider mb-1">Se você errar</p>
                  <p className="text-lg font-mono font-bold text-negative tabular-nums">−{reais(conta.perda)}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    perde tudo que apostou
                  </p>
                </div>
              </div>

              <p className="text-[10px] text-muted-foreground leading-snug">
                Para essa aposta valer a pena no longo prazo, você precisa acreditar que a chance real é
                maior que {Math.round(conta.preco * 100)}%. É isso que chamamos de{" "}
                <Termo nome="Edge">vantagem</Termo>.
              </p>

              {!conta.validacao.ok && (
                <p className="text-[11px] text-negative bg-negative/10 border border-negative/20 rounded-lg px-3 py-2">
                  {conta.validacao.motivo}
                </p>
              )}

              <button
                onClick={() => onApostar(escolhido, lado, valor)}
                disabled={!conta.validacao.ok}
                className="w-full py-2.5 rounded-lg text-sm font-semibold bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed">
                Apostar {reais(valor)} em {lado === "sim" ? "VAI ACONTECER" : "NÃO VAI ACONTECER"}
              </button>
            </>
          )}
        </div>
      </AnimatedSection>
    </div>
  );
}
