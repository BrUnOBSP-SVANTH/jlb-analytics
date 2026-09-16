/**
 * As rotas do site — uma tabela, lida pelo roteador, pelo servidor e pelo sitemap.
 *
 * O QUE ACONTECIA (auditoria de 14/09/2026, itens 10, 11 e 12). Cada peça tinha
 * a sua lista, e as quatro divergiram:
 *
 *   · o sitemap entregava ao Google /apostas, /cerebro e /backtester — que só
 *     redirecionam — e escondia /mercados, a página central do produto, além de
 *     /track-record, /planos e /imprensa;
 *   · o atalho do PWA abria "Apostas ao vivo" em /apostas;
 *   · o servidor devolvia 200 com o index.html para QUALQUER caminho — até
 *     /favicon.ico e /arquivo.png —, e a página de 404 ainda publicava canonical
 *     para a URL inválida: todo link quebrado da internet virava página indexável;
 *   · os apelidos redirecionavam com `window.location.replace`, baixando o site
 *     inteiro de novo (218 KB de JS, 406 KB de gráficos, fontes) a cada clique.
 *
 * Aqui mora a verdade; os testes em rotas.test.ts prendem App.tsx, sitemap.xml e
 * manifest.json a ela.
 */

export interface RotaPublica {
  caminho: string;
  frequencia: "hourly" | "daily" | "weekly" | "monthly" | "yearly";
  prioridade: number;
}

/**
 * O que vai para o sitemap: páginas públicas e canônicas.
 *
 * Fora de propósito: telas de conta (/dashboard, /perfil) e /login, que não
 * existem para quem não entrou. /duelos entrou em 15/09, por decisão do fundador
 * (o CLAUDE.md pedia que a exposição da página fosse escolha dele).
 */
export const ROTAS_PUBLICAS: readonly RotaPublica[] = [
  { caminho: "/",             frequencia: "daily",   prioridade: 1.0 },
  { caminho: "/mercados",     frequencia: "hourly",  prioridade: 0.9 },
  { caminho: "/track-record", frequencia: "daily",   prioridade: 0.9 },
  { caminho: "/previsao",     frequencia: "daily",   prioridade: 0.8 },
  { caminho: "/noticias",     frequencia: "hourly",  prioridade: 0.8 },
  { caminho: "/educacao",     frequencia: "weekly",  prioridade: 0.8 },
  { caminho: "/nivel/1",      frequencia: "monthly", prioridade: 0.7 },
  { caminho: "/nivel/2",      frequencia: "monthly", prioridade: 0.6 },
  { caminho: "/nivel/3",      frequencia: "monthly", prioridade: 0.6 },
  { caminho: "/nivel/4",      frequencia: "monthly", prioridade: 0.6 },
  { caminho: "/nivel/5",      frequencia: "monthly", prioridade: 0.6 },
  { caminho: "/briefing",     frequencia: "daily",   prioridade: 0.7 },
  { caminho: "/calculadoras", frequencia: "monthly", prioridade: 0.7 },
  { caminho: "/simulador",    frequencia: "monthly", prioridade: 0.6 },
  { caminho: "/portfolio",    frequencia: "weekly",  prioridade: 0.6 },
  { caminho: "/leaderboard",  frequencia: "daily",   prioridade: 0.6 },
  { caminho: "/duelos",       frequencia: "weekly",  prioridade: 0.5 },
  { caminho: "/planos",       frequencia: "monthly", prioridade: 0.7 },
  { caminho: "/imprensa",     frequencia: "weekly",  prioridade: 0.6 },
  { caminho: "/sobre",        frequencia: "monthly", prioridade: 0.6 },
  { caminho: "/termos",       frequencia: "yearly",  prioridade: 0.3 },
  { caminho: "/privacidade",  frequencia: "yearly",  prioridade: 0.3 },
];

/** Telas que existem mas não se indexam. */
export const ROTAS_PRIVADAS: readonly string[] = [
  "/dashboard", "/perfil", "/login", "/reset-password",
];

/**
 * Endereços antigos → endereço atual. Link já compartilhado não pode morrer numa
 * troca de nome nossa, mas também não pode custar o site inteiro baixado de novo.
 */
export const APELIDOS: Readonly<Record<string, string>> = {
  "/apostas": "/mercados",
  "/mercado": "/mercados",
  "/minha-conta": "/dashboard",
  "/laboratorio": "/calculadoras",
  "/backtester": "/calculadoras",
  "/correlacao": "/calculadoras",
  "/cerebro": "/previsao",
  "/analise": "/previsao",
  "/premium": "/planos",
  "/contato": "/sobre",
};

/** Rotas com parâmetro. O `:id` é um segmento só, sem barra. */
const DETALHE_MERCADO = /^\/mercados\/[^/]+$/;
const DETALHE_APELIDO = /^\/apostas\/([^/]+)$/;

const semBarraFinal = (p: string) => (p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p);

/** Para onde um endereço antigo deve ir, ou `null` se não é apelido. */
export function destinoDoApelido(caminho: string): string | null {
  const p = semBarraFinal(caminho);
  if (Object.hasOwn(APELIDOS, p)) return APELIDOS[p];
  const m = DETALHE_APELIDO.exec(p);
  return m ? `/mercados/${m[1]}` : null;
}

/** O app tem uma tela para este caminho? (Apelido não conta: ele redireciona.) */
export function rotaExiste(caminho: string): boolean {
  const p = semBarraFinal(caminho);
  return ROTAS_PUBLICAS.some((r) => r.caminho === p) || ROTAS_PRIVADAS.includes(p) || DETALHE_MERCADO.test(p);
}

/** Endereço público do site — o mesmo que robots.txt anuncia. */
export const ORIGEM_PUBLICA = "https://jlb-analytics.onrender.com";

/** O sitemap.xml inteiro, gerado da tabela (`pnpm sitemap` grava em client/public). */
export function sitemapXml(origem = ORIGEM_PUBLICA): string {
  const linhas = ROTAS_PUBLICAS.map((r) =>
    `  <url><loc>${origem}${r.caminho}</loc><changefreq>${r.frequencia}</changefreq><priority>${r.prioridade.toFixed(1)}</priority></url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${linhas.join("\n")}\n</urlset>\n`;
}
