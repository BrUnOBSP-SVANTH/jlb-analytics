/**
 * cenasDoTutorial.ts — o roteiro dos vídeos de ajuda, numa lista só.
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
 *   · `pnpm tutorial` lê estes filmes, dirige o navegador e grava o site real;
 *   · o mesmo arquivo gera o TUTORIAL.md (o texto narrado) e o
 *     `shared/tutorialCenas.ts` (o índice de capítulos do player, com os tempos
 *     MEDIDOS na gravação);
 *   · `cenasDoTutorial.test.ts` prende as pontas — rota que não existe, alvo de
 *     clique que sumiu do código, narração prometendo retorno.
 *
 * 🔴 O QUE MUDOU EM 01/10/2026, e por quê.
 *
 * O pedido do fundador era "um vídeo realmente mostrando todas as funções do
 * site e TESTANDO elas". A versão anterior não testava nada: na cena das
 * calculadoras ela clicava nas abas e rolava a página, sem digitar um número.
 * E duas das oito cenas filmaram a tela de VISITANTE enquanto a narração
 * descrevia a de dentro — a da Banca dizia "você recebe um saldo fictício" sobre
 * uma tela que mostrava "entre para receber R$ 1.000,00 fictícios".
 *
 * Agora:
 *
 *   · são FILMES curtos por área, além do geral — cada um refilma sozinho quando
 *     a tela dele muda, e quem quer ver só os Duelos não procura o minuto certo;
 *   · toda cena que usa uma ferramenta tem `verificar`: o resultado que a tela
 *     TEM de mostrar. Se não aparecer, o filme não sai — e o relatório diz qual
 *     passo falhou. Um vídeo mostrando uma função quebrada não é publicado;
 *   · filme que precisa de conta só é gravado COM conta. Sem credencial ele é
 *     pulado com o motivo escrito, em vez de filmar o convite para entrar.
 *
 * A prova de que verificar vale a pena veio na primeira rodada: ao apertar
 * "Calcular margem" no Nível 1, a tela dizia "7,44%" e, logo abaixo, "7.44%" e
 * "R$7.44". A `pnpm varredura` nunca tinha visto — o texto só existe depois do
 * clique, e ela abre as telas sem apertar nada.
 */

/** Um passo dentro de uma cena. Declarativo de propósito: o gravador traduz. */
export type Passo =
  | { acao: "esperar"; ms: number }
  | { acao: "rolar"; ate: number } // fração da página: 0 é o topo, 1 é o fim
  /** Rola até o elemento que contém o texto ficar no meio da tela. */
  | { acao: "rolarAte"; texto: string }
  /**
   * `exato` existe porque o Playwright casa NOME por substring: "Calcular"
   * acharia "Calcular margem" antes. Casar token por substring já mordeu este
   * repositório quatro vezes.
   */
  | { acao: "clicar"; papel: "link" | "button" | "tab"; nome: string; exato?: boolean }
  | { acao: "arrastar"; campo: string; para: number } // slider, 0..1 do curso
  /**
   * Campo por RÓTULO (o nome acessível) ou, se não houver, por placeholder.
   * `indice` para rótulos repetidos — a calculadora de valor esperado tem um
   * "Probabilidade (%)" por cenário.
   */
  | { acao: "digitar"; campo: string; texto: string; indice?: number }
  | { acao: "abrirPrimeiroMercado" }
  /**
   * O TESTE. Espera o texto aparecer em QUALQUER lugar da página (inclusive em
   * modal, que mora fora do `<main>`), e o destaca no vídeo para quem assiste
   * ver o que foi conferido. Não apareceu no prazo → o filme falha.
   *
   * `texto` é a fonte de uma regex, sem diferenciar maiúsculas: rótulo com
   * `uppercase` no CSS sai em caixa alta no innerText.
   */
  | { acao: "verificar"; texto: string; prazoMs?: number };

export interface Cena {
  id: string;
  /** Onde a cena começa — e o "Abrir tela" do player. */
  rota: string;
  /**
   * Não navega: continua na página deixada pela cena anterior. Recarregar
   * apagaria o que a cena de antes fez (a conta calculada, a aba aberta).
   */
  mesmaPagina?: boolean;
  /** O título do capítulo — aparece no começo da cena e no índice do player. */
  legenda: string;
  /** O que é narrado. Vai para o TUTORIAL.md, para a voz e para o player. */
  narracao: string;
  passos: Passo[];
}

export interface Filme {
  id: string;
  titulo: string;
  /** Uma linha, para o seletor de vídeos do player. */
  resumo: string;
  /**
   * Só grava com `TUTORIAL_EMAIL` e `TUTORIAL_SENHA`. Sem eles o filme é PULADO —
   * nunca mais filmado como visitante com a narração de dentro.
   */
  precisaConta: boolean;
  /**
   * A cena cujo FIM vira a capa do vídeo — o quadro que aparece antes do play.
   * Era o primeiro quadro, e o filme geral, que começa na página inicial, virava
   * uma foto da página inicial DENTRO da página inicial: parecia um embed
   * quebrado. A capa boa é o momento em que algo foi conferido na tela.
   */
  capa: string;
  cenas: Cena[];
}

export const FILMES: readonly Filme[] = [
  {
    id: "geral",
    titulo: "Visão geral do JLB Analytics",
    resumo: "O percurso de quem chega agora: mercados, calculadoras, simulador e o nosso histórico.",
    precisaConta: false,
    capa: "valor-esperado",
    cenas: [
      {
        id: "abertura",
        rota: "/",
        legenda: "O que é o JLB Analytics",
        narracao:
          "Este é o JLB Analytics. Ele faz três coisas: mostra ao vivo o que os maiores mercados de " +
          "previsão do mundo estão dizendo, ensina você a calcular as chances por conta própria, e " +
          "publica o histórico completo dos nossos acertos e dos nossos erros. Neste vídeo eu uso " +
          "cada ferramenta de verdade, com números de verdade.",
        passos: [
          { acao: "esperar", ms: 2000 },
          { acao: "verificar", texto: "Preveja melhor" },
          { acao: "esperar", ms: 3000 },
          { acao: "rolar", ate: 0.2 },
          { acao: "esperar", ms: 2000 },
          { acao: "rolar", ate: 0.4 },
          { acao: "esperar", ms: 2000 },
          { acao: "rolar", ate: 0.6 },
          { acao: "esperar", ms: 3000 },
          { acao: "rolar", ate: 0.8 },
          { acao: "esperar", ms: 2000 },
        ],
      },
      {
        id: "mercados",
        rota: "/mercados",
        legenda: "Mercados ao vivo",
        narracao:
          "Aqui estão os mercados ao vivo do Polymarket, do Kalshi e do Manifold. O número grande é " +
          "a probabilidade que o mercado dá para o evento acontecer — não é opinião nossa, é o preço " +
          "que as pessoas estão pagando agora. E a busca entende português: eu escrevo eleição, e ela " +
          "encontra os mercados de eleição, mesmo os que estão escritos em inglês.",
        passos: [
          { acao: "esperar", ms: 2000 },
          { acao: "rolar", ate: 0.2 },
          { acao: "esperar", ms: 2500 },
          { acao: "rolar", ate: 0.4 },
          { acao: "esperar", ms: 3000 },
          { acao: "rolar", ate: 0.1 },
          { acao: "esperar", ms: 2000 },
          { acao: "digitar", campo: "Buscar mercados", texto: "eleição" },
          { acao: "esperar", ms: 1500 },
          { acao: "verificar", texto: "president|election|eleiç" },
          { acao: "esperar", ms: 2000 },
        ],
      },
      {
        id: "mercado-detalhe",
        rota: "/mercados",
        legenda: "Dentro de um mercado",
        narracao:
          "Abrindo um mercado, você vê o histórico do preço, o volume negociado e o prazo. O gráfico " +
          "mostra como a opinião coletiva mudou com o tempo — uma virada brusca quase sempre tem uma " +
          "notícia atrás. Mais abaixo está a regra de resolução, no texto original da plataforma: é " +
          "ela que decide quem ganha, e por isso a gente não traduz.",
        passos: [
          { acao: "esperar", ms: 1000 },
          { acao: "abrirPrimeiroMercado" },
          { acao: "esperar", ms: 2000 },
          { acao: "verificar", texto: "Histórico de Probabilidade" },
          { acao: "esperar", ms: 2000 },
          { acao: "rolar", ate: 0.2 },
          { acao: "esperar", ms: 2000 },
          { acao: "rolar", ate: 0.4 },
          { acao: "esperar", ms: 2000 },
          { acao: "rolarAte", texto: "Como este mercado resolve" },
          { acao: "esperar", ms: 1500 },
          { acao: "verificar", texto: "Como este mercado resolve" },
          { acao: "esperar", ms: 2000 },
          { acao: "rolar", ate: 0.9 },
          { acao: "esperar", ms: 1500 },
        ],
      },
      {
        id: "valor-esperado",
        rota: "/calculadoras",
        legenda: "Calculadora de valor esperado",
        narracao:
          "Agora as ferramentas, começando pela mais importante do site: o valor esperado. A pergunta " +
          "é: se eu repetisse esta mesma posição muitas vezes, sairia no lucro ou no prejuízo? Vou " +
          "testar. Cem reais, sessenta por cento de chance de dar certo e quarenta de dar errado, com " +
          "odd dois — se acertar, recebo o dobro. A conta dá vinte reais positivos por posição. Repare " +
          "que as duas chances somam cem: se não somarem, a calculadora avisa em vez de dar um número " +
          "errado.",
        passos: [
          { acao: "esperar", ms: 1500 },
          { acao: "clicar", papel: "tab", nome: "Valor Esperado" },
          { acao: "esperar", ms: 3000 },
          { acao: "digitar", campo: "Probabilidade (%)", indice: 0, texto: "60" },
          { acao: "esperar", ms: 1500 },
          { acao: "digitar", campo: "Probabilidade (%)", indice: 1, texto: "40" },
          { acao: "esperar", ms: 1500 },
          { acao: "digitar", campo: "Odd (retorno total)", indice: 0, texto: "2" },
          { acao: "esperar", ms: 1000 },
          { acao: "verificar", texto: "\\+R\\$\\s?20,00" },
          { acao: "esperar", ms: 2000 },
          { acao: "digitar", campo: "Probabilidade (%)", indice: 1, texto: "50" },
          { acao: "esperar", ms: 1500 },
          { acao: "verificar", texto: "110,0%" },
          { acao: "esperar", ms: 1500 },
          { acao: "digitar", campo: "Probabilidade (%)", indice: 1, texto: "40" },
          { acao: "esperar", ms: 1500 },
          { acao: "verificar", texto: "\\+R\\$\\s?20,00" },
          { acao: "esperar", ms: 1000 },
        ],
      },
      {
        id: "kelly",
        rota: "/calculadoras",
        mesmaPagina: true,
        legenda: "Kelly: quanto da banca arriscar",
        narracao:
          "A aba do lado responde a pergunta seguinte: se vale a pena, quanto da banca eu coloco? Com " +
          "cinquenta e cinco por cento de chance e odd dois, o critério de Kelly diz que o máximo " +
          "matemático é dez por cento. E a própria tela recomenda usar só uma fração disso, porque a " +
          "sua estimativa de chance também pode estar errada.",
        passos: [
          { acao: "esperar", ms: 1000 },
          { acao: "clicar", papel: "tab", nome: "Kelly" },
          { acao: "esperar", ms: 2000 },
          { acao: "digitar", campo: "Sua estimativa de probabilidade (%)", texto: "55" },
          { acao: "esperar", ms: 1000 },
          { acao: "digitar", campo: "Odd decimal oferecida", texto: "2" },
          { acao: "esperar", ms: 2000 },
          { acao: "verificar", texto: "10,0%" },
          { acao: "esperar", ms: 2000 },
          { acao: "rolar", ate: 0.3 },
          { acao: "esperar", ms: 2000 },
          { acao: "verificar", texto: "½ Kelly" },
          { acao: "esperar", ms: 2000 },
        ],
      },
      {
        id: "simulador",
        rota: "/simulador",
        legenda: "Simulador: o que a sorte faz com o método",
        narracao:
          "O simulador mostra o que a conta sozinha não mostra: a variação. Mesmo com o valor " +
          "esperado positivo, a curva passa por sequências ruins — e é nelas que as pessoas abandonam " +
          "o método. Cada nova amostra é um caminho diferente para a mesma conta. Ver isso acontecer " +
          "antes de viver isso é metade do aprendizado.",
        passos: [
          { acao: "esperar", ms: 1500 },
          { acao: "arrastar", campo: "Sua chance real de ganhar", para: 0.60 },
          { acao: "esperar", ms: 1500 },
          { acao: "arrastar", campo: "Número de rodadas", para: 0.85 },
          { acao: "esperar", ms: 2000 },
          { acao: "clicar", papel: "button", nome: "Sortear nova amostra" },
          { acao: "esperar", ms: 2000 },
          { acao: "clicar", papel: "button", nome: "Sortear nova amostra" },
          { acao: "esperar", ms: 2000 },
          { acao: "verificar", texto: "EV teórico" },
          { acao: "esperar", ms: 1500 },
        ],
      },
      {
        id: "fecho",
        rota: "/track-record",
        legenda: "O histórico completo — inclusive os erros",
        narracao:
          "E aqui o círculo fecha. Toda previsão da nossa IA é registrada antes de o mercado " +
          "resolver, e medida pelo resultado oficial da plataforma — inclusive quando a gente erra, e " +
          "a tela diz quanto. A análise por IA e a banca simulada ficam com uma conta grátis, e têm " +
          "vídeos próprios. Para começar, o melhor caminho é a trilha de educação.",
        passos: [
          { acao: "esperar", ms: 2000 },
          { acao: "verificar", texto: "taxa de acerto" },
          { acao: "esperar", ms: 2000 },
          { acao: "rolar", ate: 0.3 },
          { acao: "esperar", ms: 2500 },
          { acao: "rolar", ate: 0.5 },
          { acao: "esperar", ms: 3000 },
          { acao: "rolar", ate: 0.8 },
          { acao: "esperar", ms: 2000 },
          { acao: "rolar", ate: 1.0 },
          { acao: "esperar", ms: 2000 },
        ],
      },
    ],
  },

  {
    id: "trilha",
    titulo: "A trilha de aprendizado",
    resumo: "Os cinco níveis, com as calculadoras do Nível 1 e a checagem de cada nível.",
    precisaConta: false,
    capa: "nivel1-checagem",
    cenas: [
      {
        id: "educacao",
        rota: "/educacao",
        legenda: "A trilha: cinco níveis",
        narracao:
          "A trilha tem cinco níveis, do valor esperado até a análise que junta tudo. Os dois " +
          "primeiros são grátis. Cada nível tem calculadoras de verdade — não é texto para ler, é " +
          "conta para fazer — e termina com uma checagem.",
        passos: [
          { acao: "verificar", texto: "Do Fundamento à Análise Integrada" },
          { acao: "rolar", ate: 0.35 },
          { acao: "esperar", ms: 1200 },
        ],
      },
      {
        id: "nivel1-margem",
        rota: "/nivel/1",
        legenda: "Nível 1: a margem da casa",
        narracao:
          "No nível um, a primeira calculadora mostra o que quase ninguém vê: a margem da casa. Com " +
          "odds de dois e dez, três e cinquenta e três e vinte, as chances embutidas somam mais de " +
          "cem por cento. Os sete vírgula quarenta e quatro por cento que sobram são o que você paga " +
          "só para participar — antes de qualquer resultado.",
        passos: [
          { acao: "esperar", ms: 1000 },
          { acao: "clicar", papel: "button", nome: "Calcular margem", exato: true },
          // 1/2,10 + 1/3,50 + 1/3,20 = 1,074405 → 7,44%
          { acao: "verificar", texto: "Margem da casa: 7,44%" },
          { acao: "esperar", ms: 1500 },
        ],
      },
      {
        id: "nivel1-checagem",
        rota: "/nivel/1",
        mesmaPagina: true,
        legenda: "A checagem do nível",
        narracao:
          "E cada nível termina com uma checagem. O SIM custa quarenta centavos e você acha que a " +
          "chance real é cinquenta por cento: quanto vale cada real apostado? Vinte e cinco centavos " +
          "— e o erro comum é responder dez, subtraindo as porcentagens. A explicação aparece na " +
          "hora, com a conta escrita.",
        passos: [
          { acao: "rolarAte", texto: "Checagem do nível" },
          { acao: "esperar", ms: 1500 },
          { acao: "clicar", papel: "button", nome: "+R$ 0,25" },
          // EV por real = 0,50 ÷ 0,40 − 1 = +0,25
          { acao: "verificar", texto: "0,50 ÷ 0,40" },
          { acao: "esperar", ms: 2000 },
        ],
      },
      {
        id: "nivel5",
        rota: "/nivel/5",
        legenda: "Nível 5: a análise integrada",
        narracao:
          "No último nível tudo se junta: modelos, mercado e notícia na mesma leitura. O sistema " +
          "nunca diz o que fazer — mostra onde os modelos divergem do mercado e por quê, e deixa a " +
          "decisão com você.",
        passos: [
          { acao: "verificar", texto: "Análise Integrada" },
          { acao: "rolar", ate: 0.3 },
          { acao: "esperar", ms: 1500 },
        ],
      },
    ],
  },

  {
    id: "previsao",
    titulo: "Previsão guiada por IA",
    resumo: "Você escreve o que quer prever; a IA escolhe o modelo e mostra a conta por trás.",
    precisaConta: true,
    capa: "previsao-resultado",
    cenas: [
      {
        id: "previsao-pedido",
        rota: "/previsao",
        legenda: "Previsão guiada por IA",
        narracao:
          "Com uma conta grátis, a previsão guiada por IA fica liberada. Você escolhe a área, escreve " +
          "o que quer prever e o horizonte. Vou pedir a inflação nos próximos três meses.",
        passos: [
          { acao: "esperar", ms: 1000 },
          { acao: "clicar", papel: "button", nome: "Economia" },
          { acao: "digitar", campo: "O que você quer prever?", texto: "inflação nos próximos 3 meses" },
          { acao: "clicar", papel: "button", nome: "Médio prazo" },
          { acao: "clicar", papel: "button", nome: "Analisar com IA", exato: true },
          { acao: "verificar", texto: "Modelo selecionado", prazoMs: 90_000 },
        ],
      },
      {
        id: "previsao-resultado",
        rota: "/previsao",
        mesmaPagina: true,
        legenda: "O modelo e a conta por trás",
        narracao:
          "A IA não chuta um número: ela escolhe o modelo econométrico que serve para a pergunta e " +
          "mostra a fórmula e o artigo de onde ele vem. Dá para conferir cada passo — e é esse o " +
          "ponto. Uma estimativa que você não consegue conferir é só uma opinião com casas decimais.",
        passos: [
          { acao: "rolarAte", texto: "Modelo selecionado" },
          { acao: "esperar", ms: 2000 },
          { acao: "verificar", texto: "Fórmula" },
          { acao: "rolar", ate: 0.55 },
          { acao: "esperar", ms: 2000 },
        ],
      },
    ],
  },

  {
    id: "analise",
    titulo: "Análise de mercados",
    resumo: "Notícias cruzadas com os mercados, o briefing do dia e a análise por IA de um mercado.",
    precisaConta: true,
    capa: "analise-ia",
    cenas: [
      {
        id: "noticias",
        rota: "/noticias",
        legenda: "O contexto por trás do preço",
        narracao:
          "Na análise de mercados, os mesmos mercados aparecem cruzados com notícias, discussões e " +
          "os artigos do nosso Cérebro — o contexto que explica por que o preço está onde está.",
        passos: [
          { acao: "esperar", ms: 1200 },
          { acao: "clicar", papel: "button", nome: "Kalshi", exato: true },
          { acao: "verificar", texto: "Registrar previsão" },
          { acao: "rolar", ate: 0.3 },
          { acao: "esperar", ms: 1200 },
        ],
      },
      {
        id: "briefing",
        rota: "/briefing",
        legenda: "O briefing do dia",
        narracao:
          "Todo dia a IA escreve um briefing com o que mudou nos mercados e na economia brasileira. A " +
          "régua no topo mostra onde está a mediana dos mercados mais movimentados do dia.",
        passos: [
          { acao: "verificar", texto: "Mediana dos" },
          { acao: "esperar", ms: 1500 },
          { acao: "rolar", ate: 0.3 },
          { acao: "esperar", ms: 1200 },
        ],
      },
      {
        id: "analise-ia",
        rota: "/mercados",
        legenda: "A análise por IA — e o limite dela",
        narracao:
          "E dentro de qualquer mercado, a análise por IA lê notícias reais, compara com casos " +
          "parecidos do passado e estima um valor justo. Preciso ser honesto sobre o limite, porque " +
          "ele está escrito na tela: a IA parte do preço do mercado e não se afasta mais de quinze " +
          "pontos dele. É uma trava contra excesso de confiança. Trate a análise como uma segunda " +
          "opinião com as fontes à mostra — nunca como recomendação.",
        passos: [
          { acao: "abrirPrimeiroMercado" },
          { acao: "clicar", papel: "button", nome: "Analisar com IA", exato: true },
          { acao: "verificar", texto: "Fatores-chave", prazoMs: 90_000 },
          { acao: "rolarAte", texto: "Fatores-chave" },
          { acao: "esperar", ms: 2500 },
        ],
      },
    ],
  },

  {
    id: "conta",
    titulo: "Sua conta: banca simulada e calibração",
    resumo: "Mil reais fictícios em mercados reais, e o painel que mede se você está acertando.",
    precisaConta: true,
    capa: "dashboard",
    cenas: [
      {
        id: "banca",
        rota: "/portfolio",
        legenda: "Banca simulada — dinheiro fictício, mercado real",
        narracao:
          "Com a conta, você ganha uma banca de mil reais fictícios para registrar posições em " +
          "mercados de verdade, pelo preço de verdade — você não escolhe o preço. Quando o mercado " +
          "resolve, o site liquida a posição pelo resultado oficial da plataforma, não por um chute " +
          "nosso.",
        passos: [
          { acao: "verificar", texto: "Patrimônio" },
          { acao: "esperar", ms: 1500 },
          { acao: "rolar", ate: 0.3 },
          { acao: "esperar", ms: 1500 },
        ],
      },
      {
        id: "dashboard",
        rota: "/dashboard",
        legenda: "A sua calibração",
        narracao:
          "No painel você acompanha a sua calibração. O Brier Score mede o quanto as suas " +
          "probabilidades batem com o que aconteceu: zero é perfeito, e responder cinquenta por cento " +
          "em tudo dá zero vírgula vinte e cinco. É o número que diz se você está melhorando — ou só " +
          "tendo sorte.",
        passos: [
          { acao: "verificar", texto: "Brier" },
          { acao: "esperar", ms: 1500 },
          { acao: "rolar", ate: 0.35 },
          { acao: "esperar", ms: 1500 },
        ],
      },
    ],
  },

  {
    id: "duelos",
    titulo: "Duelos de previsão",
    resumo: "Previsões seladas sobre os mesmos mercados — vence o menor Brier. Por pontos, sem dinheiro.",
    precisaConta: true,
    capa: "duelos",
    cenas: [
      {
        id: "duelos",
        rota: "/duelos",
        legenda: "Duelos de previsão",
        narracao:
          "Nos duelos, duas pessoas — ou você contra a nossa IA — fazem previsões seladas sobre os " +
          "mesmos mercados, e ninguém vê a do outro antes do fim. Quando tudo resolve, vence quem " +
          "teve o menor Brier. É um beta valendo pontos, sem dinheiro de verdade.",
        passos: [
          { acao: "verificar", texto: "Lobby" },
          { acao: "esperar", ms: 1200 },
          { acao: "clicar", papel: "tab", nome: "Como funciona" },
          { acao: "verificar", texto: "Brier" },
          { acao: "esperar", ms: 2000 },
        ],
      },
    ],
  },
];

/** Todas as cenas, com o filme de cada uma — para o que olha o roteiro inteiro. */
export function todasAsCenas(): Array<Cena & { filme: string }> {
  return FILMES.flatMap((f) => f.cenas.map((c) => ({ ...c, filme: f.id })));
}

/**
 * Quanto tempo a cena ocupa de filme, ESTIMADO, somando os passos e a leitura
 * da fala. Serve para o TUTORIAL.md e para o limite de atenção do teste. O tempo
 * que vai para o player e para a voz é o MEDIDO na gravação — uma análise de IA
 * pode levar 5 segundos ou 40, e chute fixo dessincroniza a narração.
 */
export function segundosDaCena(cena: Cena): number {
  const dosPassos = cena.passos.reduce((s, p) => {
    if (p.acao === "esperar") return s + p.ms / 1000;
    if (p.acao === "rolar" || p.acao === "rolarAte") return s + 1.6; // a rolagem é suave, leva tempo
    if (p.acao === "digitar") return s + p.texto.length * 0.09 + 0.8;
    if (p.acao === "arrastar") return s + 1.4;
    if (p.acao === "verificar") return s + ((p.prazoMs ?? 0) > 20_000 ? 12 : 1.8); // inclui o destaque
    return s + 1.2;
  }, 0);
  // Narração em ritmo de locução calma: ~2,6 palavras por segundo. Se a fala é
  // mais longa que a ação, é ela que manda — senão o vídeo corta a frase no meio.
  const daFala = cena.narracao.split(/\s+/).length / 2.6;
  return Math.ceil(Math.max(dosPassos, daFala));
}

export function segundosDoFilme(filme: Filme): number {
  return filme.cenas.reduce((s, c) => s + segundosDaCena(c), 0);
}

const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

/**
 * O roteiro que o fundador lê (e que a voz sintética fala). Sai daqui para não
 * existir uma segunda versão da fala.
 */
export function roteiroEmMarkdown(): string {
  const blocos = FILMES.map((filme) => {
    let acumulado = 0;
    const cenas = filme.cenas.map((cena, i) => {
      const inicio = acumulado;
      acumulado += segundosDaCena(cena);
      const testes = cena.passos.filter((p) => p.acao === "verificar").length;
      return [
        `### ${i + 1}. ${cena.legenda}`,
        ``,
        `**${mmss(inicio)} – ${mmss(acumulado)}** · rota \`${cena.rota}\` · cena \`${cena.id}\`` +
          (testes ? ` · ${testes} verificação${testes > 1 ? "ões" : ""}` : ""),
        ``,
        cena.narracao,
        ``,
      ].join("\n");
    }).join("\n");
    return [
      `## ${filme.titulo}`,
      ``,
      `\`pnpm tutorial ${filme.id}\` · ${filme.cenas.length} cena${filme.cenas.length > 1 ? "s" : ""} · ` +
        `~${mmss(segundosDoFilme(filme))}` +
        (filme.precisaConta ? " · ⚠️ **precisa de conta** (`TUTORIAL_EMAIL` e `TUTORIAL_SENHA` no `.env`)" : ""),
      ``,
      `> ${filme.resumo}`,
      ``,
      cenas,
    ].join("\n");
  }).join("\n---\n\n");

  return [
    `# Roteiro dos vídeos de ajuda`,
    ``,
    `> Gerado a partir de [scripts/cenasDoTutorial.ts](scripts/cenasDoTutorial.ts).`,
    `> **Não edite este arquivo à mão** — edite as cenas e rode \`pnpm tutorial\`, senão a`,
    `> fala e a filmagem divergem, que é o defeito que este formato existe para impedir.`,
    ``,
    `${FILMES.length} vídeos. Os tempos abaixo são ESTIMADOS; os do player são medidos na gravação.`,
    `Toda cena com verificação é um teste: se o resultado esperado não aparece na tela, o vídeo`,
    `daquele filme não é produzido e o relatório diz qual passo falhou.`,
    ``,
    `---`,
    ``,
    blocos,
  ].join("\n");
}
