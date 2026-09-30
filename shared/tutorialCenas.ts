/**
 * tutorialCenas.ts — capítulos e metadados do vídeo tutorial do JLB Analytics.
 *
 * POR QUE COMPARTILHADO EM @shared:
 * O vídeo é filmado por scripts/gravar-tutorial.mjs, mas é consumido pelo
 * cliente (TutorialModal.tsx) para renderizar a lista de capítulos, a barra de
 * progresso, a transcrição/legenda dinâmica e o salto temporal direto.
 *
 * Manter os capítulos aqui impede que o índice do modal no cliente discorde
 * dos timestamps e textos gerados no TUTORIAL.md pelo gravador.
 */

export interface CapituloTutorial {
  id: string;
  titulo: string;
  rota: string;
  inicioSegundos: number;
  fimSegundos: number;
  narracao: string;
  resumo: string;
}

export const DURACAO_TOTAL_SEGUNDOS = 215; // 03:35

export const CAPITULOS_TUTORIAL: readonly CapituloTutorial[] = [
  {
    id: "abertura",
    titulo: "1. O que é o JLB Analytics",
    rota: "/",
    inicioSegundos: 0,
    fimSegundos: 22,
    resumo: "Mercados preditivos em tempo real, cálculo racional de chances e transparência total de acertos e erros.",
    narracao:
      "Este é o JLB Analytics. Ele faz três coisas: mostra ao vivo o que os maiores mercados de previsão do mundo estão prevendo, ensina você a calcular as chances por conta própria, e publica o histórico completo dos nossos acertos e dos nossos erros. Vou te mostrar o caminho inteiro em menos de quatro minutos.",
  },
  {
    id: "mercados",
    titulo: "2. Mercados ao vivo",
    rota: "/mercados",
    inicioSegundos: 22,
    fimSegundos: 49,
    resumo: "Cards de eventos reais, probabilidade implícita e busca rápida com a tecla barra (/).",
    narracao:
      "Aqui estão os mercados ao vivo. Cada card é um evento do mundo real, e o número grande é a probabilidade que o mercado está dando para ele acontecer. Isso não é opinião nossa: é o preço que milhares de pessoas estão pagando agora, e ele muda sozinho ao longo do dia. A busca no topo filtra por assunto — e o atalho dela é a tecla barra.",
  },
  {
    id: "mercado-detalhe",
    titulo: "3. Dentro de um mercado",
    rota: "/mercados",
    inicioSegundos: 49,
    fimSegundos: 69,
    resumo: "Histórico de preços em gráfico, volume negociado e prazo de resolução.",
    narracao:
      "Clicando num mercado você vê o histórico do preço, o volume negociado e o prazo. Repare no gráfico: o que ele mostra é como a opinião coletiva mudou ao longo do tempo. Uma virada brusca quase sempre tem uma notícia atrás — e é exatamente isso que a próxima ferramenta vai investigar.",
  },
  {
    id: "analise-ia",
    titulo: "4. A análise por IA e o limite dela",
    rota: "/mercados",
    inicioSegundos: 69,
    fimSegundos: 107,
    resumo: "Segunda opinião fundamentada com notícias reais e a trava de segurança de 15 pp contra excesso de confiança.",
    narracao:
      "Esta é a análise por IA. Ela lê notícias reais e compara o evento com casos parecidos do passado para estimar um valor justo. E aqui eu preciso ser honesto sobre uma limitação, porque ela está escrita na própria tela: a IA parte do preço do mercado e não se afasta mais de quinze pontos percentuais dele. É uma trava deliberada contra excesso de confiança. O preço dessa trava é que o Edge que você vê aqui tem teto. Trate isso como uma segunda opinião fundamentada, com as fontes à mostra — nunca como recomendação de compra.",
  },
  {
    id: "calculadoras",
    titulo: "5. Calculadoras: EV e Kelly",
    rota: "/calculadoras",
    inicioSegundos: 107,
    fimSegundos: 144,
    resumo: "Valor Esperado para saber se a decisão é lucrativa no longo prazo, e Kelly para dimensionar a banca.",
    narracao:
      "Agora as ferramentas. A primeira é o Valor Esperado, e ela é a mais importante do site inteiro. A pergunta que ela responde é: se eu repetisse esta mesma decisão mil vezes, eu sairia no lucro ou no prejuízo? Você põe a sua estimativa de chance de um lado, a odd oferecida do outro, e ela te diz. A maioria das pessoas perde dinheiro aqui não por falta de intuição, mas por nunca ter feito essa conta. A aba do lado, Kelly, responde a pergunta seguinte: dado que vale a pena, quanto da banca eu arrisco.",
  },
  {
    id: "simulador",
    titulo: "6. Simulador e a variância",
    rota: "/simulador",
    inicioSegundos: 144,
    fimSegundos: 168,
    resumo: "Simulação de Monte Carlo para enxergar drawdowns e como a sorte afeta o método na prática.",
    narracao:
      "O simulador mostra uma coisa que a conta sozinha não mostra: a variação. Arraste a sua chance real de ganhar e veja a curva se mexer. Mesmo com o Valor Esperado positivo, você vai passar por sequências ruins — e é justamente nelas que as pessoas abandonam o método. Ver isso acontecer antes de viver isso é metade do aprendizado.",
  },
  {
    id: "banca",
    titulo: "7. Banca Simulada",
    rota: "/portfolio",
    inicioSegundos: 168,
    fimSegundos: 192,
    resumo: "Dinheiro fictício em mercados reais com liquidação oficial, sem arriscar capital.",
    narracao:
      "Por último, a banca simulada. Você recebe um saldo fictício e registra posições em mercados de verdade, pelo preço de verdade — você não escolhe o preço. Quando o mercado resolve, o site liquida a sua posição pelo resultado oficial da plataforma, não por um chute nosso. É onde você descobre, sem arriscar nada, se o seu método está funcionando.",
  },
  {
    id: "fecho",
    titulo: "8. Track Record e Trilha Educacional",
    rota: "/track-record",
    inicioSegundos: 192,
    fimSegundos: 215,
    resumo: "Histórico auditado de acertos e erros via Brier Score e convite para a Trilha de Educação.",
    narracao:
      "E é aqui que o círculo fecha. Todo acerto e todo erro das nossas previsões ficam nesta página, medidos pelo resultado oficial de quem liquidou o mercado. Quando a gente erra, está aqui. Comece pelo Nível 1 na trilha de educação — é grátis, e é de onde tudo o que eu te mostrei passa a fazer sentido.",
  },
];

/** Formata segundos em MM:SS. */
export function formatarTempo(segundos: number): string {
  const s = Math.max(0, Math.floor(segundos));
  const min = Math.floor(s / 60);
  const seg = s % 60;
  return `${String(min).padStart(2, "0")}:${String(seg).padStart(2, "0")}`;
}

/** Descobre qual capítulo está ativo para um determinado tempo do vídeo. */
export function capituloPorSegundo(segundos: number): CapituloTutorial {
  const encontrado = CAPITULOS_TUTORIAL.find(
    (c) => segundos >= c.inicioSegundos && segundos < c.fimSegundos
  );
  return encontrado ?? CAPITULOS_TUTORIAL[CAPITULOS_TUTORIAL.length - 1];
}

