/**
 * brand.ts — números e claims de marca em FONTE ÚNICA, para nunca divergirem
 * entre telas. A auditoria pegou "16 modelos" em algumas telas e "20 modelos"
 * em outras (às vezes na mesma tela) para a MESMA coisa — corrói a credibilidade.
 *
 * A biblioteca de modelos que a IA seleciona vive no prompt de
 * server/lib/ai/modelPredict.ts e tem ~41 modelos nomeados em 9 domínios.
 * Usamos "mais de 30" de propósito: é sempre defensável (mesmo na contagem mais
 * conservadora) e evergreen — não quebra se a biblioteca for ajustada.
 */
export const MODEL_COUNT = "mais de 30";
