/**
 * Helpers puros da tela de detalhe de mercado. Extraido de pages/MarketDetail.tsx.
 */
import { tempoRestante } from "@shared/formato";
import { volumeNaMoeda } from "@shared/plataforma";
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

/**
 * Volume na unidade da fonte (MKT-09, UXP-02) — o mesmo formatador do resto do
 * site. A `fonte` não é opcional por preguiça: sem ela, volume do Kalshi sai
 * com "US$" na frente e multiplica o número por até cem.
 */
export function formatVolume(v: number, fonte: string | null | undefined): string {
  return volumeNaMoeda(v, fonte);
}

// EV e Kelly moravam aqui (calcEV/calcKelly) e em mais dois lugares. Hoje a
// conta é uma só: client/src/lib/edge.ts. Não recriar.

/**
 * O NOME DA LINHA do gráfico de histórico (Auditoria 21/09, UXP-02).
 *
 * O gráfico dizia "Prob SIM" sempre. Num mercado de 12 desfechos não existe
 * "SIM": a série vem de `clobTokenIds[0]`, ou seja, do PRIMEIRO desfecho — a
 * tela mostrava a linha de um candidato com o nome de outro conceito, e quem
 * lesse concluiria que o mercado inteiro estava em 8%.
 */
export function nomeDaSerie(desfechos?: ReadonlyArray<{ label: string }> | null): string {
  if (!desfechos || desfechos.length <= 1) return "SIM";
  return desfechos[0]?.label?.trim() || "Desfecho";
}
