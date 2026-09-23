import { REGRA_LINGUAGEM } from "./linguagem.ts";
import type { Request, Response } from "express";
import { fetchJSON } from "../fetcher.ts";
import { fetchBcbSerie } from "../bcb.ts";
import { parsePolyPrices } from "../aiForecasts.ts";
import { callClaude } from "../anthropic.ts";
import { extractJson } from "../extractJson.ts";
import { INJECTION_GUARD } from "./promptSafety.ts";
import { getCache, setCache } from "../cache.ts";
import { autorizadoComChaveDeServico } from "../chaveDeServico.ts";
import { hojeEmBrasilia, segundosAteVirarODia } from "../../../shared/dataBrasilia.ts";
import { lerBriefingDoDia, gravarBriefingDoDia } from "./briefingGuardado.ts";
import { tituloLimpo } from "../marketCatalog.ts";
import { macroParaPrompt } from "./macroParaPrompt.ts";
import { log } from "../log.ts";
import type { NewsApiResponse, PolyEvent, KalshiEventsResponse } from "../types.ts";

/** Mensagem honesta para quem lê a tela, a partir do erro do provedor. */
export function motivoDoBriefing(erro: unknown): { error: string; message: string } {
  const bruto = erro instanceof Error ? erro.message : String(erro ?? "");
  // ⚠️ NUNCA repassar o texto do provedor. Em 17/09 a resposta pública trazia o
  // ID da nossa organização no Groq e a URL de cobrança do Google — quem lê a
  // tela não pode fazer nada com isso, e não deveria ver.
  const semCota = /\b429\b|quota|rate.?limit|insufficient|credit|exceeded/i.test(bruto);
  return semCota
    ? {
        error: "briefing_sem_cota",
        message: "O briefing de hoje ainda não saiu: a cota diária de IA acabou. Ele volta assim que a cota renova.",
      }
    : {
        error: "briefing_indisponivel",
        message: "Não foi possível gerar o briefing agora. Tente de novo em alguns minutos.",
      };
}

export async function dailyBriefingHandler(req: Request, res: Response) {
  // A análise passa por Anthropic → Gemini → Groq, então UMA chave basta. Exigir
  // a da Anthropic era o mesmo defeito que deixou o Cérebro 65 dias sem sintetizar.
  const temIA = !!(process.env.ANTHROPIC_API_KEY || process.env.GEMINI_API_KEY || process.env.GROQ_API_KEY);
  if (!temIA) {
    return res.status(503).json({ error: "ia_nao_configurada", message: "O briefing depende da IA, que não está configurada neste ambiente." });
  }

  // O dia é o de BRASÍLIA. Com a data UTC, o briefing "de hoje" trocava às 21h
  // — no meio da noite de quem lê — e a geração era paga de novo (SEG-02).
  const today = hojeEmBrasilia();
  // ⚠️ `force` regenera com IA, NewsAPI, Polymarket, Kalshi e BCB. Esta rota é
  // PÚBLICA: até 21/09 qualquer visitante podia chamá-la com `?force=1` (era o
  // que o botão "Atualizar" da tela fazia) e queimar a cota do site inteiro —
  // 20 vezes por minuto por IP. Agora só quem tem a chave de serviço regenera;
  // o botão relê o que está guardado.
  const force = req.query.force === "1" && autorizadoComChaveDeServico(req.headers.authorization);
  const cacheKey = `daily-briefing:${today}`;
  if (!force) {
    const cached = getCache<object>(cacheKey);
    if (cached) return res.json({ ...cached, cached: true });
    // Memória vazia não quer dizer "não existe": o processo reinicia a cada
    // deploy, e o briefing do dia continua guardado no banco.
    const guardado = await lerBriefingDoDia(today);
    if (guardado) {
      setCache(cacheKey, guardado, segundosAteVirarODia());
      return res.json({ ...guardado, cached: true });
    }
  }

  const [polyResult, kalshiResult, ratesResult] = await Promise.allSettled([
    fetchJSON<PolyEvent[]>("https://gamma-api.polymarket.com/events?active=true&closed=false&limit=15&order=volume&ascending=false&with_nested_markets=true"),
    fetchJSON<KalshiEventsResponse>("https://api.elections.kalshi.com/trade-api/v2/events?limit=15&with_nested_markets=true", { "Accept": "application/json" }),
    Promise.all([fetchBcbSerie(432), fetchBcbSerie(13522), fetchBcbSerie(1)]),
  ]);

  const topMarkets: { source: string; title: string; prob: number }[] = [];

  if (polyResult.status === "fulfilled") {
    for (const ev of polyResult.value.slice(0, 8)) {
      const m = ev.markets?.[0];
      if (!m) continue;
      const prices = parsePolyPrices(m.outcomePrices);
      const yesProb = prices[0] !== undefined ? Math.round(prices[0] * 100) : null;
      // Mesma régua do catálogo: título com buraco de interpolação não vai para
      // a tela nem para o prompt — cai no título do evento.
      const titulo = tituloLimpo(m.question) ?? tituloLimpo(ev.title);
      if (titulo && yesProb !== null) topMarkets.push({ source: "Polymarket", title: titulo, prob: yesProb });
    }
  }
  if (kalshiResult.status === "fulfilled") {
    for (const ev of (kalshiResult.value.events ?? []).slice(0, 8)) {
      const m = ev.markets?.[0];
      if (!m) continue;
      const bid = parseFloat(m.yes_bid_dollars ?? "0") * 100;
      const ask = parseFloat(m.yes_ask_dollars ?? "0") * 100;
      const yesProb = bid > 0 && ask > 0 ? Math.round((bid + ask) / 2) : null;
      // "Will  become President of the United States before 2045?" — o Kalshi
      // publica o buraco, e isto chegava à tela do briefing e ao prompt da IA.
      const titulo = tituloLimpo(m.title) ?? tituloLimpo(ev.title);
      if (titulo && yesProb !== null) topMarkets.push({ source: "Kalshi", title: titulo, prob: yesProb });
    }
  }

  const [selic, ipca, usd] = ratesResult.status === "fulfilled" ? ratesResult.value : [null, null, null];

  const NEWS_KEY = process.env.NEWS_API_KEY ?? "";
  let newsHeadlines: string[] = [];
  if (NEWS_KEY) {
    try {
      const from2 = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const data = await fetchJSON<NewsApiResponse>(`https://newsapi.org/v2/everything?q=markets+economy+prediction&pageSize=6&sortBy=publishedAt&from=${from2}&language=en&apiKey=${NEWS_KEY}`);
      newsHeadlines = (data.articles ?? []).filter((a) => a.title !== "[Removed]").slice(0, 5).map((a) => `• ${a.title} (${a.source.name})`);
    } catch { /* skip */ }
  }

  const marketsContext = topMarkets.length > 0
    ? topMarkets.map((m) => `- [${m.source}] ${m.title}: ${m.prob}% SIM`).join("\n")
    : "Dados de mercados temporariamente indisponíveis.";

  const prompt = `Você é um analista quantitativo sênior gerando um briefing matinal para traders brasileiros.
${REGRA_LINGUAGEM}

DATA: ${new Date().toLocaleDateString("pt-BR", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
MACRO: ${macroParaPrompt({ selic, ipca, usd })}

TOP MERCADOS:
${marketsContext}

MANCHETES:
${newsHeadlines.length > 0 ? newsHeadlines.join("\n") : "Sem manchetes disponíveis."}

${INJECTION_GUARD}

JSON exato (sem markdown). Em marketHighlights, "prob" é a probabilidade SIM do mercado em número 0-100 (nunca texto):
{"headline":"","summary":"","topTheme":"","macroNote":"","marketHighlights":[{"market":"","prob":0,"insight":""}],"watchToday":"","calibrationTip":"","riskAlert":null}`;

  try {
    const raw = await callClaude({ model: "claude-haiku-4-5-20251001", maxTokens: 1000, messages: [{ role: "user", content: prompt }], timeoutMs: 25_000, prefillJson: false });
    const parsed = extractJson(raw) as { marketHighlights?: { market?: string; prob?: unknown; insight?: string }[] };
    // O modelo às vezes preenche "prob" com um rótulo de texto — normaliza para número 0-100 ou null
    const marketHighlights = (Array.isArray(parsed.marketHighlights) ? parsed.marketHighlights : [])
      .filter((h) => h?.market && h?.insight)
      .map((h) => {
        const n = Number(h.prob);
        return { ...h, prob: Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : null };
      });
    const result = { ...parsed, marketHighlights, topMarkets, generatedAt: new Date().toISOString(), cached: false };
    // Guarda no banco ANTES de responder: se o processo cair em seguida (deploy,
    // plano grátis dormindo), o briefing do dia não se perde e ninguém paga a
    // geração de novo.
    await gravarBriefingDoDia(today, result);
    setCache(cacheKey, result, segundosAteVirarODia());
    res.json(result);
  } catch (err) {
    log.error("[daily-briefing] error:", err);
    // 503, não 500: não é defeito do código, é fonte indisponível — e a mensagem
    // que vai para a tela diz o que está acontecendo, em português.
    res.status(503).json(motivoDoBriefing(err));
  }
}
