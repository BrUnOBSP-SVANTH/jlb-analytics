/**
 * Como um mercado é DESCRITO na tela — a regra, num lugar só.
 *
 * O QUE ACONTECIA (Auditoria 21/09, DAD-01 e DAD-02; medido no catálogo ao vivo
 * em 22/09: 159 dos 300 cards do Polymarket caíam nisto).
 *
 * Cada superfície montava o título do seu jeito, e todas trocavam a PERGUNTA
 * pelo título do EVENTO sempre que ele fosse diferente e tivesse mais de 10
 * caracteres. O título do evento é o guarda-chuva — ele existe para agrupar, e
 * por isso é justamente onde a informação some:
 *
 *   pergunta "Will the Democratic Party control the House after the 2026 …?"
 *   evento    "Which party will win the House in 2026?"   → o card dizia
 *             "Which party will win the House in 2026? — 93% SIM": 93% de QUEM?
 *
 *   pergunta "US announces end of Iranian blockade by September 30, 2026?"
 *   evento    "US announces end of Iranian blockade by...?"  → sumiu a DATA, que
 *             é a única coisa que separa um degrau da escada dos outros.
 *
 *   pergunta "Will Anthropic's valuation hit (HIGH) $3.0T by December 31?"
 *   evento    "Will Anthropic's valuation hit by December 31?" → sumiu o PATAMAR.
 *
 * E havia o oposto: mercado binário com rótulos PRÓPRIOS ("Over"/"Under",
 * "Tampa Bay Rays"/"New York Yankees") era desenhado como SIM/NÃO, com o preço
 * do primeiro rótulo. "51% CHANCE SIM" num mercado de total de rounds quer
 * dizer "Mais de 21,5 rounds: 51%" — e "SIM" ali não significa nada.
 *
 * A REGRA:
 *  · o título é sempre a PERGUNTA (ela é específica); o evento vira subtítulo
 *    quando acrescenta contexto ("Counter-Strike: Liquid vs Paper Rex");
 *  · evento truncado ("… by...?") nunca vira texto de tela;
 *  · SIM/NÃO só quando os desfechos são literalmente Yes/No;
 *  · dois rótulos próprios aparecem os DOIS ("Mais 51% · Menos 49%");
 *  · vários desfechos sempre com NOME junto do número ("Flávio Bolsonaro 61%").
 *
 * E OS GRUPOS (03/10/2026). Um evento de várias opções chega do servidor como
 * UM card com todas (`tipoDeGrupo`, ver server/lib/eventoAgregado.ts). Há dois:
 *  · "exclusivos" (só uma acontece): vira `varios-desfechos` mesmo com DUAS
 *    opções — a eleição brasileira com Flávio e Lula não é "dois rótulos" de
 *    um binário, é uma disputa;
 *  · "independentes" (escada de datas, faixas de preço): vira
 *    `opcoes-independentes`, na ORDEM DA PLATAFORMA — ordenar por chance
 *    embaralharia as datas — e nada nela soma 100%.
 */

import { virgulaDecimal } from "./numerosEmTexto.ts";

export type TipoDeMercado =
  | "sim-nao" | "dois-rotulos" | "varios-desfechos" | "escada-de-datas" | "opcoes-independentes";

export type TipoDeGrupo = "exclusivos" | "independentes";

export interface DesfechoDescrito {
  id?: string;
  rotulo: string;
  /** 0–1. */
  prob: number;
}

export interface MercadoParaDescrever {
  /** A pergunta do mercado (Polymarket `question`, Kalshi `title`). */
  pergunta?: string;
  /** O guarda-chuva que agrupa mercados irmãos (Polymarket `eventTitle`). */
  tituloDoEvento?: string;
  /** Rótulos crus da plataforma (Polymarket `outcomes`). */
  rotulos?: string[];
  /** Preços 0–1 alinhados a `rotulos` (Polymarket `outcomePrices`). */
  precos?: number[];
  /** Desfechos já montados (Kalshi agregado, cache do catálogo). */
  desfechos?: DesfechoDescrito[];
  /** Probabilidade de SIM, 0–1, quando o mercado é binário Yes/No. */
  probSim?: number;
  /** O card é um EVENTO de várias opções, e de qual tipo (o servidor diz). */
  grupo?: TipoDeGrupo;
}

export interface DescricaoDeMercado {
  titulo: string;
  subtitulo?: string;
  tipo: TipoDeMercado;
  /** Na ordem da plataforma (binários) ou do maior para o menor (vários). */
  desfechos: DesfechoDescrito[];
  lider?: DesfechoDescrito;
}

/** Rótulos que a plataforma manda em inglês e que têm nome em português. */
const ROTULO_PT: Record<string, string> = {
  yes: "Sim", no: "Não", over: "Mais", under: "Menos",
  tie: "Empate", draw: "Empate", other: "Outro", another: "Outro",
};

/** Evento truncado pela plataforma: "… by...?", "… on...?" — some a informação. */
const EVENTO_TRUNCADO = /\b(by|on|in|before|at)\s*(\.{3}|…)\s*\??$/i;

/** A pergunta traz uma data ou um mês — é um degrau de escada de datas. */
const TEM_DATA = /\b(\d{1,2}\s+de\s+\w+|\w+\s+\d{1,2},?\s*\d{4}|\w+\s+\d{1,2}\b|\d{1,2}\/\d{1,2})/i;

const normalizar = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

const MESES: Record<string, string> = {
  jan: "janeiro", feb: "fevereiro", mar: "março", apr: "abril", may: "maio", jun: "junho",
  jul: "julho", aug: "agosto", sep: "setembro", oct: "outubro", nov: "novembro", dec: "dezembro",
};
/**
 * "December 31, 2026", "December 31" (Polymarket) e "Before Oct 10, 2026"
 * (Kalshi) — o rótulo de um degrau da escada de datas. Mês por extenso ou
 * abreviado; o prefixo, quando há, é de prazo.
 */
const DATA_EM_INGLES = /^(?:(before|after|by)\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:,?\s*(\d{4}))?$/i;
const PREFIXO_DE_PRAZO: Record<string, string> = { before: "antes de", after: "depois de", by: "até" };
/** "$4,500", "$86,000", "$3.5" — dinheiro em formato americano dentro do rótulo. */
const DOLAR_EM_INGLES = /\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?/g;
/** "1,000" — milhar americano fora do dinheiro. */
const MILHAR_EM_INGLES = /\b\d{1,3}(?:,\d{3})+\b/g;
/** Prefixos de faixa do Kalshi ("Above 6", "At least $4.45"). Só traduzem quando o
 *  resto é número — "Exactly 4 songs" fica como está, em vez de virar meio-a-meio. */
const PREFIXO_DE_FAIXA: ReadonlyArray<[RegExp, string]> = [
  [/^above\s+/i, "Acima de "], [/^below\s+/i, "Abaixo de "], [/^over\s+/i, "Mais de "], [/^under\s+/i, "Menos de "],
  [/^at least\s+/i, "Pelo menos "], [/^at most\s+/i, "No máximo "], [/^exactly\s+/i, "Exatamente "],
  [/^more than\s+/i, "Mais de "], [/^less than\s+/i, "Menos de "],
];
const SUFIXO_DE_FAIXA: ReadonlyArray<[RegExp, string]> = [
  [/\s+or (more|above|higher)$/i, " ou mais"], [/\s+or (less|below|lower)$/i, " ou menos"],
];
/** O que sobra é só número (com moeda, %, grau, sinal ou faixa "a")? */
const SO_NUMERO = /^[\s\d.,%°+\-–↑↓]*(US\$\s?)?[\s\d.,%°+\-–]*$/;

/**
 * O rótulo de uma opção em português. A varredura de 26/09 já acusava
 * "$86,000" na tela como número fora do padrão; com a escada inteira na tela
 * vieram dezenas de "December 31, 2026", "↑ $4,500" e, do Kalshi, "At least
 * $4.45" e "Before Oct 10, 2026".
 *
 * Só converte o que é inequívoco: data, valor em dólar, número e os prefixos de
 * faixa QUANDO o rótulo inteiro vira português. Nome de candidato, de time e o
 * resto ficam como a plataforma escreveu.
 */
export function rotuloEmPortugues(rotulo: string): string {
  const fixo = ROTULO_PT[normalizar(rotulo)];
  if (fixo) return fixo;
  const limpo = rotulo.trim();
  const data = DATA_EM_INGLES.exec(limpo);
  if (data) {
    const prefixo = data[1] ? `${PREFIXO_DE_PRAZO[data[1].toLowerCase()]} ` : "";
    const mes = MESES[data[2].toLowerCase().slice(0, 3)];
    // Em português o dia 1 é ordinal: "1º de outubro".
    const dia = Number(data[3]) === 1 ? "1º" : String(Number(data[3]));
    return `${prefixo}${dia} de ${mes}${data[4] ? ` de ${data[4]}` : ""}`;
  }
  // A ORDEM IMPORTA: o decimal vira vírgula PRIMEIRO ("$4.45" → "$4,45"); se
  // fosse depois, ele desfaria o milhar recém-convertido ("4.500" → "4,500").
  const pt = virgulaDecimal(limpo)
    .replace(DOLAR_EM_INGLES, (_t, inteiro: string, decimal?: string) =>
      `US$ ${inteiro.replace(/,/g, ".")}${decimal ? `,${decimal}` : ""}`)
    .replace(MILHAR_EM_INGLES, (m) => m.replace(/,/g, "."));
  for (const [re, porExtenso] of PREFIXO_DE_FAIXA) {
    if (re.test(pt) && SO_NUMERO.test(pt.replace(re, ""))) return pt.replace(re, porExtenso);
  }
  for (const [re, porExtenso] of SUFIXO_DE_FAIXA) {
    if (re.test(pt) && SO_NUMERO.test(pt.replace(re, ""))) return pt.replace(re, porExtenso);
  }
  return pt;
}

/**
 * O evento é uma escada de PRAZOS ("… by...?", "… before …")? Aí cada data é
 * um "até": "até 31 de dezembro de 2026" — sem o "até", a lista de datas parece
 * dizer QUANDO vai acontecer, e não a chance de acontecer até lá.
 */
export function ehEscadaDePrazo(tituloDoEvento: string | undefined): boolean {
  return /\b(by|before)\b/i.test(tituloDoEvento ?? "");
}

/** O rótulo de uma opção do grupo, como a tela deve escrever. */
export function rotuloDaOpcao(rotulo: string, opcoes: { prazo?: boolean } = {}): string {
  const pt = rotuloEmPortugues(rotulo);
  // Só a data SEM prefixo ganha "até": "Before Oct 10" já diz o prazo ("antes de…").
  const data = DATA_EM_INGLES.exec(rotulo.trim());
  return opcoes.prazo && data && !data[1] ? `até ${pt}` : pt;
}

/**
 * O título do evento sem o pedaço que a plataforma deixa pendurado: "Indiana
 * enacts data center moratorium by...?" → "Indiana enacts data center
 * moratorium by when?". No card de evento esse título É a pergunta, e "by...?"
 * na tela é exatamente o "evento truncado" que a regra acima proíbe.
 */
export function tituloDoGrupo(titulo: string): string {
  const t = titulo.trim();
  const m = EVENTO_TRUNCADO.exec(t);
  if (!m) return t;
  const base = t.slice(0, m.index).trim();
  return m[1].toLowerCase() === "by" ? `${base} by when?` : `${base}?`;
}

/**
 * Os rótulos de UM mercado são Sim/Não? Aceita o texto JSON do Polymarket
 * (`'["Yes","No"]'`). Sem rótulos, vale como Sim/Não — é o caso comum, e não
 * se inventa rótulo próprio que a fonte não mandou.
 */
export function rotulosSaoSimNao(rotulos: string | ReadonlyArray<string> | undefined | null): boolean {
  let lista: string[] = [];
  if (typeof rotulos === "string") {
    try { const v = JSON.parse(rotulos); lista = Array.isArray(v) ? v.map(String) : []; } catch { lista = []; }
  } else if (rotulos) {
    lista = [...rotulos];
  }
  return lista.length === 0 || ehSimNao(lista);
}

function ehSimNao(rotulos: string[]): boolean {
  if (rotulos.length !== 2) return false;
  const [a, b] = rotulos.map(normalizar);
  return (a === "yes" && b === "no") || (a === "sim" && b === "não") || (a === "sim" && b === "nao");
}

/** Monta os desfechos a partir do que a plataforma mandou. */
function montarDesfechos(m: MercadoParaDescrever): DesfechoDescrito[] {
  if (m.desfechos?.length) {
    return m.desfechos.map((d) => ({ ...d, rotulo: rotuloEmPortugues(d.rotulo) }));
  }
  if (m.rotulos?.length && m.precos?.length) {
    return m.rotulos.map((rotulo, i) => ({ rotulo: rotuloEmPortugues(rotulo), prob: m.precos![i] ?? 0 }));
  }
  if (typeof m.probSim === "number" && Number.isFinite(m.probSim)) {
    return [{ rotulo: "Sim", prob: m.probSim }, { rotulo: "Não", prob: 1 - m.probSim }];
  }
  return [];
}

export function descreverMercado(m: MercadoParaDescrever): DescricaoDeMercado {
  const pergunta = (m.pergunta ?? "").trim();
  const evento = (m.tituloDoEvento ?? "").trim();
  const truncado = EVENTO_TRUNCADO.test(evento);

  // O título é a pergunta. Sem pergunta, o evento serve — mas nunca truncado.
  const titulo = pergunta || (truncado ? evento.replace(EVENTO_TRUNCADO, "").trim() : evento);

  // O evento só vira subtítulo quando ACRESCENTA: diferente da pergunta, não
  // truncado e não repetido dentro dela.
  const subtitulo =
    evento && !truncado && normalizar(evento) !== normalizar(pergunta)
      && !normalizar(pergunta).includes(normalizar(evento))
      ? evento
      : undefined;

  const desfechos = montarDesfechos(m);
  const rotulosCrus = m.rotulos?.length ? m.rotulos : m.desfechos?.map((d) => d.rotulo) ?? [];

  // Card de EVENTO (o servidor agrupou): o tipo vem dele, não da contagem.
  if (m.grupo && desfechos.length > 0) {
    const tituloGrupo = tituloDoGrupo(pergunta || evento);
    if (m.grupo === "independentes") {
      const prazo = ehEscadaDePrazo(evento || pergunta);
      const crus = m.rotulos?.length ? m.rotulos : m.desfechos?.map((d) => d.rotulo) ?? [];
      const naOrdem = desfechos.map((d, i) => ({ ...d, rotulo: rotuloDaOpcao(crus[i] ?? d.rotulo, { prazo }) }));
      // ⚠️ `lider` aqui é a PRIMEIRA opção (o prazo mais curto), não a mais
      // provável. É a que as telas de uma linha só mostram — banca, destaques,
      // previsão — e é a mesma que `mercadoQueLiquida` usa para liquidar a
      // aposta (outcomeMarketIds[0]). Rótulo, preço e liquidação: a mesma opção.
      return { titulo: tituloGrupo, tipo: "opcoes-independentes", desfechos: naOrdem, lider: naOrdem[0] };
    }
    const ordenados = [...desfechos].sort((a, b) => b.prob - a.prob);
    return { titulo: tituloGrupo, tipo: "varios-desfechos", desfechos: ordenados, lider: ordenados[0] };
  }

  let tipo: TipoDeMercado;
  // ⚠️ Há um caso em que o evento É o título certo, e ignorá-lo seria trocar um
  // defeito por outro: no evento AGREGADO, a "pergunta" que a plataforma manda é
  // a do desfecho líder. "Decisão do Fed em setembro" com desfechos "25 bps",
  // "50 bps", "manter" chega como question="25 bps" — e um card escrito
  // "25 bps 62%" não diz de que mercado se trata. Quando há vários desfechos,
  // eles é que carregam o específico, e o título é o guarda-chuva.
  if (desfechos.length > 2) {
    tipo = "varios-desfechos";
  } else if (rotulosCrus.length === 2 && !ehSimNao(rotulosCrus)) {
    tipo = "dois-rotulos";
  } else if (truncado && TEM_DATA.test(pergunta)) {
    // Degrau de escada de datas: binário, mas a DATA é o que o distingue.
    tipo = "escada-de-datas";
  } else {
    tipo = "sim-nao";
  }

  const ordenados = tipo === "varios-desfechos"
    ? [...desfechos].sort((a, b) => b.prob - a.prob)
    : desfechos;

  const eventoEhOTitulo = tipo === "varios-desfechos" && !!evento && !truncado;

  return {
    titulo: eventoEhOTitulo ? evento : titulo,
    subtitulo: eventoEhOTitulo ? undefined : subtitulo,
    tipo,
    desfechos: ordenados,
    lider: ordenados[0],
  };
}

/**
 * A linha curta do card: quem está na frente e com quanto. Recebe o formatador
 * de porcentagem de quem chama (o cliente usa `pctDeProb` de shared/formato).
 */
export function resumoDoMercado(d: DescricaoDeMercado, formatar: (prob: number) => string): string {
  if (d.desfechos.length === 0) return "";
  if (d.tipo === "sim-nao" || d.tipo === "escada-de-datas") {
    return `Sim ${formatar(d.desfechos[0].prob)}`;
  }
  if (d.tipo === "dois-rotulos") {
    const [a, b] = d.desfechos;
    return `${a.rotulo} ${formatar(a.prob)} · ${b.rotulo} ${formatar(b.prob)}`;
  }
  if (d.tipo === "opcoes-independentes") {
    // Sem "líder": a 1ª data não lidera nada. As duas pontas dão a forma da escada.
    const [primeira] = d.desfechos;
    const ultima = d.desfechos[d.desfechos.length - 1];
    return d.desfechos.length === 1
      ? `${primeira.rotulo} ${formatar(primeira.prob)}`
      : `${primeira.rotulo} ${formatar(primeira.prob)} … ${ultima.rotulo} ${formatar(ultima.prob)}`;
  }
  return `${d.lider!.rotulo} ${formatar(d.lider!.prob)}`;
}

/**
 * Adaptador do Polymarket: os campos `outcomes` e `outcomePrices` chegam como
 * TEXTO com um array dentro ('["Yes","No"]'). Cada tela fazia o próprio
 * `JSON.parse` com o próprio `try/catch` — e cada uma errava de um jeito.
 */
export function descreverPolymarket(m: {
  question?: string;
  eventTitle?: string;
  outcomes?: string;
  outcomePrices?: string;
  yesProb?: number;
  tipoDeGrupo?: TipoDeGrupo;
}): DescricaoDeMercado {
  const lista = (cru?: string): string[] => {
    if (!cru) return [];
    try { const v = JSON.parse(cru); return Array.isArray(v) ? v.map(String) : []; } catch { return []; }
  };
  const rotulos = lista(m.outcomes);
  const precos = lista(m.outcomePrices).map((p) => Number(p)).filter((n) => Number.isFinite(n));
  return descreverMercado({
    pergunta: m.question,
    tituloDoEvento: m.eventTitle,
    rotulos: rotulos.length ? rotulos : undefined,
    precos: precos.length ? precos : undefined,
    probSim: m.yesProb,
    grupo: m.tipoDeGrupo,
  });
}
