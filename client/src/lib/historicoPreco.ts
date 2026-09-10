/**
 * Histórico de preço dos minigráficos — uma chamada para a lista inteira.
 *
 * O QUE ISTO CONSERTA (TRV-01). A auditoria contou 52 chamadas de API por
 * carregamento de página, e `clob-history` era das piores: 11 requisições de até
 * 3,5 s, uma por minigráfico de card. Cada card pedia a sua sem saber dos
 * vizinhos, então a lista ficava sem gráfico nenhum enquanto a fila andava.
 *
 * Mesmo padrão de `lib/traducao.ts`, pelo mesmo motivo: quem tem N componentes
 * pedindo a mesma classe de dado ao mesmo tempo tem um problema de fila, não de
 * volume. Os pedidos que chegam na mesma janela viram UMA requisição.
 */
export interface PontoPreco { t: number; p: number }

/** Janela de agrupamento. Curta o bastante para ninguém perceber. */
const JANELA_MS = 60;

/** Teto por requisição — o mesmo do servidor. */
const LOTE_MAX = 30;

const memoria = new Map<string, PontoPreco[]>();

interface Pendente { token: string; resolver: (v: PontoPreco[]) => void }

let fila: Pendente[] = [];
let agendado: ReturnType<typeof setTimeout> | null = null;

async function despachar() {
  agendado = null;
  const lote = fila;
  fila = [];
  if (lote.length === 0) return;

  const tokens = Array.from(new Set(lote.map((p) => p.token))).slice(0, LOTE_MAX);

  try {
    const r = await fetch("/api/polymarket/clob-history/lote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tokenIds: tokens }),
    });
    const dados = r.ok ? (await r.json() as { historicos?: Record<string, PontoPreco[]> }) : null;
    const mapa = dados?.historicos ?? {};
    for (const p of lote) {
      const h = mapa[p.token] ?? [];
      memoria.set(p.token, h);
      p.resolver(h);
    }
  } catch {
    // Falha de rede devolve vazio e NÃO guarda: o card cai no histórico do
    // Supabase (o caminho de reserva que já existia) e a próxima montagem tenta
    // de novo. Minigráfico ausente é aceitável; card travado não é.
    for (const p of lote) p.resolver([]);
  }
}

/** O histórico de 90 dias do token, ou lista vazia quando não há. */
export function historicoDoToken(tokenId: string): Promise<PontoPreco[]> {
  const limpo = (tokenId ?? "").trim();
  if (!limpo) return Promise.resolve([]);
  const guardado = memoria.get(limpo);
  if (guardado) return Promise.resolve(guardado);

  return new Promise((resolver) => {
    fila.push({ token: limpo, resolver });
    if (!agendado) agendado = setTimeout(() => { void despachar(); }, JANELA_MS);
  });
}
