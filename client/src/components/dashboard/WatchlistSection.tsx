/**
 * WatchlistSection — mercados salvos do usuário (Dashboard).
 * Extraído de pages/Dashboard.tsx. Comportamento idêntico.
 */
import { useState } from "react";
import { Link } from "wouter";
import { Bookmark, Bell, ArrowRight, ExternalLink, Trash2 } from "lucide-react";
import { loadWatchlist, removeFromWatchlist, cycleAlertThreshold, type WatchlistItem } from "@/lib/watchlist";
import { usePushNotifications, syncPushWatchlist } from "@/hooks/usePushNotifications";

export default function WatchlistSection() {
  const [items, setItems] = useState<WatchlistItem[]>(() => loadWatchlist());
  const push = usePushNotifications();

  function handleRemove(id: string) {
    removeFromWatchlist(id);
    setItems(loadWatchlist());
    void syncPushWatchlist();
  }

  function handleCycleThreshold(id: string) {
    cycleAlertThreshold(id);
    setItems(loadWatchlist());
  }

  if (items.length === 0) return null;

  const SOURCE_COLOR: Record<string, string> = {
    polymarket: "text-neon-blue border-neon-blue/30 bg-neon-blue/5",
    kalshi: "text-green-400 border-green-500/30 bg-green-500/5",
    reddit: "text-orange-400 border-orange-500/30 bg-orange-500/5",
  };
  const SOURCE_LABEL: Record<string, string> = { polymarket: "Polymarket", kalshi: "Kalshi", reddit: "Reddit" };

  return (
    <div className="glass-card rounded-xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <Bookmark className="w-4 h-4 text-gold" />
          Watchlist ({items.length})
        </h3>
        <div className="flex items-center gap-3">
          {/* Web Push: alerta nativo mesmo com o site fechado */}
          {push.supported && !push.denied && (
            <button
              onClick={() => void (push.enabled ? push.unsubscribe() : push.subscribe())}
              disabled={push.busy}
              className={`text-[10px] font-medium px-2.5 py-1 rounded-full border transition-colors flex items-center gap-1 disabled:opacity-50 ${
                push.enabled
                  ? "text-positive border-positive/30 bg-positive/10"
                  : "text-muted-foreground border-border/40 hover:text-foreground hover:border-gold/40"
              }`}
            >
              <Bell className="w-3 h-3" aria-hidden="true" />
              {push.enabled ? "Notificações ativas" : "Ativar notificações"}
            </button>
          )}
          <span className="text-[10px] text-muted-foreground/50 flex items-center gap-1">
            <Bell className="w-3 h-3" />clique no sino para ajustar alerta
          </span>
          <Link href="/apostas">
            <span className="text-xs text-gold hover:underline flex items-center gap-1">
              Adicionar <ArrowRight className="w-3 h-3" />
            </span>
          </Link>
        </div>
      </div>
      <div className="space-y-2">
        {items.map((item) => {
          const savedProb  = item.yesProb      !== undefined ? item.yesProb * 100      : null;
          const liveProb   = item.lastKnownProb !== undefined ? item.lastKnownProb * 100 : null;
          const displayPct = liveProb ?? savedProb;
          const probColor  = displayPct === null ? "text-muted-foreground"
            : displayPct >= 70 ? "text-positive" : displayPct <= 30 ? "text-negative" : "text-gold";
          const delta = (liveProb !== null && savedProb !== null) ? liveProb - savedProb : null;
          const threshold = item.alertThreshold ?? 5;
          // Polymarket/Kalshi têm tela dedicada (/apostas/:id); Reddit não — fica só título.
          const detailHref = item.source === "polymarket" || item.source === "kalshi" ? `/apostas/${item.id}` : null;

          return (
            <div key={item.id} className="flex items-center gap-3 p-3 rounded-lg border border-border/30 bg-secondary/10">
              <div className="flex-1 min-w-0">
                {detailHref ? (
                  <Link href={detailHref}>
                    <p className="text-xs font-medium text-foreground leading-snug line-clamp-1 hover:text-gold transition-colors cursor-pointer">{item.title}</p>
                  </Link>
                ) : (
                  <p className="text-xs font-medium text-foreground leading-snug line-clamp-1">{item.title}</p>
                )}
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${SOURCE_COLOR[item.source] ?? ""}`}>
                    {SOURCE_LABEL[item.source] ?? item.source}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(item.savedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                  </span>
                  {delta !== null && Math.abs(delta) >= 0.5 && (
                    <span className={`text-[10px] font-mono font-semibold ${delta > 0 ? "text-positive" : "text-negative"}`}>
                      {delta > 0 ? "+" : ""}{delta.toFixed(1)}pp desde salvo
                    </span>
                  )}
                </div>
              </div>

              {displayPct !== null && (
                <div className="shrink-0 text-right">
                  <p className={`text-sm font-mono font-bold ${probColor}`}>{displayPct.toFixed(1)}%</p>
                  <p className="text-[9px] text-muted-foreground">{liveProb !== null ? "ao vivo" : "salvo"}</p>
                </div>
              )}

              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => handleCycleThreshold(item.id)}
                  title={`Alerta: ≥${threshold}pp — clique para alterar`}
                  className="flex items-center gap-0.5 px-1.5 py-1 rounded-md text-[9px] font-mono border border-border/30 text-muted-foreground/60 hover:text-gold hover:border-gold/30 transition-colors"
                >
                  <Bell className="w-3 h-3" aria-hidden="true" />
                  {threshold}pp
                </button>
                <a href={item.externalUrl} target="_blank" rel="noopener noreferrer"
                  className="p-1.5 rounded-md text-muted-foreground/50 hover:text-primary transition-colors"
                  title={`Ver no ${SOURCE_LABEL[item.source] ?? item.source}`}
                  aria-label={`Ver na fonte (${SOURCE_LABEL[item.source] ?? item.source}): ${item.title}`}>
                  <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                </a>
                <button
                  onClick={() => handleRemove(item.id)}
                  title="Remover da watchlist" aria-label={`Remover: ${item.title}`}
                  className="p-1.5 rounded-md text-muted-foreground/40 hover:text-negative transition-colors">
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
