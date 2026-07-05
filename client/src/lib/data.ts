/**
 * Shared data constants for JLB Analytics
 * Obsidian Finance Design — Dark Luxury Fintech
 */

// ============ CHART THEME CONSTANTS ============
export const CHART_COLORS = {
  primary: "oklch(0.78 0.12 85)",
  secondary: "oklch(0.62 0.2 250)",
  tertiary: "oklch(0.72 0.19 155)",
  quaternary: "oklch(0.72 0.18 240)",
  muted: "oklch(0.6 0.02 260)",
  tooltipBg: "oklch(0.18 0.015 260)",
  tooltipBorder: "oklch(0.25 0.015 260)",
  tooltipText: "oklch(0.92 0.005 250)",
} as const;

export const CHART_TOOLTIP_STYLE = {
  background: CHART_COLORS.tooltipBg,
  border: `1px solid ${CHART_COLORS.tooltipBorder}`,
  borderRadius: "8px",
  color: CHART_COLORS.tooltipText,
} as const;

export const CHART_TICK_STYLE = {
  fill: CHART_COLORS.muted,
  fontSize: 12,
} as const;

// ============ IMAGE URLS ============
export const IMAGES = {
  heroBg: "https://d2xsxph8kpxj0f.cloudfront.net/310419663032591208/PLaZ8Q4er6RrsQwHgPFvYK/hero-bg-7RU8tM2se8ztBJczbGhh78.webp",
  marketDashboard: "https://d2xsxph8kpxj0f.cloudfront.net/310419663032591208/PLaZ8Q4er6RrsQwHgPFvYK/market-dashboard-XUS9ov8mGV2yd4pNMaFkHd.webp",
  investmentGrowth: "https://d2xsxph8kpxj0f.cloudfront.net/310419663032591208/PLaZ8Q4er6RrsQwHgPFvYK/investment-growth-e2jYztG6jWgrY5yUBDaQYo.webp",
  educationFinance: "https://d2xsxph8kpxj0f.cloudfront.net/310419663032591208/PLaZ8Q4er6RrsQwHgPFvYK/education-finance-KSWcr2y8eNg5DomM5pKecH.webp",
  correlationAnalysis: "https://d2xsxph8kpxj0f.cloudfront.net/310419663032591208/PLaZ8Q4er6RrsQwHgPFvYK/correlation-analysis-mpAsF7VfUN3DsgRRhps6Ce.webp",
};

// ============ STOCK METADATA (apenas dados estáticos — preços/histórico buscados ao vivo) ============
export interface StockMeta {
  ticker: string;
  name: string;
  logo: string;
  currency: "USD" | "BRL";
  sector: string;
  country: "BR" | "US";
}

/** Lista de referência de ativos — sem preços hardcoded. Use /api/quotes/history/:ticker para dados reais. */
export const stocks: StockMeta[] = [
  { ticker: "AAPL",  name: "Apple Inc.",          logo: "https://logo.clearbit.com/apple.com",        currency: "USD", sector: "Tecnologia",  country: "US" },
  { ticker: "MSFT",  name: "Microsoft Corp.",      logo: "https://logo.clearbit.com/microsoft.com",    currency: "USD", sector: "Tecnologia",  country: "US" },
  { ticker: "NVDA",  name: "NVIDIA Corp.",         logo: "https://logo.clearbit.com/nvidia.com",       currency: "USD", sector: "Tecnologia",  country: "US" },
  { ticker: "TSLA",  name: "Tesla Inc.",           logo: "https://logo.clearbit.com/tesla.com",        currency: "USD", sector: "Automotivo",  country: "US" },
  { ticker: "AMZN",  name: "Amazon.com Inc.",      logo: "https://logo.clearbit.com/amazon.com",       currency: "USD", sector: "Tecnologia",  country: "US" },
  { ticker: "PETR4", name: "Petrobras PN",         logo: "https://logo.clearbit.com/petrobras.com.br", currency: "BRL", sector: "Energia",     country: "BR" },
  { ticker: "VALE3", name: "Vale S.A.",            logo: "https://logo.clearbit.com/vale.com",         currency: "BRL", sector: "Mineração",   country: "BR" },
  { ticker: "ITUB4", name: "Itaú Unibanco PN",    logo: "https://logo.clearbit.com/itau.com.br",      currency: "BRL", sector: "Financeiro",  country: "BR" },
  { ticker: "BBAS3", name: "Banco do Brasil",      logo: "https://logo.clearbit.com/bb.com.br",        currency: "BRL", sector: "Financeiro",  country: "BR" },
  { ticker: "WEGE3", name: "WEG S.A.",             logo: "https://logo.clearbit.com/weg.net",          currency: "BRL", sector: "Industrial",  country: "BR" },
];


// ============ UTILITY FUNCTIONS ============
export function formatCurrency(value: number, currency: string = "BRL"): string {
  if (currency === "BRL") {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
  }
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

export function formatPercent(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function formatNumber(value: number): string {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return value.toFixed(2);
}

/** Validates and clamps a numeric input — rejects NaN, Infinity and negatives */
export function sanitizePositiveNumber(raw: number, fallback: number = 0): number {
  if (isNaN(raw) || !isFinite(raw) || raw < 0) return fallback;
  return raw;
}


export interface CorrelationResult {
  correlation: number;
  covariance: number;
  /** true when both arrays had the same length */
  lengthsMatch: boolean;
  /** number of data points effectively used */
  n: number;
}

/**
 * Calculate SAMPLE correlation between two arrays (Bessel's correction: n-1).
 * This is the statistically correct formula for financial sample data.
 * Returns lengthsMatch=false when arrays differ so the UI can warn the user.
 */
export function calculateCorrelation(x: number[], y: number[]): CorrelationResult {
  const lengthsMatch = x.length === y.length;
  const n = Math.min(x.length, y.length);

  if (n < 2) {
    return { correlation: 0, covariance: 0, lengthsMatch, n };
  }

  const xSlice = x.slice(0, n);
  const ySlice = y.slice(0, n);

  const meanX = xSlice.reduce((a, b) => a + b, 0) / n;
  const meanY = ySlice.reduce((a, b) => a + b, 0) / n;

  let cov = 0;
  let varX = 0;
  let varY = 0;

  for (let i = 0; i < n; i++) {
    const dx = xSlice[i] - meanX;
    const dy = ySlice[i] - meanY;
    cov += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }

  // Bessel's correction: divide by (n - 1) for sample data
  const divisor = n - 1;
  cov /= divisor;
  const stdX = Math.sqrt(varX / divisor);
  const stdY = Math.sqrt(varY / divisor);
  const correlation = stdX * stdY === 0 ? 0 : cov / (stdX * stdY);

  return {
    correlation: Math.round(correlation * 1000) / 1000,
    covariance: Math.round(cov * 100) / 100,
    lengthsMatch,
    n,
  };
}
