import { Router } from "express";
import { getCache, setCache } from "../lib/cache.ts";
import { SUPABASE_URL, SUPABASE_KEY } from "../lib/supabaseRest.ts";
import { log } from "../lib/log.ts";

/**
 * Fonte Reddit — lida do CÉREBRO, não buscada de novo no Reddit.
 *
 * HISTÓRICO, porque a conclusão foi contraintuitiva. Em 02/09 o endpoint
 * `/hot.json` começou a responder 403 (nem com User-Agent de navegador passa) e a
 * fonte morreu em silêncio: a rota devolvia 502, o cliente engolia no catch e as
 * 60 vagas da tela principal ficavam vazias sem alarme nenhum.
 *
 * A primeira tentativa foi trocar por `.rss` e aquecer o cache em segundo plano.
 * Funcionou na máquina local e FALHOU em produção — 429 em todos os subreddits. A
 * leitura fácil seria "o Reddit bloqueia IP de datacenter". Estava errada.
 *
 * O que a medição mostrou: as 12 fontes de Reddit DO CÉREBRO estavam todas
 * saudáveis, coletadas nas últimas 24h, do MESMO IP. A diferença não era o IP, era
 * a FREQUÊNCIA — o coletor pede de 2 em 2 horas com 3s de pausa; meu aquecimento
 * pedia 7 subreddits a cada 15 minutos. Os dois disputavam a mesma cota, e o mais
 * ganancioso derrubava o outro.
 *
 * Daí esta versão: quem fala com o Reddit é UM só — o coletor do Cérebro, que já
 * funciona. Esta rota lê o que ele guardou. Ganhos além de não levar 429: o texto
 * já vem TRADUZIDO para português pelo coletor, e some a duplicidade de manter
 * duas listas de subreddits em lugares diferentes.
 *
 * ⚠️ O que continua ausente: votos e comentários. Nem o RSS nem o Cérebro têm essa
 * métrica. Os campos saem indefinidos e quem exibe trata a ausência — post sem
 * métrica é honesto, post com métrica inventada não. (Ver client/src/lib/trending.ts.)
 */

export interface RedditPostRSS {
  title: string;
  url: string;
  permalink: string;
  subreddit: string;
  author: string;
  created_utc: number;
  selftext?: string;
  /** Ausentes de propósito — ver o cabeçalho. */
  score?: number;
  num_comments?: number;
}

const router = Router();

const CACHE_S = 10 * 60;   // o Cérebro coleta de 2 em 2h; 10 min de cache é folgado

interface ArtigoCerebro {
  title: string; url: string | null; summary: string | null;
  published_at: string | null; ingested_at: string;
}

router.get("/:subreddit", async (req, res) => {
  const sub = req.params.subreddit.replace(/[^a-zA-Z0-9_]/g, "");
  if (!sub) return res.status(400).json({ error: "invalid subreddit" });

  const cacheKey = `reddit:${sub}`;
  const cached = getCache<RedditPostRSS[]>(cacheKey);
  if (cached) { res.json({ posts: cached, source: "cache" }); return; }

  if (!SUPABASE_URL || !SUPABASE_KEY) return res.json({ posts: [], source: "sem-banco" });

  const limit = Math.min(parseInt(String(req.query.limit ?? "25"), 10), 50);
  try {
    const url = `${SUPABASE_URL}/rest/v1/cerebro_articles`
      + `?source=eq.${encodeURIComponent(`r/${sub}`)}&status=eq.active`
      + `&select=title,url,summary,published_at,ingested_at`
      + `&order=ingested_at.desc&limit=${limit}`;
    const r = await fetch(url, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      signal: AbortSignal.timeout(8_000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status} ao ler o Cérebro`);

    const artigos = await r.json() as ArtigoCerebro[];
    const posts: RedditPostRSS[] = artigos.map((a) => {
      const quando = Date.parse(a.published_at ?? a.ingested_at);
      const link = a.url ?? "";
      return {
        title: a.title,
        url: link,
        permalink: link.replace(/^https?:\/\/(www\.)?reddit\.com/, ""),
        subreddit: sub,
        author: "",                       // o Cérebro não guarda o autor do post
        created_utc: Number.isFinite(quando) ? Math.floor(quando / 1000) : Math.floor(Date.now() / 1000),
        selftext: a.summary ?? undefined,
      };
    });

    setCache(cacheKey, posts, CACHE_S);
    res.json({ posts, source: "cerebro" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    log.warn(`[Reddit/${sub}] leitura do Cérebro falhou:`, msg);
    // Lista vazia em vez de 502: a tela mostra as outras fontes e segue viva.
    res.json({ posts: [], source: "indisponivel" });
  }
});

export default router;
