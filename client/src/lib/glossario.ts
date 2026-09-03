/**
 * glossario — fonte ÚNICA das explicações em linguagem simples.
 *
 * POR QUE EXISTE. O site é quantitativo e usa os termos certos (Brier, edge, fair
 * value, overround). Isso é uma qualidade — trocar por aproximações vagas tiraria
 * a precisão que é o produto. O problema era outro: o termo aparecia 1.300+ vezes
 * na interface e a explicação morava numa página só, a de Educação, que ninguém
 * visita no meio de uma análise.
 *
 * E as definições de lá eram TÉCNICAS: "Brier Score: métrica de calibração,
 * (1/n) Σ(previsão − resultado)²". Explicar com somatório não é explicar.
 *
 * A regra de escrita do campo `simples`: dizer o que o número SIGNIFICA PARA QUEM
 * LÊ, não repetir a fórmula. Se a frase não faz sentido para alguém que nunca
 * abriu um livro de estatística, ela não está pronta. O `tecnico` fica logo abaixo
 * para quem quer a definição exata — ninguém perde precisão, só ganha entrada.
 */

export interface Verbete {
  termo: string;
  /** Linguagem de gente. É o que aparece primeiro. */
  simples: string;
  /** A definição exata, para quem quiser. Opcional. */
  tecnico?: string;
}

export const GLOSSARIO: Record<string, Verbete> = {
  brier: {
    termo: "Brier",
    simples: "A nota das nossas previsões — quanto MENOR, melhor. Se dizemos “70% de chance” e a coisa acontece, erramos pouco. Se dizemos 70% e não acontece, erramos muito. Como referência: 0,25 é o mesmo que chutar 50% em tudo.",
    tecnico: "Média do quadrado da diferença entre a probabilidade prevista e o resultado (0 ou 1). Vai de 0 (perfeito) a 1.",
  },
  skill: {
    termo: "Skill",
    simples: "O quanto somos melhores (ou piores) que uma referência. Positivo = ganhamos dela. Negativo = perdemos. Zero = empate. Hoje empatamos com o mercado, e dizemos isso abertamente.",
    tecnico: "1 − (nosso Brier ÷ Brier da referência).",
  },
  "fair value": {
    termo: "Fair value",
    simples: "Quanto NÓS achamos que a chance realmente é, em porcentagem. O preço do mercado é o que os apostadores acham; o fair value é a nossa leitura.",
  },
  edge: {
    termo: "Edge",
    simples: "A diferença entre a nossa estimativa e o preço do mercado, em pontos percentuais. É onde discordamos — sinal para investigar, nunca ordem de aposta.",
    tecnico: "fair value − preço de mercado, em pp.",
  },
  calibracao: {
    termo: "Calibração",
    simples: "Se dissermos “70%” cem vezes, a coisa precisa acontecer umas 70 vezes. Quando isso bate, estamos calibrados. Quando dizemos 70% e só acontece 40 vezes, estamos otimistas demais.",
  },
  "base rate": {
    termo: "Taxa-base",
    simples: "Com que frequência algo desse tipo costuma acontecer, historicamente — antes de olhar qualquer detalhe do caso. É o ponto de partida honesto de qualquer previsão.",
  },
  kelly: {
    termo: "Kelly",
    simples: "Uma fórmula que diz qual FATIA do seu dinheiro faria sentido arriscar, dado o tamanho da sua vantagem. Serve para não apostar demais quando se está confiante. Aqui é usada só para ensinar.",
  },
  overround: {
    termo: "Overround",
    simples: "Quando você soma as chances que a casa oferece, dá mais de 100%. Esse excesso é o lucro embutido dela — você paga isso antes de o jogo começar.",
  },
  ev: {
    termo: "Valor esperado (EV)",
    simples: "Quanto você ganharia (ou perderia) EM MÉDIA se repetisse a mesma aposta muitas vezes. EV negativo significa que, no longo prazo, a conta fecha contra você.",
  },
  volume: {
    termo: "Volume",
    simples: "Quanto dinheiro já foi negociado nesse mercado. Volume alto = muita gente com dinheiro em jogo, e o preço tende a ser mais confiável. Volume zero = ninguém negociou, e o preço ali é só uma cotação, não uma opinião.",
  },
  bankroll: {
    termo: "Bankroll",
    simples: "O dinheiro que você separou só para apostar — e que você aguenta perder inteiro sem afetar sua vida. Nunca é o dinheiro do aluguel. Todo cálculo de tamanho de aposta parte dele.",
  },
  roi: {
    termo: "ROI",
    simples: "Quanto você ganha em relação ao que colocou. ROI de 10% significa que, para cada R$ 100 apostados, sobram R$ 10 de lucro em média. É uma expectativa de longo prazo, não uma promessa da próxima aposta.",
    tecnico: "Retorno sobre o investimento: lucro ÷ valor apostado.",
  },
  liquidez: {
    termo: "Liquidez",
    simples: "O quanto é fácil entrar e sair da posição sem mexer no preço. Pouca liquidez = você mesmo empurra o preço ao negociar.",
  },
  resolucao: {
    termo: "Resolução",
    simples: "O momento em que o mercado fecha e se sabe o resultado de verdade. Só contamos acerto quando a própria plataforma declara o desfecho oficial — nunca por estimativa nossa.",
  },
  divergencia: {
    termo: "Divergência",
    simples: "Um mercado em que a nossa leitura difere bastante do preço. É um convite a pesquisar aquele caso, não uma recomendação.",
  },
  elo: {
    termo: "Elo",
    simples: "Um sistema de pontuação de força de times, o mesmo do xadrez: quem vence de um adversário forte sobe mais do que quem vence de um fraco.",
  },
  "monte carlo": {
    termo: "Monte Carlo",
    simples: "Simular o mesmo cenário milhares de vezes com sorteios diferentes, para ver a distribuição dos resultados possíveis em vez de um número só.",
  },
  "desvio padrao": {
    termo: "Desvio padrão",
    simples: "O tamanho típico da variação em torno da média. Pequeno = resultados parecidos entre si; grande = resultados espalhados, e a média engana.",
  },
  "intervalo de confianca": {
    termo: "Intervalo de confiança",
    simples: "A faixa dentro da qual o valor real provavelmente está. Se a faixa inclui o zero, não dá para afirmar que existe efeito nenhum — pode ser só sorte da amostra.",
  },
};

/** Busca tolerante: aceita acento, caixa e plural simples. */
export function buscarVerbete(termo: string): Verbete | undefined {
  const chave = termo.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  return GLOSSARIO[chave] ?? GLOSSARIO[chave.replace(/s$/, "")];
}

/** Lista para a página de Educação — uma fonte só, sem definição duplicada. */
export const VERBETES = Object.values(GLOSSARIO);
