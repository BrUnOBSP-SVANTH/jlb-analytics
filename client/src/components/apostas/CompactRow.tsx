/**
 * CompactRow — linha compacta da lista de apostas (view densa). Extraido de pages/Apostas.tsx.
 */
import { Scale, BookmarkCheck, Bookmark, ExternalLink } from "lucide-react";
import { type TrendingItem, CATEGORY_LABELS, formatVolume } from "@/lib/trending";
import { SourceBadge, MarketBadge } from "@/components/apostas/cards";

export function CompactRow({ item, onCompare, inCompare, onWatch, watched }: {
  item: TrendingItem;
  onCompare?: (item: TrendingItem) => void;
  inCompare?: boolean;
  onWatch?: (item: TrendingItem) => void;
  watched?: boolean;
}) {
  const pct = item.yesProb !== undefined ? Math.round(item.yesProb * 100) : null;
  const pctColor = pct === null ? "text-muted-foreground" : pct >= 70 ? "text-positive" : pct <= 30 ? "text-negative" : "text-gold";
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-border/10 hover:bg-secondary/10 transition-colors text-xs">
      <SourceBadge source={item.source} subreddit={item.subreddit} />
      {pct !== null && (
        <span className={`font-mono font-bold w-10 shrink-0 ${pctColor}`}>{pct}%</span>
      )}
      <span className="flex-1 min-w-0 truncate text-foreground/80" title={item.title}>{item.title}</span>
      {item.volume !== undefined && (
        <span className="hidden sm:block text-muted-foreground/60 shrink-0 w-14 text-right">{formatVolume(item.volume)}</span>
      )}
      {item.normalizedCategory !== "other" && item.normalizedCategory !== "all" && (
        <span className="hidden md:block text-[9px] text-muted-foreground/50 shrink-0 w-16 truncate">{CATEGORY_LABELS[item.normalizedCategory]}</span>
      )}
      {item.badge && (
        <span className="hidden lg:block"><MarketBadge badge={item.badge} endDate={item.endDate} /></span>
      )}
      <div className="flex items-center gap-1 shrink-0">
        {onCompare && (
          <button onClick={() => onCompare(item)} title={inCompare ? "Remover comparação" : "Comparar"}
            className={`p-1 rounded transition-colors ${inCompare ? "text-neon-blue" : "text-muted-foreground/40 hover:text-neon-blue"}`}>
            <Scale className="w-3 h-3" />
          </button>
        )}
        <button onClick={() => onWatch?.(item)} title={watched ? "Remover watchlist" : "Watchlist"}
          className={`p-1 rounded transition-colors ${watched ? "text-gold" : "text-muted-foreground/40 hover:text-gold"}`}>
          {watched ? <BookmarkCheck className="w-3 h-3" /> : <Bookmark className="w-3 h-3" />}
        </button>
        <a href={item.externalUrl} target="_blank" rel="noopener noreferrer"
          className="p-1 rounded text-muted-foreground/40 hover:text-primary transition-colors">
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
}
