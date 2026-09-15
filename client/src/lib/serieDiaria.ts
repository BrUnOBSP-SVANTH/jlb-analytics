/**
 * Série diária de preço a partir do histórico do próprio Polymarket.
 *
 * O QUE ACONTECIA (auditoria de 14/09/2026, item 7). O gráfico "Histórico de
 * Probabilidade" do detalhe só lia os nossos snapshots, e o coletor diário grava
 * os 100 eventos de maior volume — o catálogo da tela junta até nove páginas
 * (volume 24h, destaques, prazo de 7 e de 30 dias). 17 de 40 mercados abriam com
 * "Dados históricos disponíveis após snapshots serem coletados", enquanto o card
 * da lista mostrava "−16 pp na semana". A tela dizia não ter o que tinha.
 *
 * O preço passado não precisa esperar o nosso coletor: o Polymarket publica a
 * série do token (`historicoDoToken`, a mesma dos minigráficos). Aqui ela vira um
 * ponto por dia — o ÚLTIMO preço de cada dia, que é o que um snapshot diário
 * registraria — para caber na mesma escala do gráfico.
 *
 * Nada é interpolado: dia sem negociação não ganha ponto.
 */
import type { PontoPreco } from "./historicoPreco";

/** `t` em segundos; `p` em 0–100, a escala dos snapshots. */
export interface PontoDiario { t: number; p: number }

export function serieDiaria(historico: ReadonlyArray<PontoPreco>, dias: number, agoraSeg = Date.now() / 1000): PontoDiario[] {
  const desde = agoraSeg - dias * 86_400;
  const porDia = new Map<string, PontoPreco>();
  for (const pt of historico) {
    if (!Number.isFinite(pt.t) || !Number.isFinite(pt.p) || pt.p < 0 || pt.p > 1) continue;
    if (pt.t < desde || pt.t > agoraSeg) continue;
    const dia = new Date(pt.t * 1000).toISOString().slice(0, 10);
    const atual = porDia.get(dia);
    if (!atual || pt.t >= atual.t) porDia.set(dia, pt);
  }
  return Array.from(porDia.values())
    .sort((a, b) => a.t - b.t)
    .map((pt) => ({ t: pt.t, p: pt.p * 100 }));
}
