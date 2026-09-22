/**
 * Pré-tradução do catálogo — para o visitante nunca pagar a espera.
 *
 * POR QUE EXISTE (Auditoria 21/09, DAD-05). A tradução passou a ser feita pela
 * cadeia de IA, que é muito melhor que o endpoint gtx — e muito mais lenta:
 * medido em 22/09, 20 títulos novos levaram ~10 s pelo Gemini. O request do
 * visitante espera um prazo curto e entrega o que deu tempo, então na PRIMEIRA
 * visita a um mercado recém-listado a tela mostraria o título em inglês.
 *
 * O CLAUDE.md é explícito: no plano grátis do Render, o que é pesado vai para
 * cron ou cache, não para o request. Então esta tarefa passa pelo catálogo que
 * o site já tem em cache e manda traduzir o que ainda não foi — de madrugada,
 * sem ninguém esperando. Quando o visitante chega, a tradução já está no banco
 * e a resposta é instantânea.
 *
 * Só roda onde as tarefas agendadas rodam (produção, ou JLB_TAREFAS=1): é a
 * mesma trava que impede um servidor local de queimar a cota de IA do site.
 */
import { traduzirLote } from "./translate.ts";
import { log } from "./log.ts";

/** Quantos títulos por rodada. O teto do dia (500) continua valendo por baixo. */
const POR_RODADA = 120;

interface MercadoDoCatalogo {
  question?: string;
  eventTitle?: string;
  title?: string;
}

/**
 * Tira os títulos que valem a pena traduzir. O subtítulo (`eventTitle`) também
 * aparece no card desde o DAD-01, então ele entra junto — traduzir só a
 * pergunta deixaria a linha de cima em inglês.
 */
export function titulosDoCatalogo(mercados: ReadonlyArray<MercadoDoCatalogo>): string[] {
  const vistos = new Set<string>();
  for (const m of mercados) {
    for (const t of [m.question, m.title, m.eventTitle]) {
      const limpo = (t ?? "").trim();
      if (limpo) vistos.add(limpo.slice(0, 500));
    }
  }
  return Array.from(vistos);
}

/**
 * Traduz o catálogo em segundo plano. Devolve quantos títulos tinham tradução
 * ao fim — número medido, não estimado, para o log dizer a verdade.
 */
export async function traduzirCatalogo(base: string): Promise<{ pedidos: number; traduzidos: number }> {
  const pegar = async (caminho: string): Promise<MercadoDoCatalogo[]> => {
    try {
      const r = await fetch(`${base}${caminho}`, { signal: AbortSignal.timeout(30_000) });
      if (!r.ok) return [];
      return ((await r.json()) as { markets?: MercadoDoCatalogo[] }).markets ?? [];
    } catch { return []; }
  };

  const [poly, kalshi] = await Promise.all([
    pegar("/api/polymarket/markets?limit=300"),
    pegar("/api/kalshi/markets?limit=300"),
  ]);

  const titulos = titulosDoCatalogo([...poly, ...kalshi]).slice(0, POR_RODADA);
  if (titulos.length === 0) {
    log.warn("traducao-catalogo", "catálogo veio vazio — nada a traduzir");
    return { pedidos: 0, traduzidos: 0 };
  }

  // Prazo longo de propósito: aqui não há tela esperando. É o oposto do request
  // do visitante, e é essa diferença que justifica a tarefa existir.
  const { traducoes } = await traduzirLote(titulos, 120_000);
  const resultado = { pedidos: titulos.length, traduzidos: Object.keys(traducoes).length };
  log.info("traducao-catalogo", `${resultado.traduzidos} de ${resultado.pedidos} títulos com tradução pronta`);
  return resultado;
}
