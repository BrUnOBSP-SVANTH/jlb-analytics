/**
 * O card de um evento de VÁRIOS DESFECHOS — a identidade e as listas paralelas.
 *
 * POR QUE É UMA FUNÇÃO SEPARADA E TESTADA (Auditoria 21/09, DAD-03).
 *
 * Um evento negRisk do Polymarket ("Democratic Presidential Nominee 2028") é um
 * conjunto de mercados binários, um por candidato. A tela junta todos num card
 * só — e, ao juntar, precisava escolher QUAL id o card carrega. Carregava o do
 * mercado LÍDER.
 *
 * O líder muda. É uma disputa: é exatamente o que o card existe para mostrar. E
 * quando mudava, o card trocava de identidade sozinho:
 *  · o link que alguém compartilhou passava a abrir outro desfecho;
 *  · o item salvo na watchlist virava outro mercado;
 *  · o alerta de variação (`prevMarketProbs`, chaveado por este id) comparava o
 *    preço de um candidato com o preço de outro e disparava "subiu 20pp";
 *  · a análise guardada em cache respondia sobre quem não foi perguntado.
 * Nada disso dá erro na tela. Só fica errado.
 *
 * A regra: **o card é o EVENTO** (`ev-<id>`, que não muda nunca) e **o desfecho
 * é o mercado** (`outcomeMarketIds[i]`, que liquida). São perguntas diferentes e
 * agora têm identificadores diferentes.
 *
 * As quatro listas são PARALELAS — mesmo índice, mesmo desfecho. Se uma sair de
 * ordem, a tela mostra o histórico de um candidato sob o nome de outro: um erro
 * que desenha bonito e mente. É a mesma razão de `client/src/lib/desfechos.ts`
 * ser uma função testada.
 */

export interface DesfechoDoEvento {
  rotulo: string;
  /** 0–1. */
  prob: number;
  /** Id do mercado aninhado — é ele que liquida este desfecho. */
  idDoMercado: string;
  /** Token CLOB do SIM — serve para o histórico de preço, e só. */
  token: string;
}

/**
 * Que tipo de grupo de opções é este — e a resposta muda o que a tela pode afirmar.
 *
 *  · `exclusivos`: só uma opção acontece (eleição, campeonato; no Polymarket,
 *    `negRisk`). As chances somam ~100%, e a ordem certa é da maior para a menor.
 *  · `independentes`: cada opção é um mercado com resultado próprio, e mais de
 *    uma pode acontecer — a escada de datas ("até 31/12/2026", "até 30/06/2027")
 *    e a de faixas ("ouro acima de US$ 4.500"). As chances NÃO somam 100% ("até
 *    2028" já inclui "até 2026"), e a ordem certa é a da plataforma, não a do preço.
 */
export type TipoDeGrupo = "exclusivos" | "independentes";

export interface CardDoEvento {
  /** `ev-<idDoEvento>`: estável enquanto o evento existir. */
  id: string;
  outcomes: string;
  outcomePrices: string;
  outcomeTokens: string;
  outcomeMarketIds: string;
  tipoDeGrupo: TipoDeGrupo;
  /** Opções ABERTAS na fonte que a lista não traz (ruído abaixo de 0,5% ou além
   *  do teto). A tela diz que existem — sumir com elas calado é o defeito. */
  opcoesOcultas: number;
}

/**
 * Monta a identidade e as listas do card agregado. Recebe os desfechos JÁ
 * ordenados (é `organizarOpcoes` quem ordena e corta) para que a ordem da
 * tela e a ordem das listas sejam a mesma, por construção.
 */
export function montarCardDoEvento(
  idDoEvento: string,
  desfechos: ReadonlyArray<DesfechoDoEvento>,
  tipoDeGrupo: TipoDeGrupo = "exclusivos",
  opcoesOcultas = 0,
): CardDoEvento {
  return {
    id: `ev-${String(idDoEvento).trim()}`,
    outcomes: JSON.stringify(desfechos.map((d) => d.rotulo)),
    // 4 casas: é a precisão que o Polymarket publica. Arredondar aqui fazia a
    // calculadora ler 19% onde o preço praticado era 18,5%.
    outcomePrices: JSON.stringify(desfechos.map((d) => d.prob.toFixed(4))),
    outcomeTokens: JSON.stringify(desfechos.map((d) => d.token ?? "")),
    outcomeMarketIds: JSON.stringify(desfechos.map((d) => String(d.idDoMercado ?? ""))),
    tipoDeGrupo,
    opcoesOcultas: Math.max(0, opcoesOcultas),
  };
}

/** Uma opção aberta do evento como chega da fonte, antes de ordenar. */
export interface OpcaoDaFonte<T> extends DesfechoDoEvento {
  /** A posição que a PLATAFORMA dá à opção (Polymarket `groupItemThreshold`). A
   *  lista crua vem embaralhada — "março de 2027" antes de "janeiro de 2027". */
  ordemNaFonte?: number | null;
  /** Fim desta opção (ms): a escada de datas se ordena por ele quando a fonte
   *  não manda a ordem. */
  fimMs?: number | null;
  /** O mercado desta opção é SIM/NÃO? `false` quando tem rótulos próprios
   *  ("Spirit"/"ShindeN", "Over"/"Under") — aí ele é OUTRA pergunta, não uma
   *  opção desta. Ausente = SIM/NÃO. */
  simNao?: boolean;
  ref: T;
}

/** Abaixo disto, numa disputa, a opção é ruído (0,05% de um candidato sem chance). */
export const PROB_RUIDO = 0.005;
/** Teto da lista. Acima dele a tela diz quantas ficaram de fora. */
export const TETO_EXCLUSIVOS = 12;
export const TETO_INDEPENDENTES = 20;

/**
 * Ordena e corta as opções de UM evento conforme o tipo do grupo.
 *
 * Escada nunca perde degrau por ser barata: "até 31/12/2026: 4,5%" é a
 * informação, não o ruído. Só a disputa corta o que está abaixo de 0,5%.
 */
export function organizarOpcoes<T>(
  opcoes: ReadonlyArray<OpcaoDaFonte<T>>,
  tipo: TipoDeGrupo,
): { lista: OpcaoDaFonte<T>[]; ocultas: number } {
  const comRotulo = opcoes.filter((o) => (o.rotulo ?? "").trim() !== "");
  let lista: OpcaoDaFonte<T>[];
  if (tipo === "exclusivos") {
    lista = comRotulo
      .filter((o) => Number.isFinite(o.prob) && o.prob > PROB_RUIDO)
      .sort((a, b) => b.prob - a.prob)
      .slice(0, TETO_EXCLUSIVOS);
  } else {
    // Escada longa demais (o Bitcoin da hora no Kalshi tem 188 degraus): ficam
    // os degraus onde HÁ DÚVIDA, os mais perto de 50%. Cortar pelos primeiros
    // mostraria vinte linhas de "99%" e esconderia exatamente onde o preço está.
    const escolhidas = comRotulo.length > TETO_INDEPENDENTES
      ? [...comRotulo].sort((a, b) => Math.abs(a.prob - 0.5) - Math.abs(b.prob - 0.5)).slice(0, TETO_INDEPENDENTES)
      : comRotulo;
    lista = [...escolhidas];
    const todasComOrdem = lista.every((o) => Number.isFinite(o.ordemNaFonte ?? NaN));
    const todasComFim = lista.every((o) => Number.isFinite(o.fimMs ?? NaN));
    const fimVaria = new Set(lista.map((o) => o.fimMs)).size > 1;
    if (todasComOrdem) lista.sort((a, b) => (a.ordemNaFonte as number) - (b.ordemNaFonte as number));
    else if (todasComFim && fimVaria) lista.sort((a, b) => (a.fimMs as number) - (b.fimMs as number));
    // Sem ordem nenhuma ("Quem Trump vai indultar?": mesma data, sem patamar),
    // a leitura útil é da mais provável para a menos.
    else lista.sort((a, b) => b.prob - a.prob);
  }
  return { lista, ocultas: opcoes.length - lista.length };
}

/**
 * O nome que TODAS as opções repetem antes da vírgula — ou `null`.
 *
 * O Kalshi publica dois eventos com o MESMO título para cada disputa ("Texas
 * Senate margin of victory"): um com "Ken Paxton, 1+ pts", "Ken Paxton, 3+ pts"…
 * e outro com "James Talarico, 1+ pts"… O que separa os dois está nas opções.
 * Agrupados, viravam dois cards idênticos (o doctor acusou 8 pares em
 * 03/10/2026). Com o nome no título e o resto no rótulo, cada card diz de quem
 * é a margem — e o rótulo fica curto.
 */
export function prefixoComumDosRotulos(rotulos: ReadonlyArray<string>): string | null {
  if (rotulos.length < 2) return null;
  const partes = rotulos.map((r) => /^(.+?),\s+(\S.*)$/.exec(r.trim()));
  if (partes.some((p) => !p)) return null;
  // "Before Jan 1, 2027" / "Before Jan 1, 2028": a vírgula separa o ANO, e o
  // "nome comum" seria "Before Jan 1" — o rótulo viraria só "2027".
  if (partes.some((p) => /^\d{4}$/.test(p![2].trim()))) return null;
  const prefixo = partes[0]![1];
  return partes.every((p) => p![1] === prefixo) ? prefixo : null;
}

/**
 * Exclusivo ou não, para um evento do Kalshi que chegou SEM o evento junto (a
 * lista plana de curto prazo). Medido em 03/10/2026 contra a flag
 * `mutually_exclusive` dos eventos: jogo (`structured`) e faixas
 * (`less`/`between`/`greater` misturados) são exclusivos; escada de limiar
 * (`greater` em todos, o Bitcoin da hora) não é. Na dúvida, "independentes" —
 * a leitura que não afirma que as chances somam 100%.
 */
export function tipoPeloStrike(strikes: ReadonlyArray<string | undefined>): TipoDeGrupo {
  const tipos = new Set(strikes.map((s) => (s ?? "").toLowerCase()));
  if (tipos.size === 1 && tipos.has("structured")) return "exclusivos";
  if (tipos.has("between")) return "exclusivos";
  return "independentes";
}

/**
 * O card de um evento de VÁRIAS opções — ou `null`, quando ele é SIM/NÃO de verdade.
 *
 * 🔴 O DEFEITO QUE ISTO FECHA (03/10/2026, achado do fundador; medido em todo o
 * catálogo publicado: 85 eventos do Polymarket com várias opções, e o site
 * mostrava TODAS em só 6). A rota só agrupava quando o evento era `negRisk` E
 * tinha 3+ opções acima de 0,5%. O resto caía em "pega a opção de maior volume
 * e mostra o preço dela como se fosse o do evento":
 *  · "Indiana enacts data center moratorium by...?" — escada de 4 datas, não
 *    negRisk — virava "11%", que era só o degrau de 31/12/2027;
 *  · "Brazil Presidential Election" — negRisk, mas só Lula e Flávio passam de
 *    0,5% — virava "0,15%": o card mostrava Renan Santos, o de MAIOR VOLUME.
 *
 * A regra agora: duas ou mais opções abertas = um card com elas, dizendo de que
 * tipo é o grupo e quantas ficaram de fora.
 *
 * ⚠️ MAS SÓ QUANDO CADA MERCADO É SIM/NÃO. Uma partida ("Counter-Strike: Spirit
 * vs ShindeN") também é um evento de vários mercados — quem vence, quem vence o
 * mapa 1, total de mapas —, só que cada um é uma PERGUNTA diferente, com rótulos
 * próprios. Agrupar viraria uma lista de 13 linhas com o preço do 1º rótulo de
 * cada uma sem dizer de quem ("Game 1 Winner 55%" — 55% de QUEM?). Ali o certo
 * continua sendo o mercado principal, que a tela desenha com os dois nomes.
 */
export function agruparOpcoesDoEvento<T>(
  ev: { id: string | number; negRisk?: boolean },
  opcoes: ReadonlyArray<OpcaoDaFonte<T>>,
): { tipo: TipoDeGrupo; lista: OpcaoDaFonte<T>[]; ocultas: number; card: CardDoEvento } | null {
  if (opcoes.length < 2) return null;
  if (opcoes.some((o) => o.simNao === false)) return null;
  const tipo: TipoDeGrupo = ev.negRisk ? "exclusivos" : "independentes";
  const { lista, ocultas } = organizarOpcoes(opcoes, tipo);
  if (lista.length === 0) return null;
  return { tipo, lista, ocultas, card: montarCardDoEvento(String(ev.id), lista, tipo, ocultas) };
}
