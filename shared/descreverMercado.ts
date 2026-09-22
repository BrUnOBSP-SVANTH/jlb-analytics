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
 */

export type TipoDeMercado = "sim-nao" | "dois-rotulos" | "varios-desfechos" | "escada-de-datas";

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

export function rotuloEmPortugues(rotulo: string): string {
  return ROTULO_PT[normalizar(rotulo)] ?? rotulo.trim();
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

  let tipo: TipoDeMercado;
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

  return {
    titulo,
    subtitulo,
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
  return `${d.lider!.rotulo} ${formatar(d.lider!.prob)}`;
}
