import { REGRA_LINGUAGEM } from "./linguagem.ts";
import type { Request, Response } from "express";
import { getCache, setCache, isRateLimited } from "../cache.ts";
import { fetchBcbSerie } from "../bcb.ts";
import { streamClaude, type ClaudeMessage } from "../anthropic.ts";
import { fetchCerebroContext } from "../cerebro.ts";
import { parsePolyPrices } from "../aiForecasts.ts";

interface ChatContext { portfolio?: string; isAuthenticated?: boolean; userLevel?: number; levelContext?: string }
export interface ChatRequest { message?: string; history?: unknown; context?: ChatContext }

// Bloco ESTÁTICO do system — idêntico para todos os usuários, vai com
// cache_control (prompt caching real: TTFT menor e ~90% mais barato).
// Tudo que varia por request fica no bloco dinâmico, nunca aqui.
const CHAT_SYSTEM = `Você é o Analista JLB — assistente da JLB Analytics, plataforma brasileira de educação quantitativa para mercados preditivos (Polymarket, Kalshi), apostas esportivas racionais e finanças.

PERSONA: analista quantitativo sênior e professor paciente. Tom direto e caloroso, zero jargão vazio; o rigor de quem ensina com números.
${REGRA_LINGUAGEM}

ESCOPO — você responde sobre:
- Mercados preditivos: probabilidades, odds, liquidez, volume, como ler Polymarket/Kalshi
- Método quantitativo: Valor Esperado, Critério de Kelly, Brier Score, calibração, overround, base rates, decomposição de Fermi
- Estatística e modelos: Poisson, regressão, Elo, Monte Carlo, vieses cognitivos
- Macro/finanças em contexto educacional (Selic, CDI, IPCA, juros, inflação)
- A própria plataforma JLB: páginas, calculadoras, trilha de níveis 1-5

FORA DO ESCOPO: qualquer outro assunto → redirecione com gentileza, em 1 frase, para o que você cobre. Nunca finja saber.

REGRAS INEGOCIÁVEIS:
- SEMPRE em português brasileiro
- NUNCA recomende aposta, posição, compra ou venda específica. Você ensina o método; a decisão é do usuário. Pressionado por uma "dica", explique o porquê da regra e ofereça o cálculo no lugar
- Corrija achismos com matemática, não com opinião — mostre a conta
- Probabilidade sem contexto não existe: relacione com valor esperado, margem e gestão de banca quando relevante
- NÃO invente dados, notícias ou cotações; use apenas o que estiver nos blocos de contexto. Sem dado, diga que não tem
- Use os indicadores do BCB do contexto ao falar de macro brasileira

FORMATO:
- Curto por padrão: 1 a 3 parágrafos, TEXTO PURO — sem nenhum markdown (nada de **negrito**, títulos, tabelas ou crase); hífens para listas curtas são ok
- Adapte a profundidade ao nível do usuário indicado no contexto (1 = iniciante absoluto, 5 = avançado)
- Números com 1-2 casas decimais e unidade sempre (%, R$, pp)
- Ao usar material do Cerebro, cite [C1], [C2]…
- Quando fizer sentido, feche apontando a página da JLB que aprofunda o tema (/calculadoras, /nivel/3, /previsao, /apostas)`;

function sanitizeHistory(history: unknown): ClaudeMessage[] {
  if (!Array.isArray(history)) return [];
  return history
    .filter((m): m is ClaudeMessage =>
      !!m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim().length > 0)
    .slice(-10)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4_000) }));
}

/** Top mercados ao vivo (do cache do servidor) — o Analista JLB responde sobre
 *  preços reais em vez de dizer que não tem acesso. Cache 3 min. */
function buildLiveMarketsBlock(): string {
  const cached = getCache<string>("chat-live-markets");
  if (cached !== null) return cached;
  const poly = getCache<Array<{ question: string; outcomePrices?: string; volume?: number }>>("polymarket:markets:active") ?? [];
  const kalshi = getCache<Array<{ title: string; yesProb: number; volume?: number }>>("kalshi:markets") ?? [];
  const items: { t: string; p: number; v: number; src: string }[] = [];
  for (const m of poly) {
    const p = parsePolyPrices(m.outcomePrices)[0];
    if (m.question && p !== undefined) items.push({ t: m.question, p: Math.round(p * 100), v: m.volume ?? 0, src: "Polymarket" });
  }
  for (const m of kalshi) {
    if (m.title) items.push({ t: m.title, p: Math.round(m.yesProb > 1 ? m.yesProb : m.yesProb * 100), v: m.volume ?? 0, src: "Kalshi" });
  }
  const top = items.sort((a, b) => b.v - a.v).slice(0, 10);
  if (top.length === 0) return ""; // cache frio de mercados — NÃO cachear o vazio
  const block = `MERCADOS PREDITIVOS AO VIVO (probabilidade de SIM agora — use quando a pergunta tocar nesses temas; são os preços reais):\n${top.map((i) => `- [${i.src}] "${i.t}" — ${i.p}%`).join("\n")}`;
  setCache("chat-live-markets", block, 180);
  return block;
}

/** Contexto dinâmico do system: data, BCB (cache 1h), Cerebro (cache 10min) e mercados ao vivo em PARALELO. */
async function buildChatDynamicContext(message: string, context?: ChatContext): Promise<string> {
  const cerebroKey = `chat-cerebro:${message.toLowerCase().replace(/\s+/g, " ").slice(0, 100)}`;
  const cachedCerebro = getCache<string>(cerebroKey);
  const [selic, cdi, ipca, cerebro] = await Promise.all([
    fetchBcbSerie(432), fetchBcbSerie(4389), fetchBcbSerie(13522),
    cachedCerebro !== null
      ? Promise.resolve(cachedCerebro)
      : fetchCerebroContext(message).then((c) => { setCache(cerebroKey, c.context, 600); return c.context; }),
  ]);

  const parts = [
    `DATA ATUAL: ${new Date().toLocaleDateString("pt-BR", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`,
    `INDICADORES (Banco Central do Brasil): Selic ${selic ?? "~11"}% a.a. · CDI ${cdi ?? "~11"}% a.a. · IPCA ${ipca ?? "~4.5"}% a.a.`,
    `NÍVEL DO USUÁRIO NA TRILHA: ${context?.userLevel ?? 1}/5`,
  ];
  if (context?.levelContext) parts.push(`CONTEXTO DO USUÁRIO:\n${String(context.levelContext).slice(0, 800)}`);
  if (context?.portfolio) parts.push(`CARTEIRA SIMULADA DO USUÁRIO:\n${String(context.portfolio).slice(0, 800)}`);
  const liveMarkets = buildLiveMarketsBlock();
  if (liveMarkets) parts.push(liveMarkets);
  parts.push(cerebro
    ? `BASE DE CONHECIMENTO CEREBRO (material curado; cite como [C1], [C2]…):\n${cerebro}`
    : "BASE DE CONHECIMENTO CEREBRO: nenhum material relevante para esta pergunta. NÃO invente notícias, números de mercado ou eventos recentes — responda com o conhecimento conceitual e, se o dado recente fizer falta, diga isso ao usuário.");
  return parts.join("\n\n");
}

/** Núcleo do chat — valida, monta contexto e chama o Claude (com ou sem streaming). */
export async function runChat(body: ChatRequest, onDelta?: (text: string) => void): Promise<string> {
  const message = String(body.message ?? "").trim().slice(0, 4_000);
  const dynamic = await buildChatDynamicContext(message, body.context);
  return streamClaude({
    model: "claude-sonnet-4-6",
    maxTokens: 1024,
    system: CHAT_SYSTEM,
    systemDynamic: dynamic,
    messages: [...sanitizeHistory(body.history), { role: "user", content: message }],
    timeoutMs: 55_000,
    onDelta,
  });
}

export function chatGuards(req: Request, res: Response): boolean {
  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(503).json({ error: "AI service not configured. Add ANTHROPIC_API_KEY to .env" });
    return false;
  }
  const { message } = (req.body ?? {}) as ChatRequest;
  if (!message?.trim()) { res.status(400).json({ error: "message is required" }); return false; }
  const ip = req.ip ?? "unknown";
  if (isRateLimited(`chat:${ip}`, 10, 60_000)) {
    res.status(429).json({ error: "rate_limited", message: "Muitas mensagens. Aguarde um instante." });
    return false;
  }
  return true;
}
