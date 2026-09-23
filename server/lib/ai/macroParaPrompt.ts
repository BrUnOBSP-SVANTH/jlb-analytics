/**
 * Os números da macro, como eles vão para o prompt da IA.
 *
 * DOIS DEFEITOS NUM LUGAR SÓ (Auditoria 21/09, IAC-04).
 *
 * 1. DADO INVENTADO. Quando a API do Banco Central falhava, o prompt completava
 *    sozinho: `Selic ${selic ?? "~10.5"}% | IPCA ${ipca ?? "~4.8"}% | USD/BRL
 *    ${usd ?? "~5.85"}`. A IA recebia isso como se fosse a realidade e escrevia
 *    análise em cima — num site cuja regra de casa é "se a fonte não responde, a
 *    tela diz que não respondeu". Pior: o número de reserva ENVELHECE. A Selic
 *    de "~10,5%" ficou parada enquanto a real subia, e ninguém percebia, porque
 *    não havia erro nenhum: havia um número.
 *
 * 2. NÚMERO FORA DO PADRÃO DA CASA. Mesmo quando o BCB respondia, o prompt
 *    mandava "13.75" e "5.1117", e o briefing publicava "Selic em 13.75%" e
 *    "dólar a R$ 5.1117" — ponto decimal e quatro casas, em português. O texto
 *    que a IA gera sai daqui: se o número entra errado, ele sai errado na tela.
 *
 * A regra: sem dado, o prompt diz "indisponível". Com dado, ele vai formatado
 * em pt-BR, pela mesma fonte única que a tela usa (`shared/formato.ts`).
 */
import { num, reaisExatos } from "../../../shared/formato.ts";

export interface MacroDoPrompt {
  /** Selic ao ano, em % (ex.: 13.75). */
  selic?: number | null;
  /** IPCA ao ano, em % (ex.: 4.87). */
  ipca?: number | null;
  /** USD/BRL (ex.: 5.1117). */
  usd?: number | null;
}

/** "indisponível" não é enfeite: é o que impede a IA de inventar em cima. */
const INDISPONIVEL = "indisponível";

const valido = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);

export function macroParaPrompt(m: MacroDoPrompt): string {
  const partes: string[] = [];
  if (m.selic !== undefined) {
    partes.push(`Selic ${valido(m.selic) ? `${num(m.selic, 2)}% a.a.` : INDISPONIVEL}`);
  }
  if (m.ipca !== undefined) {
    partes.push(`IPCA ${valido(m.ipca) ? `${num(m.ipca, 2)}% a.a.` : INDISPONIVEL}`);
  }
  if (m.usd !== undefined) {
    // Câmbio com DUAS casas: "R$ 5,1117" é precisão que ninguém usa para falar
    // de dólar, e ela vazava para o texto publicado.
    partes.push(`USD/BRL ${valido(m.usd) ? reaisExatos(m.usd) : INDISPONIVEL}`);
  }
  return partes.join(" | ");
}
