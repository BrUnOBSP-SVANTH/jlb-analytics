/**
 * LoadingSkeleton — placeholder animado do card enquanto carrega. Extraido de pages/Apostas.tsx.
 */
export function LoadingSkeleton() {
  return (
    <div className="glass-card rounded-xl p-5 space-y-4 animate-pulse">
      {/* Title row + prob pill */}
      <div className="flex items-start gap-3">
        <div className="w-2 h-2 rounded-full bg-secondary/50 mt-1.5 shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-3.5 bg-secondary/50 rounded w-11/12" />
          <div className="h-3 bg-secondary/30 rounded w-5/12" />
          <div className="flex gap-1.5 mt-1">
            <div className="h-4 w-14 bg-secondary/30 rounded-full" />
            <div className="h-4 w-10 bg-secondary/20 rounded-full" />
          </div>
        </div>
        <div className="w-8 h-8 rounded-full bg-secondary/30 shrink-0" />
      </div>
      {/* Hype bar */}
      <div className="space-y-1">
        <div className="h-2.5 bg-secondary/25 rounded w-20" />
        <div className="h-1.5 bg-secondary/30 rounded-full w-full" />
      </div>
      {/* Stats row */}
      <div className="flex gap-4">
        <div className="h-3 bg-secondary/25 rounded w-16" />
        <div className="h-3 bg-secondary/25 rounded w-20" />
      </div>
      {/* Why trending box */}
      <div className="p-3 rounded-lg bg-secondary/10 space-y-1.5">
        <div className="h-2.5 bg-secondary/30 rounded w-24" />
        <div className="h-3 bg-secondary/20 rounded w-full" />
        <div className="h-3 bg-secondary/15 rounded w-10/12" />
      </div>
      {/* Footer */}
      <div className="flex justify-between items-center pt-1">
        <div className="h-3 bg-secondary/25 rounded w-32" />
        <div className="h-5 bg-secondary/20 rounded w-16" />
      </div>
    </div>
  );
}
