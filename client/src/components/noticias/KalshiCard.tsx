/**
 * KalshiCard — card de mercado Kalshi da pagina Noticias. Extraido de pages/Noticias.tsx.
 */
import { useState } from "react";
import { Link } from "wouter";
import { Languages, BookmarkPlus, Check, ExternalLink, Zap, ArrowRight } from "lucide-react";
import { type KalshiMarket, daysLeft, formatVolume } from "@/lib/noticiasShared";
import { CategoryBadge } from "@/components/noticias/cards";
import { addPrediction } from "@/lib/predictions";
import { awardPoints } from "@/lib/userProgress";
import { track } from "@/lib/analytics";

export function KalshiCard({ market }: { market: KalshiMarket }) {
  const [translation, setTranslation] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const [predictOpen, setPredictOpen] = useState(false);
  const [userProb, setUserProb] = useState(market.yesProb);
  const [saved, setSaved] = useState(false);

  async function handleTranslate() {
    if (translation) { setTranslation(null); return; }
    setTranslating(true);
    try {
      const res = await fetch(`/api/translate?text=${encodeURIComponent(market.title)}`);
      const data = await res.json() as { translation?: string };
      setTranslation(data.translation ?? null);
    } catch { /* ignore */ } finally {
      setTranslating(false);
    }
  }

  function handleSaveKalshi() {
    addPrediction({
      marketId: `kalshi-${market.ticker}`,
      question: translation ?? market.title,
      marketProb: market.yesProb,
      userProb,
    });
    awardPoints("prediction_made", `Previsão Kalshi: ${market.title.slice(0, 50)}`);
    track("prediction_registered", { source: "noticias_kalshi" });
    setSaved(true);
    setTimeout(() => { setSaved(false); setPredictOpen(false); }, 1800);
  }

  const noProb = 100 - market.yesProb;
  const d = daysLeft(market.closeTime);
  const prevDiff = market.prevYesProb !== undefined ? market.yesProb - market.prevYesProb : null;

  return (
    <div className="glass-card rounded-xl p-4 flex flex-col gap-3 hover:border-gold/20 transition-colors">
      {/* Badges */}
      <div className="flex flex-wrap items-center gap-1">
        <CategoryBadge category={market.category} />
        {d !== null && (
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold border ${d <= 3 ? "text-negative bg-negative/10 border-negative/20" : "text-muted-foreground bg-secondary/40 border-border/20"}`}>
            {d === 0 ? "Encerra hoje" : `${d}d restantes`}
          </span>
        )}
        {prevDiff !== null && prevDiff !== 0 && (
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold border ${prevDiff > 0 ? "text-positive bg-positive/10 border-positive/20" : "text-negative bg-negative/10 border-negative/20"}`}>
            {prevDiff > 0 ? "▲" : "▼"} {Math.abs(prevDiff)}pp hoje
          </span>
        )}
      </div>

      {/* Title */}
      <div>
        <Link href={`/apostas/kalshi-${market.ticker}`}>
          <p className="text-sm font-medium text-foreground leading-snug line-clamp-3 hover:text-gold transition-colors cursor-pointer">{market.title}</p>
        </Link>
        {translation && <p className="text-xs text-gold/80 mt-1 leading-snug italic">{translation}</p>}
        <button
          onClick={handleTranslate}
          disabled={translating}
          className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground hover:text-gold transition-colors disabled:opacity-50"
        >
          <Languages className="w-3 h-3" />
          {translating ? "Traduzindo..." : translation ? "Ocultar tradução" : "Traduzir"}
        </button>
      </div>

      {/* Prob bars */}
      <div className="space-y-1.5">
        <div>
          <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
            <span>Sim</span>
            <span className="font-mono">{market.yesProb}%</span>
          </div>
          <div className="h-1 rounded-full bg-secondary/50 overflow-hidden">
            <div className="h-full bg-positive rounded-full" style={{ width: `${market.yesProb}%` }} />
          </div>
        </div>
        <div>
          <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
            <span>Não</span>
            <span className="font-mono">{noProb}%</span>
          </div>
          <div className="h-1 rounded-full bg-secondary/50 overflow-hidden">
            <div className="h-full bg-negative/60 rounded-full" style={{ width: `${noProb}%` }} />
          </div>
        </div>
      </div>

      {/* Quick predict */}
      {!predictOpen ? (
        <button
          onClick={() => { setPredictOpen(true); setUserProb(market.yesProb); }}
          className="flex items-center gap-1 text-[10px] text-muted-foreground/60 hover:text-gold transition-colors"
        >
          <BookmarkPlus className="w-3 h-3" />
          Registrar minha estimativa
        </button>
      ) : (
        <div className="p-3 rounded-lg bg-primary/5 border border-primary/15 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold text-foreground uppercase tracking-wide">Minha estimativa (SIM)</p>
            <span className={`text-xs font-mono font-bold ${(userProb - market.yesProb) > 3 ? "text-positive" : (userProb - market.yesProb) < -3 ? "text-negative" : "text-muted-foreground"}`}>
              Edge: {(userProb - market.yesProb) >= 0 ? "+" : ""}{(userProb - market.yesProb).toFixed(0)}pp
            </span>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>Mercado: {market.yesProb}%</span>
              <span className="font-mono font-bold text-foreground">{userProb}%</span>
            </div>
            <input
              type="range" min={1} max={99} value={userProb}
              onChange={(e) => setUserProb(parseInt(e.target.value, 10))}
              className="w-full h-1.5 rounded-full accent-primary cursor-pointer"
            />
          </div>
          <div className="flex items-center gap-2">
            {saved ? (
              <span className="flex items-center gap-1.5 text-xs text-positive font-medium">
                <Check className="w-3.5 h-3.5" /> Registrado!
              </span>
            ) : (
              <button onClick={handleSaveKalshi} className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity">
                Salvar
              </button>
            )}
            <button onClick={() => setPredictOpen(false)} className="text-[10px] text-muted-foreground hover:text-foreground transition-colors">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-1 border-t border-border/20">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>Vol: <span className="font-mono text-foreground">{formatVolume(market.volume)}</span></span>
          {market.volume24h != null && market.volume24h > 0 && (
            <span className="text-[10px]">24h: <span className="font-mono text-foreground/70">{formatVolume(market.volume24h)}</span></span>
          )}
          {market.openInterest != null && market.openInterest > 0 && (
            <span className="text-[10px]">OI: <span className="font-mono text-foreground/70">{market.openInterest.toLocaleString("pt-BR")}</span></span>
          )}
        </div>
        <a
          href={`https://kalshi.com/markets/${market.seriesTicker.toLowerCase()}/${market.eventTicker.toLowerCase()}`}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1 text-muted-foreground/40 hover:text-gold transition-colors"
          aria-label="Abrir na Kalshi"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      {/* Analisar → tela de detalhe dedicada */}
      <Link href={`/apostas/kalshi-${market.ticker}`}>
        <span className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-border/20 text-[11px] text-muted-foreground hover:text-gold hover:border-gold/20 transition-colors cursor-pointer">
          <Zap className="w-3 h-3" />
          Analisar mercado
          <ArrowRight className="w-3 h-3" />
        </span>
      </Link>
    </div>
  );
}
