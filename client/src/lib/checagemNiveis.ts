/**
 * A checagem de aprendizagem de cada nível.
 *
 * O QUE ISTO SUBSTITUI (Auditoria 21/09, APR-02). Um nível era dado como
 * concluído quando QUALQUER calculadora dele devolvia resultado. Já foi pior —
 * antes bastava abrir a página —, mas apertar "calcular" com os valores que já
 * estavam no campo não é aprendizado: é um clique com mais passos. E o site
 * usa "nível concluído" para medir a trilha, para dar 10 pontos e para dizer à
 * pessoa onde ela está. Medir clique e chamar de aprendizado é a versão
 * educacional de inventar número — justamente o que esta plataforma existe
 * para não fazer.
 *
 * A REGRA. Três perguntas por nível, cada uma com explicação, 2 de 3 para
 * concluir. Quem erra vê por que errou e pode refazer: o objetivo é aprender,
 * não filtrar.
 *
 * COMO AS PERGUNTAS FORAM ESCRITAS, e por que importa:
 *
 *  · cada uma responde algo que o PRÓPRIO nível ensina, na ordem em que ensina;
 *  · as erradas são erros que alguém comete de verdade — "acertar mais da
 *    metade garante lucro", "correlação alta prova causa" —, não alternativas
 *    absurdas que se descartam sem saber a matéria;
 *  · quatro alternativas, e não duas: com V/F, chutar as três passa 50% das
 *    vezes; com quatro, 16%. Continua sendo possível passar chutando, e tudo
 *    bem — isto é uma checagem de leitura, não uma prova.
 *
 * A explicação aparece DEPOIS de responder, certo ou errado. É onde a checagem
 * vira aula: o erro é a hora em que a pessoa está mais pronta para a correção.
 */

export interface PerguntaDaChecagem {
  /** O enunciado. Curto: quem está no celular lê tudo sem rolar. */
  pergunta: string;
  alternativas: string[];
  /** Índice da correta em `alternativas`. */
  correta: number;
  /** Por que é essa — e, quando ajuda, por que as outras enganam. */
  explicacao: string;
}

/** Quantas das três bastam para concluir o nível. */
export const ACERTOS_PARA_CONCLUIR = 2;

export const CHECAGEM_POR_NIVEL: Record<number, PerguntaDaChecagem[]> = {
  1: [
    {
      pergunta: "Um mercado paga R$ 1 se o evento acontecer. O preço do SIM é R$ 0,40 e você acha que a chance real é 50%. Qual é o valor esperado de cada R$ 1 apostado?",
      alternativas: [
        "+R$ 0,25 — você ganha 25 centavos por real, em média",
        "+R$ 0,10 — a diferença entre 50% e 40%",
        "−R$ 0,20 — o preço está caro",
        "Zero — preço e probabilidade se anulam",
      ],
      correta: 0,
      explicacao: "EV por real = probabilidade ÷ preço − 1 = 0,50 ÷ 0,40 − 1 = +0,25. O erro comum é subtrair (50% − 40% = 10 pp): isso é a VANTAGEM em pontos percentuais, não o retorno. Os dois números são úteis e dizem coisas diferentes.",
    },
    {
      pergunta: "Numa casa de apostas, os dois lados de um jogo têm probabilidades implícitas de 55% e 52%. O que esses 107% significam?",
      alternativas: [
        "A margem da casa: 7 pontos percentuais cobrados de quem aposta",
        "Que um dos dois preços está errado e vai ser corrigido",
        "Que o jogo tem chance de empate de 7%",
        "Um erro de arredondamento do site",
      ],
      correta: 0,
      explicacao: "Probabilidade real soma 100%. O que passa disso é o overround — o quanto a casa cobra. Por isso o mesmo jogo custa mais numa casa que num mercado de previsão: lá a soma fica perto de 100% e quem ganha é a contraparte, não a plataforma.",
    },
    {
      pergunta: "Um teste acerta 99% dos casos e a doença atinge 1 em 1.000 pessoas. Você testou positivo. Qual a chance de estar doente?",
      alternativas: [
        "Cerca de 9% — a raridade da doença domina",
        "99% — é a precisão do teste",
        "50% — ou está ou não está",
        "1% — é a frequência da doença",
      ],
      correta: 0,
      explicacao: "É Bayes. Em 1.000 pessoas: 1 doente (testa positivo) e ~10 saudáveis com falso positivo. Você é 1 entre ~11, ou seja, ~9%. Confundir a precisão do teste com a chance de estar doente é o erro de base rate — e é o mesmo erro de quem lê uma notícia forte e esquece quão raro era o evento.",
    },
  ],
  2: [
    {
      pergunta: "Uma série tem média 50 e desvio padrão 10. Hoje o valor foi 75. Qual é o z-score?",
      alternativas: [
        "2,5 — está 2,5 desvios acima da média",
        "25 — é a diferença para a média",
        "1,5 — é a razão entre 75 e 50",
        "0,5 — metade do desvio",
      ],
      correta: 0,
      explicacao: "z = (valor − média) ÷ desvio = (75 − 50) ÷ 10 = 2,5. O z-score serve para comparar anomalias de séries com escalas diferentes: 2,5 desvios é raro em qualquer uma delas, seja de preço, de gols ou de temperatura.",
    },
    {
      pergunta: "Uma pesquisa mostra 52% com margem de erro de ±3 pp. O que dá para afirmar?",
      alternativas: [
        "Que o valor real está provavelmente entre 49% e 55% — e o empate não está descartado",
        "Que o candidato tem 52% de chance de vencer",
        "Que 52% é o valor real, com 3% de erro de medição",
        "Que quem está com 48% já perdeu",
      ],
      correta: 0,
      explicacao: "O intervalo cobre de 49% a 55%, e 50% está dentro dele — tecnicamente empate. Duas armadilhas aqui: intenção de voto não é probabilidade de vitória (são coisas diferentes), e a margem quase sempre é publicada para 95% de confiança, não para certeza.",
    },
    {
      pergunta: "Duas séries têm correlação de Pearson r = 0,9. O que isso garante?",
      alternativas: [
        "Que andam juntas de forma LINEAR — nada sobre uma causar a outra",
        "Que uma causa a outra em 90% dos casos",
        "Que 90% das vezes as duas sobem juntas",
        "Que a relação entre elas é forte, seja qual for o formato",
      ],
      correta: 0,
      explicacao: "Correlação mede associação linear, e só. Séries temporais que crescem sozinhas produzem r altíssimo sem nenhuma relação (vendas de sorvete e afogamentos: o que liga as duas é o calor). E uma relação forte em forma de U pode dar r ≈ 0 — o coeficiente não a enxerga.",
    },
  ],
  3: [
    {
      pergunta: "Para que serve a Regra de Taylor num mercado sobre a próxima decisão de juros?",
      alternativas: [
        "Dar uma referência do juro que a inflação e o hiato do produto sugerem",
        "Prever a decisão exata do banco central",
        "Calcular quanto o mercado vai se mover depois do anúncio",
        "Medir se a inflação vai subir no próximo mês",
      ],
      correta: 0,
      explicacao: "A regra é uma âncora: dado o desvio da inflação e o hiato do produto, qual juro seria coerente. Ela não decide nada — o banco central pode divergir, e diverge. Serve para você ter um número próprio antes de olhar o preço do mercado.",
    },
    {
      pergunta: "Por que o modelo de Poisson para futebol costuma vir com a correção de Dixon-Coles?",
      alternativas: [
        "Porque Poisson puro subestima placares baixos como 0×0 e 1×1",
        "Porque Poisson não aceita números inteiros",
        "Porque Dixon-Coles inclui a torcida da casa",
        "Porque Poisson só funciona para times de mesma força",
      ],
      correta: 0,
      explicacao: "Poisson trata os gols dos dois times como independentes, e no futebol real eles não são: placares travados aparecem mais do que o modelo espera. Dixon-Coles ajusta exatamente essas caixas. Vale lembrar do nosso próprio backtest: nem com o ajuste esses modelos bateram a baseline no Brasileirão.",
    },
    {
      pergunta: "O que um modelo GARCH está dizendo quando indica volatilidade alta?",
      alternativas: [
        "Que a amplitude dos movimentos tende a continuar grande — sem dizer a direção",
        "Que o preço tende a cair",
        "Que o preço tende a subir",
        "Que o mercado está errado e vai corrigir",
      ],
      correta: 0,
      explicacao: "GARCH modela agrupamento de volatilidade: dia agitado costuma ser seguido de dia agitado. É sobre TAMANHO do movimento, nunca sobre o sentido. Quem lê volatilidade como direção está inventando uma informação que o modelo não deu.",
    },
  ],
  4: [
    {
      pergunta: "Segundo a Prospect Theory, como as pessoas tratam ganhos e perdas do mesmo tamanho?",
      alternativas: [
        "A perda dói cerca de duas vezes mais do que o ganho equivalente agrada",
        "Ganho e perda pesam igual, só mudam de sinal",
        "O ganho agrada mais do que a perda dói",
        "Depende só do tamanho absoluto do valor",
      ],
      correta: 0,
      explicacao: "É a aversão à perda, e ela explica comportamento que parece irracional: segurar posição perdedora para não 'realizar' o prejuízo, ou aceitar risco ruim para recuperar o que já foi. Saber disso não elimina o viés — ajuda a reconhecê-lo em você.",
    },
    {
      pergunta: "Você previu 80% e o evento aconteceu. Qual é o Brier Score dessa previsão?",
      alternativas: [
        "0,04 — o erro ao quadrado, e quanto menor melhor",
        "0,80 — é a probabilidade que você deu",
        "0,20 — é o quanto você errou",
        "1,00 — você acertou",
      ],
      correta: 0,
      explicacao: "Brier = (previsão − resultado)² = (0,8 − 1)² = 0,04. Menor é melhor, e zero é perfeito. Ele pune o excesso de confiança: dizer 100% e errar custa 1,00, o pior valor possível. Por isso é a métrica honesta para quem publica probabilidade.",
    },
    {
      pergunta: "Uma moeda honesta deu cara cinco vezes seguidas. Qual a chance de coroa agora?",
      alternativas: [
        "50% — a moeda não guarda memória",
        "Maior que 50%, porque coroa está 'atrasada'",
        "Menor que 50%, porque cara está 'quente'",
        "Não dá para saber sem mais lançamentos",
      ],
      correta: 0,
      explicacao: "É a falácia do jogador. Eventos independentes não se compensam — a moeda não sabe o que saiu antes. A armadilha aparece disfarçada: 'esse time perdeu cinco, agora vai ganhar'. Se as chances mudam mesmo, é porque algo REAL mudou (lesão, escalação), não porque a sequência 'deve' virar.",
    },
  ],
  5: [
    {
      pergunta: "Seu modelo diz 70% e o mercado precifica 55%. O que essa divergência significa?",
      alternativas: [
        "Um sinal para investigar: ou o mercado sabe algo que o modelo não sabe, ou o contrário",
        "Um sinal de compra — o mercado está barato",
        "Que o modelo está errado, porque o mercado costuma acertar mais",
        "Que a diferença vai fechar sozinha em poucos dias",
      ],
      correta: 0,
      explicacao: "É o princípio central do Nível 5. Divergência não é recomendação: é uma pergunta. A sua função é descobrir qual dos dois está certo — e, em geral, o mercado tem informação que o seu modelo não tem. Este site não recomenda posição em nenhum caso.",
    },
    {
      pergunta: "Por que juntar vários modelos num ensemble costuma prever melhor que o melhor modelo isolado?",
      alternativas: [
        "Porque erros independentes tendem a se cancelar",
        "Porque o modelo mais forte domina a média",
        "Porque mais modelos significam mais dados",
        "Porque a média sempre fica mais perto do meio",
      ],
      correta: 0,
      explicacao: "Se os modelos erram por razões diferentes, a média dos erros encolhe. A condição é essa — independência. Cinco modelos que cometem o MESMO erro não formam um ensemble: formam o mesmo modelo cinco vezes, com mais confiança e nenhuma informação a mais.",
    },
    {
      pergunta: "O que significa um Skill Score negativo em relação ao mercado?",
      alternativas: [
        "Que as suas previsões foram PIORES que simplesmente seguir o preço do mercado",
        "Que você errou mais da metade das previsões",
        "Que a sua taxa de acerto caiu no período",
        "Que faltam previsões resolvidas para medir",
      ],
      correta: 0,
      explicacao: "Skill Score compara o seu Brier com o Brier de uma referência — aqui, o preço do mercado. Negativo quer dizer que dava para ir melhor copiando o mercado. É desconfortável e é o ponto: sem uma referência, qualquer taxa de acerto parece boa.",
    },
  ],
};

/** As perguntas de um nível, ou lista vazia se ele não tem checagem. */
export function checagemDoNivel(n: number): PerguntaDaChecagem[] {
  return CHECAGEM_POR_NIVEL[n] ?? [];
}

/** Passou? A régua é a mesma para todos os níveis. */
export function passouNaChecagem(acertos: number): boolean {
  return acertos >= ACERTOS_PARA_CONCLUIR;
}
