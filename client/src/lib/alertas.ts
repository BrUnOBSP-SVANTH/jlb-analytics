/**
 * A régua do sino de alertas (NAV-09).
 *
 * O QUE ISTO CONSERTA. A auditoria abriu o sino e encontrou 50 alertas, o badge
 * cravado em "9+" e, dentro, o mesmo mercado repetido com três minutos de
 * diferença — mais mercados que já tinham liquidado (50% → 100%) listados como
 * "variação". Um badge que nunca zera é um badge que ninguém lê: em duas
 * semanas o usuário aprende a ignorar o sino, e aí o alerta que importava passa
 * despercebido junto com o resto.
 *
 * Três regras, todas puras e testáveis, porque a diferença entre um alerta útil
 * e ruído mora inteira aqui:
 *   1. mercado liquidado não é movimento — é o fim do mercado;
 *   2. o mesmo mercado numa janela curta é UM alerta, o maior deles;
 *   3. a lista guarda pouco, porque histórico de alerta não é histórico de preço.
 */
import type { MarketAlert } from "@/hooks/useMarketAlerts";

/** Acima disto (ou abaixo do complemento) o mercado está liquidando, não se movendo. */
export const LIMIAR_LIQUIDADO = 99;

/** Duas leituras do mesmo mercado dentro desta janela são o mesmo evento. */
export const JANELA_DEDUP_MS = 30 * 60_000;

/** O sino guarda o que cabe numa olhada, não um arquivo. */
export const MAX_ALERTAS = 20;

/** Chave de identidade do mercado — o `key` prefixado, com o id cru de reserva. */
function chave(a: MarketAlert): string {
  return a.key ?? `${a.source}-${a.id}`;
}

/**
 * Mercado que foi para 100% (ou 0%) resolveu. Mostrar isso como "variação de
 * 50 pp" é tecnicamente verdade e praticamente inútil: não há mais o que
 * decidir num mercado que acabou.
 */
export function ehLiquidacao(a: MarketAlert): boolean {
  return a.prob >= LIMIAR_LIQUIDADO || a.prob <= 100 - LIMIAR_LIQUIDADO;
}

/**
 * Aplica as três regras e devolve a lista que o sino deve mostrar.
 *
 * Dentro da janela fica o MAIOR movimento, não o mais recente: quem abre o sino
 * quer saber o tamanho do que aconteceu, e o último tique costuma ser o menor.
 * O horário exibido continua sendo o da leitura mais recente, para o "há 3 min"
 * não mentir.
 */
export function filtrarAlertas(entrada: MarketAlert[]): MarketAlert[] {
  const vivos = entrada.filter((a) => !ehLiquidacao(a));

  // Mais recente primeiro — é a ordem em que o sino lista.
  const ordenados = [...vivos].sort(
    (a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime(),
  );

  const escolhidos: MarketAlert[] = [];
  for (const a of ordenados) {
    const k = chave(a);
    const t = new Date(a.receivedAt).getTime();
    const jaTem = escolhidos.find(
      (e) => chave(e) === k && Math.abs(new Date(e.receivedAt).getTime() - t) <= JANELA_DEDUP_MS,
    );
    if (!jaTem) { escolhidos.push(a); continue; }
    // Mesmo mercado, mesma janela: fica o maior movimento, com o horário do mais recente.
    if (Math.abs(a.delta) > Math.abs(jaTem.delta)) {
      jaTem.delta = a.delta;
      jaTem.prob = a.prob;
      jaTem.prevProb = a.prevProb;
    }
  }

  return escolhidos.slice(0, MAX_ALERTAS);
}
