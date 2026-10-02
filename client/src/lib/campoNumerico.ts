/**
 * O número que dá para tirar do que a pessoa DIGITOU — ou nenhum.
 *
 * 🔴 POR QUE EXISTE (01/10/2026). As duas calculadoras centrais do site — Valor
 * Esperado e Kelly — guardavam no estado o NÚMERO, e não o texto do campo. Com
 * um `<input type="number">` controlado, isso faz o campo brigar com quem digita:
 *
 *   · Valor Esperado: `if (isNaN(v)) return`. Apagar o "55" gera `""`, que não é
 *     número, a mudança é ignorada e o React devolve o 55 na hora. Digitar "60"
 *     em seguida dá "5560".
 *   · Kelly: `parseFloat(texto) || 1`. Apagar a probabilidade a faz virar 1;
 *     digitar "60" dá "160", e o `Math.min(99, …)` corta para 99. A pessoa
 *     escreve 60%, a tela mostra 99%, e a recomendação sai calculada sobre 99% —
 *     errada, e em silêncio.
 *
 * Quem achou foi o vídeo tutorial, ao passar a USAR as calculadoras do jeito que
 * uma pessoa usa. Medido no navegador depois: 5 dos 48 campos numéricos do site,
 * todos nessas duas telas. Os outros 43 já guardavam o texto e derivavam o
 * número — é o padrão que funciona, e é o que esta função serve.
 *
 * Vazio NÃO vira zero: devolve `null`, e a tela mostra "—" até o campo ser
 * preenchido. Zero inventado faria a calculadora afirmar "EV zero — posição
 * justa" sobre um campo que a pessoa só estava trocando.
 */
export function numeroDoCampo(texto: string): number | null {
  const t = texto.trim();
  if (t === "") return null;
  // Vírgula ou ponto: o `<input type="number">` do Chromium em pt-BR entrega
  // com ponto, mas o mesmo valor pode chegar de um campo de texto com vírgula.
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** O texto inicial de um campo a partir de um número (o estado guarda texto). */
export const textoDoNumero = (n: number): string => String(n);
