/**
 * Que movimento de preço merece virar alerta no sino.
 *
 * O QUE ACONTECIA (auditoria de 14/09/2026, item 29). O badge "9+" abria uma
 * lista inteiramente de tênis de mesa polonês do Kalshi: "Mateusz Trela wins
 * +11,5 pp", "Linek Adam wins −37,0 pp"… O corte era só de variação (≥3 pp), e
 * mercado sem liquidez oscila por qualquer negócio de dois contratos. Resultado:
 * o único canal de notificação do site ficava ocupado por ruído, e quem não
 * conhece a plataforma conclui que o alerta não vale a pena.
 *
 * O piso é por FONTE porque a unidade é diferente: o Kalshi conta contratos, o
 * Polymarket conta dólares negociados.
 *
 * Os números vieram do catálogo real (15/09/2026, 300 mercados do Kalshi):
 * mediana de 7.326 contratos, primeiro quartil em 2.256 — e o mercado de tênis
 * de mesa que a auditoria flagrou tinha 936. O corte de 5.000 fica entre o
 * quartil e a mediana: derruba o ruído e mantém 173 dos 300 mercados.
 */

/** Kalshi: contratos negociados. */
export const VOLUME_MINIMO_KALSHI = 5_000;

/** Polymarket: dólares negociados. */
export const VOLUME_MINIMO_POLYMARKET = 10_000;

/**
 * O movimento deste mercado pode virar alerta?
 *
 * Volume ausente NÃO passa: alerta é interrupção, e interromper alguém por um
 * mercado que não sabemos se tem gente dentro é o defeito que isto conserta.
 */
export function mercadoMereceAlerta(fonte: "kalshi" | "polymarket", volume: unknown): boolean {
  if (typeof volume !== "number" || !Number.isFinite(volume)) return false;
  return volume >= (fonte === "kalshi" ? VOLUME_MINIMO_KALSHI : VOLUME_MINIMO_POLYMARKET);
}
