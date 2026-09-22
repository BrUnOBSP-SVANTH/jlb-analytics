/**
 * O formato da lista curta da home — o mesmo tipo dos dois lados.
 *
 * Mora em `shared/` porque quem monta (server/routes/destaques.ts) e quem
 * desenha (pages/Home.tsx) precisam concordar: foi assim que a home passou de
 * 115 KB de catálogo para 3 KB (medido em 16/09/2026).
 */
export interface MercadoEmDestaque {
  id: string;
  titulo: string;
  /** O evento que agrupa, quando acrescenta contexto (DAD-01). */
  subtitulo?: string;
  /**
   * De QUEM é a probabilidade, quando o mercado não é Sim/Não (DAD-02).
   * A home mostrava "Brazil Presidential Election 61%" — 61% de quem?
   */
  desfecho?: string;
  /** 0–1, a escala que o cliente usa. É a do desfecho líder. */
  prob: number;
  volume: number;
}

export interface Destaques {
  destaques: MercadoEmDestaque[];
  totais: { polymarket: number; kalshi: number };
}
