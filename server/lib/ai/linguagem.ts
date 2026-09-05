/**
 * linguagem — o contrato de escrita de TODO texto da IA que um usuário vai ler.
 *
 * POR QUE EXISTE. Auditamos em 03/09 o que a IA realmente escreve e achamos duas
 * coisas piores que jargão:
 *
 *  1. Ela escrevia EM INGLÊS. Cinco de seis raciocínios amostrados estavam em
 *     inglês ("Australia's monthly unemployment rate is routinely published by the
 *     ABS...") — num site cujo público é brasileiro. O motivo é simples: o título
 *     do mercado vem em inglês das bolsas americanas, e o modelo segue a língua da
 *     pergunta quando ninguém manda o contrário.
 *  2. Onde escrevia em português, escrevia empilhado: "Sem informações específicas
 *     sobre o conteúdo esperado, a probabilidade de ele dizer algo concreto
 *     previsto é baixa, mas ainda há chance moderada de que...".
 *
 * E a instrução de linguagem simples existia em UM arquivo só (modelPredict), que
 * não é o que o usuário mais lê. Os prompts da análise de mercado, do briefing e do
 * cruzamento não tinham nem idioma nem orientação de estilo.
 *
 * Regra em um lugar só é regra; copiada em cinco vira cinco regras que divergem —
 * foi assim que o bug de substring voltou três vezes neste projeto.
 */

/**
 * Contrato mínimo. Entra em todo prompt cuja saída é lida por gente.
 *
 * Não proíbe o termo técnico: o site é quantitativo e a palavra exata é parte do
 * produto. Exige que ela venha TRADUZIDA na mesma frase — que é a diferença entre
 * escrever para quem já sabe e escrever para quem quer aprender.
 */
export const REGRA_LINGUAGEM = `
COMO ESCREVER (obrigatório):
- Responda SEMPRE em português do Brasil, mesmo que o título do mercado esteja em inglês.
- Escreva para alguém inteligente que nunca estudou estatística. Frases curtas, uma ideia por frase.
- Pode usar o termo técnico, mas explique na MESMA frase o que ele significa.
  Ruim: "o Brier de 0,14 indica boa calibração."
  Bom:  "erramos pouco: quando dizemos 70%, a coisa acontece perto de 70% das vezes."
- Nada de símbolo matemático (Σ, σ, ², ÷) no texto corrido. Se precisar de conta, descreva em palavras.
- NÚMERO SE ESCREVE COM ALGARISMO: "42%", "R$ 250", "14 dias". Nunca por extenso
  ("quarenta e dois porcento" é mais difícil de ler, não mais fácil) e nunca
  "porcento" escrito — use o símbolo %. Algarismo e % não são jargão: são como o
  brasileiro lê número. O que se traduz é o CONCEITO, não o dígito.
- Prefira o concreto ao abstrato: "de cada 10 vezes, acontece 7" em vez de "probabilidade de 0,7".
- Diga o que isso significa PARA QUEM LÊ, não como o cálculo funciona por dentro.
- Sem enrolação: nada de "é importante notar que" ou "vale mencionar".`;

/** Versão curta, para prompt onde cada token conta (seed, raciocínio de 1 frase). */
export const REGRA_LINGUAGEM_CURTA = `
ESCREVA EM PORTUGUÊS DO BRASIL (mesmo com o título em inglês), em uma frase curta e
simples, como se explicasse para um amigo que não é da área. Sem símbolo matemático.`;
