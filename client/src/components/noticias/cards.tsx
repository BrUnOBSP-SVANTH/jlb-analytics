/**
 * Componentes presentacionais da página Notícias — extraídos de Noticias.tsx
 * para reduzir o tamanho do arquivo. Puros (sem fetch, sem estado compartilhado).
 */

import { type RedditPost, type Article, timeAgo, timeAgoISO } from "@/lib/noticiasShared";
import { analyzeSentiment } from "@/lib/predictions";
import { ExternalLink, Globe, Clock, Zap } from "lucide-react";


const CATEGORY_COLORS: Record<string, string> = {
  "Politics": "text-blue-400 bg-blue-400/10 border-blue-400/20",
  "Elections": "text-blue-400 bg-blue-400/10 border-blue-400/20",
  "Crypto": "text-orange-400 bg-orange-400/10 border-orange-400/20",
  "Criptomoedas": "text-orange-400 bg-orange-400/10 border-orange-400/20",
  "Sports": "text-green-400 bg-green-400/10 border-green-400/20",
  "Esportes": "text-green-400 bg-green-400/10 border-green-400/20",
  "Science": "text-purple-400 bg-purple-400/10 border-purple-400/20",
  "Tecnologia e Ciência": "text-purple-400 bg-purple-400/10 border-purple-400/20",
  "World": "text-sky-400 bg-sky-400/10 border-sky-400/20",
  "Economy": "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
  "Economy/Markets": "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
  "Finanças": "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
  "Finance": "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
  "Pop-Culture ": "text-pink-400 bg-pink-400/10 border-pink-400/20",
  "Climate": "text-teal-400 bg-teal-400/10 border-teal-400/20",
  "Clima": "text-teal-400 bg-teal-400/10 border-teal-400/20",
};

export function CategoryBadge({ category }: { category?: string }) {
  if (!category) return null;
  const colors = CATEGORY_COLORS[category] ?? "text-muted-foreground bg-secondary/50 border-border/30";
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider border ${colors}`}>
      {category}
    </span>
  );
}

// ── Movidos de pages/Noticias.tsx ──

export const ARTICLE_TOPICS = [
  { label: "Polymarket",          query: "polymarket" },
  { label: "Eleições Brasil",     query: "eleições Brasil apostas previsão" },
  { label: "Mercados Preditivos", query: "mercados preditivos apostas" },
  { label: "Cripto",              query: "bitcoin cripto mercado previsão" },
  { label: "Economia BR",        query: "economia Brasil Selic juros inflação" },
  { label: "Esportes",            query: "apostas esportivas futebol brasil" },
  { label: "Kalshi",              query: "kalshi prediction markets" },
];

export function PostCard({ post }: { post: RedditPost }) {
  const sentiment = analyzeSentiment(post.title + " " + (post.selftext ?? ""));
  const link = post.url.startsWith("http") ? post.url : `https://reddit.com${post.permalink}`;
  const isExternal = post.url.startsWith("http") && !post.url.includes("reddit.com");

  return (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      className="glass-card rounded-xl p-4 flex flex-col gap-2 hover:border-gold/30 transition-colors group"
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold text-gold/70 uppercase tracking-wider">
          r/{post.subreddit}
        </span>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-medium ${sentiment.color}`}>{sentiment.label}</span>
          <span className="text-[10px] text-muted-foreground">{timeAgo(post.created_utc)}</span>
        </div>
      </div>
      <p className="text-sm font-medium text-foreground leading-snug group-hover:text-gold/90 transition-colors">
        {post.title}
      </p>
      <div className="flex items-center justify-between pt-1 border-t border-border/20">
        <span className="text-xs text-muted-foreground">
          <span className="font-mono text-foreground">↑{post.score}</span>
          <span className="ml-1.5 text-muted-foreground/60">u/{post.author}</span>
        </span>
        {isExternal && (
          <ExternalLink className="w-3 h-3 text-muted-foreground/50 group-hover:text-gold transition-colors" aria-hidden="true" />
        )}
      </div>
    </a>
  );
}

export function ArticleCard({ article, onCardClick }: { article: Article; onCardClick: (a: Article) => void }) {
  const langLabel = article.lang === "pt" ? "PT" : "EN";
  const langColor = article.lang === "pt" ? "text-positive bg-positive/10 border-positive/20" : "text-neon-blue bg-neon-blue/10 border-neon-blue/20";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onCardClick(article)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onCardClick(article); }}
      className="group cursor-pointer glass-card rounded-xl p-5 hover:border-gold/30 transition-colors space-y-3"
      aria-label={`Analisar apostas para: ${article.title}`}
    >
      {/* Image */}
      {article.imageUrl && (
        <div className="w-full h-32 rounded-lg overflow-hidden bg-secondary/30">
          <img
            src={article.imageUrl}
            alt=""
            aria-hidden="true"
            loading="lazy"
            className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
            onError={(e) => { (e.currentTarget.parentElement!).style.display = "none"; }}
          />
        </div>
      )}

      {/* Meta row */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wide ${langColor}`}>
          {langLabel}
        </span>
        {article.source && (
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Globe className="w-3 h-3" aria-hidden="true" />
            {article.source}
          </span>
        )}
        <span className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground/60">
          <Clock className="w-3 h-3" aria-hidden="true" />
          {timeAgoISO(article.publishedAt)}
        </span>
      </div>

      {/* Title */}
      <p className="text-sm font-semibold text-foreground group-hover:text-gold transition-colors leading-snug line-clamp-3">
        {article.title}
      </p>

      {/* Excerpt */}
      {article.description && (
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
          {article.description}
        </p>
      )}

      {/* Footer: dois CTAs */}
      <div className="flex items-center justify-between pt-1 border-t border-border/20">
        <div className="flex items-center gap-1 text-[11px] text-gold font-medium">
          <Zap className="w-3 h-3" aria-hidden="true" />
          Ver apostas relacionadas
        </div>
        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1 text-[10px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
          aria-label="Ler artigo original"
        >
          <ExternalLink className="w-3 h-3" />
          Artigo
        </a>
      </div>
    </div>
  );
}

export function ArticleCardSkeleton() {
  return (
    <div className="glass-card rounded-xl p-5 space-y-3 animate-pulse">
      <div className="h-32 bg-secondary/30 rounded-lg" />
      <div className="flex gap-2">
        <div className="h-3 w-6 bg-secondary/40 rounded" />
        <div className="h-3 w-20 bg-secondary/30 rounded" />
      </div>
      <div className="space-y-1.5">
        <div className="h-3.5 bg-secondary/40 rounded w-full" />
        <div className="h-3.5 bg-secondary/40 rounded w-4/5" />
        <div className="h-3.5 bg-secondary/30 rounded w-3/5" />
      </div>
      <div className="h-3 bg-secondary/20 rounded w-2/3" />
    </div>
  );
}
