/**
 * Tipos compartilhados da Previsão Guiada — extraídos de pages/Previsao.tsx.
 */
export type Domain = "sports" | "economy" | "energy" | "politics" | "science" | "crypto" | "finance" | "climate";
export type Horizon = "short" | "medium" | "long";

export interface DecompositionItem {
  question: string;
  probability: number;
  reasoning: string;
}

export interface PredictResult {
  modelChosen: string;
  modelFamily: string;
  formula: string;
  whyThisModel: string;
  shortTermPrediction: string;
  mediumTermPrediction: string;
  longTermPrediction: string;
  confidenceShort: number;
  confidenceMedium: number;
  confidenceLong: number;
  confidenceLow80?: number;
  confidenceHigh80?: number;
  plainLanguage: string;
  bankrollImpact: string | null;
  keyAssumptions: string[];
  limitations: string;
  researchBasis: string;
  actionableInsight: string;
  expertiseLevel?: "leigo" | "intermediario" | "avancado";
  analogyExplanation?: string;
  probabilityVerbal?: string;
  historicalParallel?: string;
  // Protocolo Superforecaster
  referenceClass?: string;
  baseRate?: number;
  baseRateSource?: string;
  decomposition?: DecompositionItem[];
  insideViewUp?: string[];
  insideViewDown?: string[];
  updateTriggers?: string[];
  calibrationWarning?: string | null;
  cached?: boolean;
}
