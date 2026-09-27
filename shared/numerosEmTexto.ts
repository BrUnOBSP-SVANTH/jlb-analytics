/**
 * Conserta o número decimal escrito em formato americano DENTRO de um texto.
 *
 * POR QUE ISTO EXISTE (varredura de 27/09/2026, /briefing). O Briefing Diário
 * publicava, em português:
 *
 *     "a taxa Selic está em 13.75%, a inflação oficial pelo IPCA marca 4.22%
 *      e o dólar custa R$ 5.1991"
 *
 * Três números com ponto decimal num texto em pt-BR, e um câmbio com quatro
 * casas — precisão que ninguém usa para falar de dólar.
 *
 * E o mais importante: NÃO foi descuido de quem escreveu o prompt. O prompt já
 * manda os números certos ("Selic 13,75% a.a. | USD/BRL R$ 5,20", via
 * `macroParaPrompt`, que existe justamente por causa de uma correção anterior
 * deste mesmo defeito). O modelo recebe a vírgula e devolve o ponto, porque é
 * assim que ele aprendeu a escrever número. Pedir de novo, com mais ênfase, não
 * resolve — instrução de prompt não é garantia, é pedido.
 *
 * Por isso a correção fica na SAÍDA, onde é determinística.
 *
 * ⚠️ O QUE ESTA FUNÇÃO NÃO PODE ESTRAGAR, e é o motivo de a regra ser estreita:
 * versão ("v1.2.3"), endereço IP, domínio, horário, hora com fuso e qualquer
 * ponto que tenha OUTRO ponto por perto. Só um grupo isolado de dígito-ponto-
 * dígito vira vírgula, e só quando não há um terceiro grupo encostado.
 */

/**
 * Um decimal solto: dígitos, um ponto, dígitos.
 *
 * O que cada guarda faz — e a terceira só existe porque a primeira versão
 * errou justamente na frase que este módulo veio consertar:
 *
 *  · `(?<![\d.])`  nada de dígito nem ponto ANTES  → descarta o "168" de
 *                  "192.168.0.1" e o "2" de "v1.2.3";
 *  · `(?!\d)`      nada de dígito logo depois      → garante que a captura
 *                  pegou o decimal inteiro;
 *  · `(?!\.\d)`    o que vem depois não é outro grupo de dígitos → descarta
 *                  "1.2" em "1.2.3", mas ACEITA "R$ 5,1991." no fim da frase.
 *                  A guarda anterior era `(?![\d.])`, que rejeitava qualquer
 *                  ponto seguinte — inclusive o ponto final. Resultado: os dois
 *                  primeiros números da frase eram corrigidos e o terceiro,
 *                  o último da oração, ficava para trás.
 *
 * 🔴 E a quarta guarda, `(?<!:)`, existe porque esta função QUEBROU A TELA em
 * produção no dia em que nasceu (27/09/2026).
 *
 * O briefing publicava "Gerado em Invalid Date". O `generatedAt` vinha como
 * `2026-09-27T12:09:04,937Z` — vírgula antes dos milissegundos. Era esta
 * função: em `12:09:04.937`, o "04" não tem dígito nem ponto antes (tem dois
 * pontos), e o "937" é seguido de "Z". Passou nas três guardas, virou
 * `04,937`, e `new Date()` rejeita o formato.
 *
 * A guarda de ano não pegava porque só olha grupos de 4 dígitos.
 */
const DECIMAL_SOLTO = /(?<![\d.:])(\d+)\.(\d+)(?!\d)(?!\.\d)/g;

/**
 * Carimbo de tempo ISO-8601 — o campo que NÃO é prosa.
 *
 * A guarda do `:` acima já salva o horário dentro de uma frase. Esta é a
 * segunda camada, e existe porque o defeito real não foi a regex: foi aplicar
 * um corretor de TEXTO a todo campo de string de um objeto, inclusive os que a
 * máquina escreveu para a máquina ler.
 */
const CARIMBO_ISO = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;

/**
 * Troca o ponto decimal pela vírgula em todo número solto do texto.
 *
 * Não arredonda e não mexe em nada além do separador: arredondar texto de
 * terceiro é inventar precisão que ele não afirmou.
 */
export function virgulaDecimal(texto: string): string {
  // Carimbo de tempo não é prosa e não se conserta: sai inteiro.
  if (CARIMBO_ISO.test(texto)) return texto;
  return texto.replace(DECIMAL_SOLTO, (inteiro, antes: string, depois: string) => {
    // Ano seguido de mês ("2024.01") e qualquer inteiro de 4 dígitos que possa
    // ser ano ficam de fora: não é decimal, é data escrita de forma esquisita.
    if (antes.length === 4 && Number(antes) >= 1900 && Number(antes) <= 2100) return inteiro;
    return `${antes},${depois}`;
  });
}

/**
 * Aplica a correção a cada campo de texto de um objeto, um nível de
 * profundidade e dentro de arrays de objetos — o formato de um briefing.
 *
 * Números de verdade (o campo `prob`, por exemplo) não são tocados: eles não
 * são texto, e quem os formata para a tela é `shared/formato.ts`.
 */
export function virgulaDecimalNoObjeto<T>(valor: T): T {
  if (typeof valor === "string") return virgulaDecimal(valor) as T;
  if (Array.isArray(valor)) return valor.map(virgulaDecimalNoObjeto) as T;
  if (valor && typeof valor === "object") {
    const saida: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(valor)) saida[k] = virgulaDecimalNoObjeto(v);
    return saida as T;
  }
  return valor;
}
