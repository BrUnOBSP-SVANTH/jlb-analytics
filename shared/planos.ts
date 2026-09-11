/**
 * Planos — as regras de produto que o servidor aplica e a página anuncia.
 *
 * POR QUE ISTO MORA EM `shared/`. O comentário da constante no servidor já
 * registrava o estrago: quando a cota existia em dois lugares, a interface
 * anunciou 30 análises enquanto o servidor bloqueava em 4. Agora a página
 * `/planos` promete exatamente o número que o middleware cobra, porque é o
 * mesmo símbolo — uma promessa de preço que não bate com o produto é a mais
 * cara de todas.
 *
 * O PREÇO NÃO ESTÁ AQUI, de propósito. Ele vem de `VITE_PREMIUM_PRECO_BRL` em
 * tempo de execução; sem a variável a página diz que o preço não está fechado.
 * Num site que se vende por não inventar número, um preço inventado na página
 * de preços seria a contradição mais cara possível.
 */

/** Análises de IA por mês na conta gratuita. O servidor cobra este número. */
export const COTA_GRATIS_MENSAL = 4;

/** Tudo que consome a cota — a página precisa dizer isto, senão o usuário
 *  descobre o limite no meio de um fluxo achando que era só a análise. */
export const CONSOME_COTA = [
  "a análise de um mercado",
  "a Previsão Guiada",
  "o Briefing",
] as const;
