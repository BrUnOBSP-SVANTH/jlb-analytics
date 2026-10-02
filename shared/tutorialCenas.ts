/**
 * tutorialCenas.ts — o índice dos vídeos de ajuda que o player usa.
 *
 * ⚠️ GERADO por `pnpm tutorial` (scripts/indiceDoTutorial.mjs). NÃO EDITE À MÃO.
 * A narração vem de scripts/cenasDoTutorial.ts e os tempos foram MEDIDOS na
 * gravação de cada vídeo. Até 01/10/2026 este arquivo era uma cópia escrita à
 * mão, com a fala duplicada e os tempos chutados — clicar num capítulo pulava
 * para a cena errada. Editar aqui reintroduz exatamente isso.
 *
 * Só está aqui o filme que foi gravado: o player não oferece vídeo que não existe.
 */

export interface CapituloTutorial {
  id: string;
  titulo: string;
  rota: string;
  inicioSegundos: number;
  fimSegundos: number;
  narracao: string;
}

export interface FilmeTutorial {
  id: string;
  titulo: string;
  resumo: string;
  precisaConta: boolean;
  duracaoSegundos: number;
  /** Gravado com voz? `pnpm tutorial --sem-audio` produz vídeo mudo. */
  comAudio: boolean;
  /** Dia da gravação — o player mostra, para ninguém confundir vídeo velho com novo. */
  gravadoEm: string;
  /** Começo do hash do arquivo: vai na URL para a regravação não servir vídeo velho do cache. */
  versao: string;
  capitulos: CapituloTutorial[];
}

/** De onde os arquivos são servidos (`TUTORIAL_VIDEO_BASE` na gravação). */
export const VIDEO_BASE = "/tutorial";

export const FILMES_TUTORIAL: readonly FilmeTutorial[] = /* DADOS */[
  {
    "id": "geral",
    "titulo": "Visão geral do JLB Analytics",
    "resumo": "O percurso de quem chega agora: mercados, calculadoras, simulador e o nosso histórico.",
    "precisaConta": false,
    "duracaoSegundos": 176.6,
    "comAudio": true,
    "gravadoEm": "2026-10-02",
    "versao": "f0ced6bb26",
    "capitulos": [
      {
        "id": "abertura",
        "titulo": "O que é o JLB Analytics",
        "rota": "/",
        "inicioSegundos": 0,
        "fimSegundos": 23.7,
        "narracao": "Este é o JLB Analytics. Ele faz três coisas: mostra ao vivo o que os maiores mercados de previsão do mundo estão dizendo, ensina você a calcular as chances por conta própria, e publica o histórico completo dos nossos acertos e dos nossos erros. Neste vídeo eu uso cada ferramenta de verdade, com números de verdade."
      },
      {
        "id": "mercados",
        "titulo": "Mercados ao vivo",
        "rota": "/mercados",
        "inicioSegundos": 23.7,
        "fimSegundos": 47.3,
        "narracao": "Aqui estão os mercados ao vivo do Polymarket, do Kalshi e do Manifold. O número grande é a probabilidade que o mercado dá para o evento acontecer — não é opinião nossa, é o preço que as pessoas estão pagando agora. E a busca entende português: eu escrevo eleição, e ela encontra os mercados de eleição, mesmo os que estão escritos em inglês."
      },
      {
        "id": "mercado-detalhe",
        "titulo": "Dentro de um mercado",
        "rota": "/mercados",
        "inicioSegundos": 47.3,
        "fimSegundos": 70.6,
        "narracao": "Abrindo um mercado, você vê o histórico do preço, o volume negociado e o prazo. O gráfico mostra como a opinião coletiva mudou com o tempo — uma virada brusca quase sempre tem uma notícia atrás. Mais abaixo está a regra de resolução, no texto original da plataforma: é ela que decide quem ganha, e por isso a gente não traduz."
      },
      {
        "id": "valor-esperado",
        "titulo": "Calculadora de valor esperado",
        "rota": "/calculadoras",
        "inicioSegundos": 70.6,
        "fimSegundos": 106,
        "narracao": "Agora as ferramentas, começando pela mais importante do site: o valor esperado. A pergunta é: se eu repetisse esta mesma posição muitas vezes, sairia no lucro ou no prejuízo? Vou testar. Cem reais, sessenta por cento de chance de dar certo e quarenta de dar errado, com odd dois — se acertar, recebo o dobro. A conta dá vinte reais positivos por posição. Repare que as duas chances somam cem: se não somarem, a calculadora avisa em vez de dar um número errado."
      },
      {
        "id": "kelly",
        "titulo": "Kelly: quanto da banca arriscar",
        "rota": "/calculadoras",
        "inicioSegundos": 106,
        "fimSegundos": 126.8,
        "narracao": "A aba do lado responde a pergunta seguinte: se vale a pena, quanto da banca eu coloco? Com cinquenta e cinco por cento de chance e odd dois, o critério de Kelly diz que o máximo matemático é dez por cento. E a própria tela recomenda usar só uma fração disso, porque a sua estimativa de chance também pode estar errada."
      },
      {
        "id": "simulador",
        "titulo": "Simulador: o que a sorte faz com o método",
        "rota": "/simulador",
        "inicioSegundos": 126.8,
        "fimSegundos": 149,
        "narracao": "O simulador mostra o que a conta sozinha não mostra: a variação. Mesmo com o valor esperado positivo, a curva passa por sequências ruins — e é nelas que as pessoas abandonam o método. Cada nova amostra é um caminho diferente para a mesma conta. Ver isso acontecer antes de viver isso é metade do aprendizado."
      },
      {
        "id": "fecho",
        "titulo": "O histórico completo — inclusive os erros",
        "rota": "/track-record",
        "inicioSegundos": 149,
        "fimSegundos": 176.6,
        "narracao": "E aqui o círculo fecha. Toda previsão da nossa IA é registrada antes de o mercado resolver, e medida pelo resultado oficial da plataforma — inclusive quando a gente erra, e a tela diz quanto. A análise por IA e a banca simulada ficam com uma conta grátis, e têm vídeos próprios. Para começar, o melhor caminho é a trilha de educação."
      }
    ]
  },
  {
    "id": "trilha",
    "titulo": "A trilha de aprendizado",
    "resumo": "Os cinco níveis, com as calculadoras do Nível 1 e a checagem de cada nível.",
    "precisaConta": false,
    "duracaoSegundos": 76.1,
    "comAudio": true,
    "gravadoEm": "2026-10-02",
    "versao": "25dbaee14d",
    "capitulos": [
      {
        "id": "educacao",
        "titulo": "A trilha: cinco níveis",
        "rota": "/educacao",
        "inicioSegundos": 0,
        "fimSegundos": 17.1,
        "narracao": "A trilha tem cinco níveis, do valor esperado até a análise que junta tudo. Os dois primeiros são grátis. Cada nível tem calculadoras de verdade — não é texto para ler, é conta para fazer — e termina com uma checagem."
      },
      {
        "id": "nivel1-margem",
        "titulo": "Nível 1: a margem da casa",
        "rota": "/nivel/1",
        "inicioSegundos": 17.1,
        "fimSegundos": 38.5,
        "narracao": "No nível um, a primeira calculadora mostra o que quase ninguém vê: a margem da casa. Com odds de dois e dez, três e cinquenta e três e vinte, as chances embutidas somam mais de cem por cento. Os sete vírgula quarenta e quatro por cento que sobram são o que você paga só para participar — antes de qualquer resultado."
      },
      {
        "id": "nivel1-checagem",
        "titulo": "A checagem do nível",
        "rota": "/nivel/1",
        "inicioSegundos": 38.5,
        "fimSegundos": 59.5,
        "narracao": "E cada nível termina com uma checagem. O SIM custa quarenta centavos e você acha que a chance real é cinquenta por cento: quanto vale cada real apostado? Vinte e cinco centavos — e o erro comum é responder dez, subtraindo as porcentagens. A explicação aparece na hora, com a conta escrita."
      },
      {
        "id": "nivel5",
        "titulo": "Nível 5: a análise integrada",
        "rota": "/nivel/5",
        "inicioSegundos": 59.5,
        "fimSegundos": 76.1,
        "narracao": "No último nível tudo se junta: modelos, mercado e notícia na mesma leitura. O sistema nunca diz o que fazer — mostra onde os modelos divergem do mercado e por quê, e deixa a decisão com você."
      }
    ]
  }
]/* FIM */;

export function urlDoVideo(filme: FilmeTutorial): string {
  return `${VIDEO_BASE}/${filme.id}.mp4?v=${filme.versao}`;
}

/** O quadro de abertura do filme, para o player não mostrar um retângulo preto. */
export function urlDaCapa(filme: FilmeTutorial): string {
  return `${VIDEO_BASE}/${filme.id}.jpg?v=${filme.versao}`;
}

/**
 * O vídeo que mora numa página: o filme cuja PRIMEIRA cena é nela. A regra
 * substitui uma tabela página→vídeo escrita à mão, que envelheceria a cada
 * mudança de roteiro. `undefined` quando o filme dali ainda não foi gravado —
 * e aí a página não mostra nada.
 */
export function filmeDaPagina(rota: string): FilmeTutorial | undefined {
  return FILMES_TUTORIAL.find((f) => f.capitulos[0]?.rota === rota);
}

/** Formata segundos em MM:SS. */
export function formatarTempo(segundos: number): string {
  const s = Math.max(0, Math.floor(segundos));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** O capítulo em curso num dado segundo do vídeo. */
export function capituloPorSegundo(filme: FilmeTutorial, segundos: number): CapituloTutorial {
  return filme.capitulos.find((c) => segundos >= c.inicioSegundos && segundos < c.fimSegundos)
    ?? filme.capitulos[filme.capitulos.length - 1];
}
