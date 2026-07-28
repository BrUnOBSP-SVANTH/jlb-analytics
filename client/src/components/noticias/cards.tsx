/**
 * Componentes presentacionais da página Notícias — extraídos de Noticias.tsx
 * para reduzir o tamanho do arquivo. Puros (sem fetch, sem estado compartilhado).
 */

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

