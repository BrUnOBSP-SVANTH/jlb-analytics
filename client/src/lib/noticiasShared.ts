/**
 * Tipos e utilitários compartilhados entre a página Notícias e os modais de análise.
 * Extraído para quebrar o arquivo gigante Noticias.tsx sem import circular.
 */

export interface Article {
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  description: string;
  imageUrl?: string;
  lang: "pt" | "en";
}

/** "5m atrás" / "3h atrás" / "ontem" / "2d atrás" a partir de uma data ISO. */
export function timeAgoISO(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return `${Math.max(1, Math.floor(diff / 60_000))}m atrás`;
  if (h < 24) return `${h}h atrás`;
  const d = Math.floor(h / 24);
  if (d === 1) return "ontem";
  return `${d}d atrás`;
}
