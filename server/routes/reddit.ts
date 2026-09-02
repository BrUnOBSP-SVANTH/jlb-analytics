import { Router } from "express";
import { getCache, setCache } from "../lib/cache.ts";
import { log } from "../lib/log.ts";

/**
 * Fonte Reddit — via FEED RSS, não pela API JSON.
 *
 * POR QUE MUDOU. O endpoint `/hot.json` passou a responder **403** para nós, e não
 * é questão de User-Agent: testado em 02/09 com UA de navegador, também 403. Com
 * isso a fonte morreu EM SILÊNCIO — a rota devolvia 502, o cliente engolia no
 * catch e as 60 vagas reservadas na tela principal ficavam vazias sem nenhum
 * alarme. O feed `.rss` do mesmo subreddit responde 200 com 25 entradas; é o
 * caminho que o coletor do Cérebro usa há meses.
 *
 * ⚠️ O QUE SE PERDE, E POR QUE NÃO INVENTAMOS. O RSS publica título, link, autor e
 * data — **não publica votos nem número de comentários**. O cliente montava texto
 * em cima disso ("viral em 3h com 1.200 votos"). Preencher com zero seria afirmar
 * que o post não tem votos, e chutar um número seria pior: em vez disso os campos
 * saem AUSENTES e quem exibe trata a ausência. Post sem métrica é honesto; post
 * com métrica falsa não.
 *
 * ⚠️ RATE LIMIT AGRESSIVO. Medido: algumas requisições seguidas já derrubam para
 * 429, e leva minutos para liberar. Daí o cache longo (15 min), o espaçamento
 * entre chamadas ao Reddit e o "serve o cache velho em vez de falhar".
 */

export interface RedditPostRSS {
  title: string;
  url: string;
  permalink: string;
  subreddit: string;
  author: string;
  created_utc: number;
  /** Ausentes de propósito: o RSS não os publica. Ver o cabeçalho. */
  score?: number;
  num_comments?: number;
}

const router = Router();

/**
 * Subreddits que a tela principal consome. Ficam AQUI (e não só no cliente) porque
 * o servidor precisa deles para aquecer o cache em segundo plano — ver
 * `aquecerReddit`. Manter em sincronia com REDDIT_SUBS do cliente.
 */
export const SUBREDDITS = ["sportsbook", "futebol", "soccer", "PredictionMarkets",
  "geopolitics", "wallstreetbets", "investing"];

/**
 * Preenche o cache em SEGUNDO PLANO, um subreddit por vez.
 *
 * Por que não buscar sob demanda: a tela pede os 7 subreddits EM PARALELO e o
 * Reddit responde 429 na hora — medido. Espaçar no servidor resolveria o 429 mas
 * levaria ~21s, e o cliente desiste em 8s. Buscando fora do caminho do usuário, a
 * requisição dele sempre encontra cache pronto e instantâneo.
 */
export async function aquecerReddit(): Promise<void> {
  let espera = ESPACO_AQUECIMENTO_MS;
  for (const sub of SUBREDDITS) {
    if (getCache(`reddit:${sub}`)) continue;          // ainda fresco, não gasta cota
    try {
      const posts = await buscarSubreddit(sub, 25);
      setCache(`reddit:${sub}`, posts, CACHE_S);
      setCache(`reddit:${sub}:ultimo`, posts, CACHE_RESERVA_S);
      espera = ESPACO_AQUECIMENTO_MS;                 // deu certo: volta ao ritmo normal
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn(`[Reddit] aquecimento de r/${sub}: ${msg}`);
      // 429 = estamos de castigo. Insistir no mesmo ritmo só prolonga; dobra a
      // espera (até 4 min) e tenta o próximo no ciclo seguinte.
      if (msg.includes("429")) espera = Math.min(espera * 2, 240_000);
    }
    await new Promise((r) => setTimeout(r, espera));
  }
}

const CACHE_S = 20 * 60;        // 20 min de cache fresco
const CACHE_RESERVA_S = 12 * 3600; // 12h de reserva — é ela que segura a tela no castigo
/**
 * Espaçamento entre idas ao Reddit no aquecimento.
 *
 * ⚠️ 3s NÃO basta — medido: com 3s entre elas, as sete viraram 429 em sequência.
 * O limite do Reddit é bem mais apertado do que o do coletor do Cérebro sugeria
 * (lá são 3s, mas rodando de 2 em 2 horas, não em rajada). Com 45s as sete levam
 * ~5 min, folgado dentro do ciclo de 15 min.
 */
const ESPACO_AQUECIMENTO_MS = 45_000;

const semTags = (s: string) =>
  s.replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ").trim();

/** Extrai o conteúdo da primeira tag `nome` do trecho. */
const tag = (xml: string, nome: string): string => {
  const m = xml.match(new RegExp(`<${nome}[^>]*>([\\s\\S]*?)</${nome}>`));
  return m ? semTags(m[1]) : "";
};

/** Atom do Reddit → nosso formato. Exportada para teste. */
export function parseRedditRSS(xml: string, sub: string): RedditPostRSS[] {
  const entradas = xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? [];
  const out: RedditPostRSS[] = [];
  for (const e of entradas) {
    const title = tag(e, "title");
    const href = (e.match(/<link[^>]*href="([^"]+)"/) ?? [])[1] ?? "";
    if (!title || !href) continue;                       // entrada inútil, pula
    const quando = tag(e, "published") || tag(e, "updated");
    const ts = Date.parse(quando);
    out.push({
      title,
      url: href,
      // O cliente monta o link como `reddit.com${permalink}` — guardamos o caminho.
      permalink: href.replace(/^https?:\/\/(www\.)?reddit\.com/, ""),
      subreddit: sub,
      author: tag(e, "name").replace(/^\/u\//, ""),
      created_utc: Number.isFinite(ts) ? Math.floor(ts / 1000) : Math.floor(Date.now() / 1000),
    });
  }
  return out;
}

/** Uma ida ao Reddit. Lança em erro. Só o aquecimento chama — o espaçamento
 *  entre chamadas é responsabilidade de quem orquestra (ver `aquecerReddit`). */
async function buscarSubreddit(sub: string, limit: number): Promise<RedditPostRSS[]> {
  const r = await fetch(`https://www.reddit.com/r/${sub}/.rss`, {
    headers: { "User-Agent": "JLBAnalytics/1.0 (educational platform)", Accept: "application/atom+xml" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} no feed de r/${sub}`);

  const posts = parseRedditRSS(await r.text(), sub).slice(0, limit);
  if (posts.length === 0) throw new Error(`feed de r/${sub} veio sem entradas`);
  return posts;
}

router.get("/:subreddit", async (req, res) => {
  const sub = req.params.subreddit.replace(/[^a-zA-Z0-9_]/g, "");
  if (!sub) return res.status(400).json({ error: "invalid subreddit" });

  const cacheKey = `reddit:${sub}`;
  const cached = getCache<RedditPostRSS[]>(cacheKey);
  if (cached) { res.json({ posts: cached, source: "cache" }); return; }

  // ⚠️ A requisição do usuário NUNCA vai ao Reddit. Ela lê cache, senão a reserva,
  // senão devolve vazio. Quem fala com o Reddit é só o aquecimento, espaçado.
  // Motivo: o rate limit é apertado o bastante para que uma visita à tela (7
  // subreddits de uma vez) derrube tudo para 429 — e aí NINGUÉM vê nada. Tirando
  // o usuário do caminho, ele sempre pega resposta instantânea, e o pior caso é
  // conteúdo de algumas horas atrás, com a idade visível no card.
  const reserva = getCache<RedditPostRSS[]>(`${cacheKey}:ultimo`);
  if (reserva?.length) { res.json({ posts: reserva, source: "stale" }); return; }

  // Nada em cache ainda: o aquecimento roda no boot e a cada 15 min.
  res.json({ posts: [], source: "warming" });
});

export default router;
