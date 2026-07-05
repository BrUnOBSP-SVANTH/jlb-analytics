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

// ── Probability Arc (SVG gauge) ────────────────────────────────────────────

export function ProbArc({ yes }: { yes: number }) {
  const r = 28;
  const cx = 36;
  const cy = 36;
  const startAngle = -180;
  const sweepAngle = 180 * (yes / 100);
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const x1 = cx + r * Math.cos(rad(startAngle));
  const y1 = cy + r * Math.sin(rad(startAngle));
  const x2 = cx + r * Math.cos(rad(startAngle + sweepAngle));
  const y2 = cy + r * Math.sin(rad(startAngle + sweepAngle));
  const large = sweepAngle > 180 ? 1 : 0;
  const color = yes >= 70 ? "#4ade80" : yes <= 30 ? "#f87171" : "#C89830";

  return (
    <svg width="72" height="44" viewBox="0 0 72 44" aria-hidden="true">
      {/* Track — theme-aware (era oklch escuro fixo, quebrava no modo claro) */}
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none"
        style={{ stroke: "var(--secondary)" }}
        strokeWidth="5"
        strokeLinecap="round"
      />
      {/* Fill */}
      {yes > 0 && (
        <path
          d={`M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`}
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeLinecap="round"
        />
      )}
      {/* Label */}
      <text x={cx} y={cy + 6} textAnchor="middle" fill={color} fontSize="12" fontWeight="700" fontFamily="var(--font-mono)">
        {yes.toFixed(0)}%
      </text>
    </svg>
  );
}
