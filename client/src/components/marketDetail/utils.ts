/**
 * Helpers puros da tela de detalhe de mercado. Extraido de pages/MarketDetail.tsx.
 */
export function formatCountdown(dateStr: string): { label: string; urgent: boolean; ended: boolean } {
  const end = new Date(dateStr).getTime();
  const now = Date.now();
  const diff = end - now;
  if (diff <= 0) return { label: "Encerrado", urgent: false, ended: true };
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  if (days > 30) return { label: `${Math.floor(days / 30)}m restantes`, urgent: false, ended: false };
  if (days > 0) return { label: `${days}d ${hours}h restantes`, urgent: days <= 3, ended: false };
  return { label: `${hours}h restantes`, urgent: true, ended: false };
}

export function formatVolume(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

export function calcEV(yourProb: number, marketProb: number): number {
  if (marketProb <= 0 || marketProb >= 1) return 0;
  const b = 1 / marketProb - 1;
  return yourProb * b - (1 - yourProb);
}

export function calcKelly(yourProb: number, marketProb: number): number {
  if (marketProb <= 0 || marketProb >= 1) return 0;
  const b = 1 / marketProb - 1;
  return Math.max(0, (b * yourProb - (1 - yourProb)) / b);
}
