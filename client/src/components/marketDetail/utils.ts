/**
 * Helpers puros da tela de detalhe de mercado. Extraido de pages/MarketDetail.tsx.
 */
import { dolar, tempoRestante } from "@shared/formato";
/**
 * Quanto falta, SEM a palavra "restantes" dentro (DET-09).
 *
 * A tela escrevia `Encerra em: ${label}` e o label já vinha com "restantes"
 * dentro — o resultado impresso era "Encerra em: 6d 3h restantes", que diz a
 * mesma coisa duas vezes. Quem chama decide como emoldurar; o valor é só o valor.
 */
export function formatCountdown(dateStr: string): { label: string; urgent: boolean; ended: boolean } {
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff <= 0) return { label: "encerrado", urgent: false, ended: true };
  const days = Math.floor(diff / 86_400_000);
  return {
    label: tempoRestante(diff),
    urgent: days <= 3,
    ended: false,
  };
}

/** Volume em dólar, em português (MKT-09) — o mesmo formatador do resto do site. */
export function formatVolume(v: number): string {
  return dolar(v);
}

// EV e Kelly moravam aqui (calcEV/calcKelly) e em mais dois lugares. Hoje a
// conta é uma só: client/src/lib/edge.ts. Não recriar.
