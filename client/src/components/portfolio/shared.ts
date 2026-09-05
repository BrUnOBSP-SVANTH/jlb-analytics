/**
 * Resgate do portfólio ANTIGO (localStorage `jlb_portfolio_v1`).
 *
 * A banca simulada passou a viver na conta do usuário. Quem usou a versão antiga
 * tem posições salvas só no navegador dele, e elas ficariam órfãs sem aviso.
 *
 * POR QUE NÃO IMPORTAMOS AUTOMATICAMENTE. As posições antigas tinham preço de
 * entrada escolhido à mão (o slider permitia "comprar" a 20% um mercado
 * negociado a 80%) e valor em dólar. Convertê-las em apostas da banca exigiria
 * inventar o preço real daquele instante — número que não existe em lugar
 * nenhum. Preferimos entregar o dado em CSV e deixar a pessoa decidir, a
 * fabricar um histórico que pareceria verdadeiro.
 */

const CHAVE_ANTIGA = "jlb_portfolio_v1";

export interface PosicaoAntiga {
  id: string;
  marketId: string;
  title: string;
  source: "polymarket" | "kalshi";
  externalUrl: string;
  position: "yes" | "no";
  entryProb: number;
  betSize: number;
  entryDate: string;
  currentProb?: number;
}

/** O que sobrou do portfólio antigo neste navegador. Lista vazia = nada a resgatar. */
export function posicoesAntigas(): PosicaoAntiga[] {
  try {
    const cru = localStorage.getItem(CHAVE_ANTIGA);
    if (!cru) return [];
    const dados = JSON.parse(cru) as PosicaoAntiga[];
    return Array.isArray(dados) ? dados : [];
  } catch { return []; }
}

/** Descarta o portfólio antigo — só depois de o usuário dizer que pode. */
export function descartarAntigas(): void {
  try { localStorage.removeItem(CHAVE_ANTIGA); } catch { /* navegador sem storage */ }
}

/** Baixa as posições antigas em CSV, para a pessoa guardar o que quiser. */
export function baixarAntigasCSV(posicoes: PosicaoAntiga[]): void {
  const cabecalho = "Mercado,Fonte,Lado,Prob de entrada (%),Prob atual (%),Valor (USD),Data";
  const linhas = posicoes.map((p) => [
    `"${p.title.replace(/"/g, '""')}"`,
    p.source,
    p.position === "yes" ? "SIM" : "NÃO",
    (p.entryProb * 100).toFixed(1),
    p.currentProb !== undefined ? (p.currentProb * 100).toFixed(1) : "",
    p.betSize.toFixed(2),
    new Date(p.entryDate).toLocaleDateString("pt-BR"),
  ].join(","));

  const blob = new Blob([[cabecalho, ...linhas].join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `portfolio-antigo-jlb-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
