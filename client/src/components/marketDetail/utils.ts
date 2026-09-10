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
