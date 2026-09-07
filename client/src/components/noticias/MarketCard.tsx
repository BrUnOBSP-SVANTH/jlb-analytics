/**
 * MarketCard — card de mercado Polymarket + TrackForm (form de registrar previsao,
 * privado ao modulo). Extraido de pages/Noticias.tsx.
 */
import { useState } from "react";
import { Link } from "wouter";
import { Languages, ChevronUp, BookmarkPlus, Check, X as XIcon, ExternalLink, Zap, ArrowRight } from "lucide-react";
import { type PolyMarket, parseOutcomePrices, daysLeft, formatVolume } from "@/lib/noticiasShared";
import { CategoryBadge } from "@/components/noticias/cards";
import { ProbHero, ProbBar, ProbSparkline } from "@/components/mercados/cards";
import AnimatedSection from "@/components/AnimatedSection";
import { addPrediction, edge, kellyFraction, type StoredPrediction } from "@/lib/predictions";
import { awardPoints } from "@/lib/userProgress";
import { track } from "@/lib/analytics";

interface TrackFormProps {
  market: PolyMarket;
  marketProb: number;
  onSaved: (p: StoredPrediction) => void;
  onCancel: () => void;
}

function TrackForm({ market, marketProb, onSaved, onCancel }: TrackFormProps) {
  const [userProb, setUserProb] = useState(Math.round(marketProb));
  const e = edge(userProb, marketProb);
  const kf = kellyFraction(userProb, marketProb);
  const edgeColor = e > 3 ? "text-positive" : e < -3 ? "text-negative" : "text-muted-foreground";

  function handleSave() {
    const pred = addPrediction({
      marketId: market.id,
      question: market.question,
      marketProb,
      userProb,
    });
    awardPoints("prediction_made", `Previsão registrada: ${market.question.slice(0, 50)}`);
    track("prediction_registered", { source: "noticias_poly" });
    onSaved(pred);
  }

  return (
    <div className="mt-3 pt-3 border-t border-border/30 space-y-3">
      <p className="text-xs text-muted-foreground font-medium">Sua estimativa</p>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={1}
          max={99}
          value={userProb}
          onChange={(e) => setUserProb(parseInt(e.target.value))}
          className="flex-1 accent-gold"
          aria-label="Sua probabilidade estimada"
        />
        <span className="font-mono text-sm font-bold text-gold w-12 text-right">{userProb}%</span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="p-2 rounded-lg bg-secondary/30">
          <p className="text-[10px] text-muted-foreground">Mercado</p>
          <p className="font-mono text-xs font-semibold text-foreground">{marketProb.toFixed(1)}%</p>
        </div>
        <div className="p-2 rounded-lg bg-secondary/30">
          <p className="text-[10px] text-muted-foreground">Edge</p>
          <p className={`font-mono text-xs font-semibold ${edgeColor}`}>
            {e >= 0 ? "+" : ""}{e.toFixed(1)}pp
          </p>
        </div>
        <div className="p-2 rounded-lg bg-secondary/30">
          <p className="text-[10px] text-muted-foreground">Kelly</p>
          <p className="font-mono text-xs font-semibold text-gold">
            {kf > 0 ? `${(kf * 100).toFixed(1)}%` : "—"}
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-gold text-on-accent text-xs font-semibold hover:opacity-90 transition-opacity"
        >
          <Check className="w-3.5 h-3.5" />
          Registrar
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-2 rounded-lg border border-border/50 text-muted-foreground text-xs hover:text-foreground transition-colors"
          aria-label="Cancelar"
        >
          <XIcon className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ── Market card ────────────────────────────────────────────────────────────

interface MarketCardProps {
  market: PolyMarket;
  savedIds: Set<string>;
  onSaved: (p: StoredPrediction) => void;
  /** Badge "★ Destaque" — restrito aos poucos de maior volume; em todo card não destaca nada */
  highlight?: boolean;
  /** Posição na lista — escalona a entrada, como na aba Mercados Ao Vivo. */
  indice?: number;
}

export function MarketCard({ market, savedIds, onSaved, highlight = false, indice = 0 }: MarketCardProps) {
  const [tracking, setTracking] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [translation, setTranslation] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const prices = parseOutcomePrices(market.outcomePrices);
  const isSaved = savedIds.has(market.id);

  async function handleTranslate() {
    if (translation) { setTranslation(null); return; }
    setTranslating(true);
    try {
      const res = await fetch(`/api/translate?text=${encodeURIComponent(market.question)}`);
      const data = await res.json() as { translation?: string };
      setTranslation(data.translation ?? null);
    } catch { /* ignore */ } finally {
      setTranslating(false);
    }
  }

  function handleSaved(p: StoredPrediction) {
    setTracking(false);
    setJustSaved(true);
    onSaved(p);
    setTimeout(() => setJustSaved(false), 2000);
  }

  const pctSim = prices ? Math.round(prices.yes) : null;

  return (
    // Entrada escalonada e borda proporcional: o mesmo tratamento da aba
    // Mercados Ao Vivo. Duas telas mostrando o mesmo tipo de card com
    // comportamentos diferentes é o que faz um site parecer remendado.
    <AnimatedSection className="h-full" delay={Math.min(indice, 8) * 0.03}>
    <div className={`glass-card card-lift rounded-xl p-4 flex flex-col gap-3 h-full relative overflow-hidden ${
      isSaved || justSaved ? "border-gold/30 bg-gold/3" : ""
    }`}>
      {/* A PROBABILIDADE DESENHA O CARD: a borda de cima tem a largura da chance
          de SIM. Lendo a lista de relance, a distribuição aparece antes de
          qualquer número. */}
      {pctSim !== null && (
        <span
          aria-hidden="true"
          className={`absolute top-0 left-0 h-[2px] transition-[width] duration-700 ease-out ${
            pctSim >= 70 ? "bg-positive/70" : pctSim <= 30 ? "bg-negative/70" : "bg-primary/70"
          }`}
          style={{ width: `${Math.max(4, Math.min(100, pctSim))}%` }}
        />
      )}
      {/* Badges: categoria + destaque + tempo */}
      <div className="flex flex-wrap items-center gap-1">
        {highlight && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider border text-gold bg-gold/10 border-gold/20">
            ★ Destaque
          </span>
        )}
        <CategoryBadge category={market.category} />
        {(() => { const d = daysLeft(market.endDate); return d !== null ? (
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold border ${d <= 3 ? "text-negative bg-negative/10 border-negative/20" : "text-muted-foreground bg-secondary/40 border-border/20"}`}>
            {d === 0 ? "Encerra hoje" : `${d}d restantes`}
          </span>
        ) : null; })()}
        {market.weekPriceChange !== undefined && market.weekPriceChange !== 0 && (
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold border ${market.weekPriceChange > 0 ? "text-positive bg-positive/10 border-positive/20" : "text-negative bg-negative/10 border-negative/20"}`}>
            {market.weekPriceChange > 0 ? "▲" : "▼"} {Math.abs(market.weekPriceChange * 100).toFixed(1)}pp semana
          </span>
        )}
      </div>

      {/* Pergunta + probabilidade protagonista (mesmo padrão da tela de Apostas) */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/* Título clicável → tela de detalhe (coeso com a tela de Apostas) */}
          <Link href={`/apostas/poly-${market.id}`}>
            <p className="text-sm font-medium text-foreground leading-snug line-clamp-3 hover:text-gold transition-colors cursor-pointer">
              {market.question}
            </p>
          </Link>
          {translation && (
            <p className="text-xs text-gold/80 mt-1 leading-snug italic">{translation}</p>
          )}
          <button
            onClick={handleTranslate}
            disabled={translating}
            className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground hover:text-gold transition-colors disabled:opacity-50"
          >
            <Languages className="w-3 h-3" />
            {translating ? "Traduzindo..." : translation ? "Ocultar tradução" : "Traduzir"}
          </button>
        </div>
        {prices && <ProbHero prob={prices.yes / 100} />}
      </div>

      {/* Barra SIM/NÃO — a mesma linguagem visual do card de Apostas */}
      {prices ? (
        <div>
          <ProbBar prob={prices.yes / 100} />
          {/* O histórico de 7 dias, igual ao da aba Mercados Ao Vivo. Faltava
              aqui: a mesma pergunta aparecia nas duas telas, mas só numa delas
              dava para ver COMO o preço chegou onde chegou. */}
          {market.clobTokenIds && (
            <ProbSparkline tokenIds={market.clobTokenIds} marketId={`poly-${market.id}`} source="polymarket" />
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Sem dados de preço</p>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-1 border-t border-border/20">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Vol: <span className="font-mono text-foreground">{formatVolume(market.volume)}</span></span>
          {market.volume24hr != null && market.volume24hr > 0 && (
            <span className="text-[10px]">24h: <span className="font-mono text-foreground/70">{formatVolume(market.volume24hr)}</span></span>
          )}
          {market.liquidity != null && market.liquidity > 0 && (
            <span className="text-[10px]">Liq: <span className="font-mono text-foreground/70">{formatVolume(market.liquidity)}</span></span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {(isSaved || justSaved) && (
            <span className="text-[10px] text-gold/70 font-medium">Registrado</span>
          )}
          {!isSaved && !justSaved && prices && (
            <button
              onClick={() => setTracking((v) => !v)}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-colors ${
                tracking
                  ? "bg-gold/10 text-gold border border-gold/20"
                  : "text-muted-foreground hover:text-gold border border-transparent hover:border-gold/20"
              }`}
              aria-label="Registrar previsão"
            >
              {tracking ? <ChevronUp className="w-3 h-3" /> : <BookmarkPlus className="w-3 h-3" />}
              {tracking ? "Cancelar" : "Registrar"}
            </button>
          )}
          <a
            href={market.eventSlug ? `https://polymarket.com/pt/event/${market.eventSlug}` : "https://polymarket.com/pt"}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1 text-muted-foreground/40 hover:text-gold transition-colors"
            aria-label="Abrir no Polymarket"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* Inline track form */}
      {tracking && prices && (
        <TrackForm
          market={market}
          marketProb={prices.yes}
          onSaved={handleSaved}
          onCancel={() => setTracking(false)}
        />
      )}

      {/* Analisar → tela de detalhe dedicada (stats, consenso, histórico, IA + notícias) */}
      {prices && (
        <Link href={`/apostas/poly-${market.id}`}>
          <span className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-border/20 text-[11px] text-muted-foreground hover:text-gold hover:border-gold/20 transition-colors cursor-pointer">
            <Zap className="w-3 h-3" />
            Analisar mercado
            <ArrowRight className="w-3 h-3" />
          </span>
        </Link>
      )}
    </div>
    </AnimatedSection>
  );
}
