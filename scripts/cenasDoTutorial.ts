/**
 * cenasDoTutorial.ts — o roteiro do vídeo de ajuda, numa lista só.
 *
 * POR QUE ISTO É DADO E NÃO CÓDIGO SOLTO DENTRO DO GRAVADOR. Vídeo de produto
 * apodrece mais rápido que qualquer outra peça do site: basta um botão mudar de
 * nome e a narração passa a descrever uma tela que não existe mais — e ninguém
 * percebe, porque ninguém reassiste o próprio tutorial. Em 27/09/2026 o
 * cabeçalho das 22 telas foi reescrito num único commit; um vídeo gravado na
 * véspera já estaria errado.
 *
 * Então a fala e a filmagem saem da MESMA lista:
 *
 *   · `pnpm tutorial` lê estas cenas, dirige o navegador e grava o site real;
 *   · o mesmo arquivo gera o TUTORIAL.md, que é o texto que o fundador narra;
 *   · `cenasDoTutorial.test.ts` prende as duas pontas — cena apontando para rota
 *     que não existe, ou narração prometendo retorno, reprovam no `pnpm test`.
 *
 * Refilmar depois de mexer numa tela é rodar `pnpm tutorial` de novo. Reescrever
 * a narração é editar aqui.
 */

/** Um passo dentro de uma cena. Declarativo de propósito: o gravador traduz. */
export type Passo =
  | { acao: "esperar"; ms: number }
  | { acao: "rolar"; ate: number } // fração da página: 0 é o topo, 1 é o fim
  | { acao: "clicar"; papel: "link" | "button" | "tab"; nome: string }
  | { acao: "arrastar"; campo: string; para: number } // slider, 0..1 do curso
  | { acao: "digitar"; campo: string; texto: string }
  | { acao: "abrirPrimeiroMercado" };

export interface Cena {
  id: string;
  rota: string;
  /** A legenda na tela — quem assiste sem som precisa entender mesmo assim. */
  legenda: string;
  /** O que o fundador fala por cima. É isto que vai para o TUTORIAL.md. */
  narracao: string;
  passos: Passo[];
  /**
   * Cena que só existe para quem entrou. Sem `TUTORIAL_EMAIL`/`TUTORIAL_SENHA`
   * o gravador filma a tela do visitante — que também é verdade, é o que a
   * pessoa vê antes de criar conta — e marca a pendência no roteiro.
   */
  precisaConta?: boolean;
}

/**
 * O percurso do visitante novo, e depois as ferramentas que ele usa com as
 * próprias mãos. Os cinco Níveis ficaram de fora de propósito: são texto longo,
 * e texto longo em vídeo é pior que texto longo lido.
 */
export const CENAS: readonly Cena[] = [
  {
    id: "abertura",
    rota: "/",
    legenda: "O que é o JLB Analytics",
    narracao:
      "Este é o JLB Analytics. Ele faz três coisas: mostra ao vivo o que os maiores mercados de " +
      "previsão do mundo estão prevendo, ensina você a calcular as chances por conta própria, e " +
      "publica o histórico completo dos nossos acertos e dos nossos erros. Vou te mostrar o " +
      "caminho inteiro em menos de quatro minutos.",
    passos: [
      { acao: "esperar", ms: 1200 },
      { acao: "rolar", ate: 0.25 },
      { acao: "rolar", ate: 0.5 },
      { acao: "esperar", ms: 800 },
    ],
  },
  {
    id: "mercados",
    rota: "/mercados",
    legenda: "Mercados ao vivo — Polymarket e Kalshi",
    narracao:
      "Aqui estão os mercados ao vivo. Cada card é um evento do mundo real, e o número grande é a " +
      "probabilidade que o mercado está dando para ele acontecer. Isso não é opinião nossa: é o " +
      "preço que milhares de pessoas estão pagando agora, e ele muda sozinho ao longo do dia. A " +
      "busca no topo filtra por assunto — e o atalho dela é a tecla barra.",
    passos: [
      { acao: "esperar", ms: 1500 },
      { acao: "digitar", campo: "Buscar mercados", texto: "eleição" },
      { acao: "esperar", ms: 1500 },
      { acao: "rolar", ate: 0.35 },
    ],
  },
  {
    id: "mercado-detalhe",
    rota: "/mercados",
    legenda: "Dentro de um mercado",
    narracao:
      "Clicando num mercado você vê o histórico do preço, o volume negociado e o prazo. Repare no " +
      "gráfico: o que ele mostra é como a opinião coletiva mudou ao longo do tempo. Uma virada " +
      "brusca quase sempre tem uma notícia atrás — e é exatamente isso que a próxima ferramenta " +
      "vai investigar.",
    passos: [
      { acao: "esperar", ms: 1200 },
      { acao: "abrirPrimeiroMercado" },
      { acao: "esperar", ms: 2500 },
      { acao: "rolar", ate: 0.3 },
    ],
  },
  {
    id: "analise-ia",
    rota: "/mercados",
    legenda: "A análise por IA — e o limite dela",
    narracao:
      "Esta é a análise por IA. Ela lê notícias reais e compara o evento com casos parecidos do " +
      "passado para estimar um valor justo. E aqui eu preciso ser honesto sobre uma limitação, " +
      "porque ela está escrita na própria tela: a IA parte do preço do mercado e não se afasta " +
      "mais de quinze pontos percentuais dele. É uma trava deliberada contra excesso de " +
      "confiança. O preço dessa trava é que o Edge que você vê aqui tem teto. Trate isso como uma " +
      "segunda opinião fundamentada, com as fontes à mostra — nunca como recomendação de compra.",
    passos: [
      { acao: "esperar", ms: 1000 },
      { acao: "abrirPrimeiroMercado" },
      { acao: "esperar", ms: 2000 },
      { acao: "rolar", ate: 0.55 },
      { acao: "esperar", ms: 2000 },
    ],
    precisaConta: true,
  },
  {
    id: "calculadoras",
    rota: "/calculadoras",
    legenda: "Calculadoras: Valor Esperado e Kelly",
    narracao:
      "Agora as ferramentas. A primeira é o Valor Esperado, e ela é a mais importante do site " +
      "inteiro. A pergunta que ela responde é: se eu repetisse esta mesma decisão mil vezes, eu " +
      "sairia no lucro ou no prejuízo? Você põe a sua estimativa de chance de um lado, a odd " +
      "oferecida do outro, e ela te diz. A maioria das pessoas perde dinheiro aqui não por falta " +
      "de intuição, mas por nunca ter feito essa conta. A aba do lado, Kelly, responde a pergunta " +
      "seguinte: dado que vale a pena, quanto da banca eu arrisco.",
    passos: [
      { acao: "esperar", ms: 1200 },
      { acao: "clicar", papel: "tab", nome: "Valor Esperado" },
      { acao: "esperar", ms: 1500 },
      { acao: "rolar", ate: 0.4 },
      { acao: "esperar", ms: 1500 },
      { acao: "clicar", papel: "tab", nome: "Kelly" },
      { acao: "esperar", ms: 2000 },
    ],
  },
  {
    id: "simulador",
    rota: "/simulador",
    legenda: "Simulador: o que a sorte faz com o método",
    narracao:
      "O simulador mostra uma coisa que a conta sozinha não mostra: a variação. Arraste a sua " +
      "chance real de ganhar e veja a curva se mexer. Mesmo com o Valor Esperado positivo, você " +
      "vai passar por sequências ruins — e é justamente nelas que as pessoas abandonam o método. " +
      "Ver isso acontecer antes de viver isso é metade do aprendizado.",
    passos: [
      { acao: "esperar", ms: 1200 },
      { acao: "arrastar", campo: "Sua chance real de ganhar", para: 0.62 },
      { acao: "esperar", ms: 1800 },
      { acao: "arrastar", campo: "Número de rodadas", para: 0.85 },
      { acao: "esperar", ms: 2000 },
      { acao: "rolar", ate: 0.35 },
    ],
  },
  {
    id: "banca",
    rota: "/portfolio",
    legenda: "Banca Simulada — dinheiro fictício, mercado real",
    narracao:
      "Por último, a banca simulada. Você recebe um saldo fictício e registra posições em mercados " +
      "de verdade, pelo preço de verdade — você não escolhe o preço. Quando o mercado resolve, o " +
      "site liquida a sua posição pelo resultado oficial da plataforma, não por um chute nosso. É " +
      "onde você descobre, sem arriscar nada, se o seu método está funcionando.",
    passos: [
      { acao: "esperar", ms: 1500 },
      { acao: "rolar", ate: 0.3 },
      { acao: "esperar", ms: 1500 },
    ],
    precisaConta: true,
  },
  {
    id: "fecho",
    rota: "/track-record",
    legenda: "O histórico completo — inclusive os erros",
    narracao:
      "E é aqui que o círculo fecha. Todo acerto e todo erro das nossas previsões ficam nesta " +
      "página, medidos pelo resultado oficial de quem liquidou o mercado. Quando a gente erra, " +
      "está aqui. Comece pelo Nível 1 na trilha de educação — é grátis, e é de onde tudo o que eu " +
      "te mostrei passa a fazer sentido.",
    passos: [
      { acao: "esperar", ms: 1500 },
      { acao: "rolar", ate: 0.3 },
      { acao: "esperar", ms: 1500 },
    ],
  },
];

/** Quanto tempo a cena ocupa de filme, somando os passos e a leitura da fala. */
export function segundosDaCena(cena: Cena): number {
  const dosPassos = cena.passos.reduce((s, p) => {
    if (p.acao === "esperar") return s + p.ms / 1000;
    if (p.acao === "rolar") return s + 1.6; // a rolagem é suave, leva tempo
    if (p.acao === "digitar") return s + p.texto.length * 0.09 + 0.5;
    if (p.acao === "arrastar") return s + 1.4;
    return s + 1.2;
  }, 0);
  // Narração em ritmo de locução calma: ~2,6 palavras por segundo. Se a fala é
  // mais longa que a ação, é ela que manda — senão o vídeo corta a frase no meio.
  const daFala = (cena.narracao.split(/\s+/).length / 2.6);
  return Math.ceil(Math.max(dosPassos, daFala));
}

const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

/**
 * O roteiro que o fundador lê na hora de narrar (`scripts/gravar-tutorial.mjs`
 * grava em TUTORIAL.md). Sai daqui para não existir uma segunda versão da fala.
 */
export function roteiroEmMarkdown(): string {
  const total = CENAS.reduce((s, c) => s + segundosDaCena(c), 0);
  let acumulado = 0;

  const corpo = CENAS.map((cena, i) => {
    const inicio = acumulado;
    acumulado += segundosDaCena(cena);
    const conta = cena.precisaConta
      ? "\n> ⚠️ **Precisa de conta.** Sem `TUTORIAL_EMAIL`/`TUTORIAL_SENHA` o gravador filma a tela\n> do visitante (o convite para entrar), não a tela de dentro.\n"
      : "";
    return [
      `## ${i + 1}. ${cena.legenda}`,
      ``,
      `**${mmss(inicio)} – ${mmss(acumulado)}** · rota \`${cena.rota}\` · cena \`${cena.id}\``,
      conta,
      `${cena.narracao}`,
      ``,
    ].join("\n");
  }).join("\n");

  return [
    `# Roteiro do vídeo de ajuda`,
    ``,
    `> Gerado por \`pnpm tutorial\` a partir de [scripts/cenasDoTutorial.ts](scripts/cenasDoTutorial.ts).`,
    `> **Não edite este arquivo à mão** — edite as cenas e rode de novo, senão a fala`,
    `> e a filmagem divergem, que é o defeito que este formato existe para impedir.`,
    ``,
    `Duração estimada da narração: **${mmss(total)}** em ${CENAS.length} cenas.`,
    `O vídeo sai **sem áudio**: a locução é gravada por cima, seguindo os tempos abaixo.`,
    ``,
    `---`,
    ``,
    corpo,
  ].join("\n");
}
