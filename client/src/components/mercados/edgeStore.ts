/**
 * Edge store — fair value da IA (JLB) vs preço de mercado, lido pelos cards sem
 * prop-drilling. publishEdges (DivergencesSection escreve) + useEdge (cards leem).
 * Extraído de pages/Apostas.tsx.
 */
import { useState, useEffect } from "react";

export interface Divergence {
  marketId: string; source: string; title: string; category: string;
  currentProb: number; aiFairValue: number; edge: number; confidence: string;
}

// Store global de edges (fair value IA vs preço) — lido pelos cards sem prop-drilling.
const edgeStore = new Map<string, { edge: number; aiFairValue: number }>();
const edgeListeners = new Set<() => void>();
export function publishEdges(divs: Divergence[]) {
  edgeStore.clear();
  for (const d of divs) edgeStore.set(d.marketId, { edge: d.edge, aiFairValue: d.aiFairValue });
  edgeListeners.forEach((l) => l());
}
export function useEdge(id: string): { edge: number; aiFairValue: number } | undefined {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((x) => x + 1);
    edgeListeners.add(l);
    return () => { edgeListeners.delete(l); };
  }, []);
  return edgeStore.get(id);
}
