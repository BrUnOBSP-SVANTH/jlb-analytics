"""
rss_collector.py — JLB Analytics Cerebro

Coleta artigos de feeds RSS e posts do Reddit, traduz os títulos para pt-BR
e armazena em cerebro_articles no Supabase.

Tradução: Google Translate (primário, sem cota) → MyMemory (fallback).
Só aceita artigos dos últimos MAX_ARTICLE_AGE_DAYS dias.

Uso:
  python rss_collector.py              # coleta todos os feeds
  python rss_collector.py --dry-run    # imprime sem salvar
  python rss_collector.py --limit 20   # máximo de artigos por feed
  python rss_collector.py --cleanup    # apaga artigos corrompidos do banco
  python rss_collector.py --days 3     # só artigos dos últimos 3 dias

Requisitos:
  pip install feedparser httpx python-dotenv
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import logging
import os
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from typing import Any

try:
    import feedparser
    import httpx
    from dotenv import load_dotenv
except ImportError:
    sys.exit(
        "Dependências ausentes. Execute:\n"
        "  pip install feedparser httpx python-dotenv"
    )

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("cerebro")

MAX_ARTICLE_AGE_DAYS = 7  # só artigos dos últimos N dias

# ─── Feeds ────────────────────────────────────────────────────────────────────
#
# Organizado por relevância para Polymarket / Kalshi:
# política → econômica/macro → esportes → cripto → ciência/tech → Brasil
#
FEEDS: list[dict[str, str]] = [

    # ── Política / Geopolítica (tópicos quentes em mercados preditivos) ──────
    {
        "url": "https://thehill.com/news/feed/",
        "source": "The Hill",
        "category": "política",
    },
    {
        "url": "https://feeds.bbci.co.uk/news/world/rss.xml",
        "source": "BBC World",
        "category": "política",
    },
    # Cobertura internacional com ângulo NÃO-anglo: prevemos bastante Oriente
    # Médio/geopolítica (iran 23 + geopolitics 7 + middle east 6 + military
    # strikes 6 = 42 previsões em 45 dias) e a fonte era só BBC/Guardian, ambas
    # britânicas. Al Jazeera cobre a região de dentro, com pauta e timing
    # diferentes — é justamente onde um mercado global tende a demorar a
    # precificar. Verificado: 25 itens.
    {
        "url": "https://www.aljazeera.com/xml/rss/all.xml",
        "source": "Al Jazeera",
        "category": "política",
    },
    {
        "url": "https://www.theguardian.com/world/rss",
        "source": "The Guardian World",
        "category": "política",
    },
    {
        "url": "https://agenciabrasil.ebc.com.br/rss/politica/feed.xml",
        "source": "Agência Brasil",
        "category": "política",
    },
    # Política BR era a nossa VANTAGEM real (o Cérebro acerta em cheio pergunta
    # sobre aprovação do Lula) e ao mesmo tempo a área mais magra: só Agência
    # Brasil (310) + r/brasil (721), contra 3.358 do InfoMoney. Se o pivô é o
    # público brasileiro, esta é a fonte que precisa engordar.
    # (G1 política foi testado e DESCARTADO: responde 200 mas sem <item> — fonte
    # que falha em silêncio é pior que fonte ausente.)
    {
        "url": "https://www.poder360.com.br/feed/",
        "source": "Poder360",
        "category": "política",
    },
    {
        "url": "https://www.reddit.com/r/worldnews/.rss",
        "source": "r/worldnews",
        "category": "política",
    },
    {
        "url": "https://www.reddit.com/r/politics/.rss",
        "source": "r/politics",
        "category": "política",
    },
    {
        "url": "https://www.reddit.com/r/brasil/.rss",
        "source": "r/brasil",
        "category": "política",
    },

    # ── Mercados preditivos (blog oficial das plataformas) ───────────────────
    {
        "url": "https://kalshi.com/blog/rss",
        "source": "Kalshi Blog",
        "category": "mercados",
    },
    {
        "url": "https://www.reddit.com/r/predictit/.rss",
        "source": "r/predictit",
        "category": "mercados",
    },
    {
        "url": "https://www.reddit.com/r/PredictionMarkets/.rss",
        "source": "r/PredictionMarkets",
        "category": "mercados",
    },

    # ── Macro / Economia ─────────────────────────────────────────────────────
    {
        "url": "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114",
        "source": "CNBC Markets",
        "category": "macro",
    },
    {
        "url": "https://feeds.bloomberg.com/markets/news.rss",
        "source": "Bloomberg Markets",
        "category": "macro",
    },
    {
        "url": "https://www.infomoney.com.br/feed/",
        "source": "InfoMoney",
        "category": "macro",
    },
    {
        "url": "https://valor.globo.com/financas/rss",
        "source": "Valor Econômico",
        "category": "macro",
    },
    {
        "url": "https://www.reddit.com/r/MacroEconomics/.rss",
        "source": "r/MacroEconomics",
        "category": "macro",
    },
    {
        "url": "https://www.reddit.com/r/investing/.rss",
        "source": "r/investing",
        "category": "macro",
    },
    {
        "url": "https://www.reddit.com/r/Economia/.rss",
        "source": "r/Economia",
        "category": "macro",
    },

    # ── Esportes (futebol, NBA, NFL, MMA — grandes apostas) ─────────────────
    {
        "url": "https://ge.globo.com/rss/ge/",
        "source": "Globo Esporte",
        "category": "esportes",
    },
    {
        "url": "https://www.reddit.com/r/soccer/.rss",
        "source": "r/soccer",
        "category": "esportes",
    },
    {
        "url": "https://www.reddit.com/r/nba/.rss",
        "source": "r/nba",
        "category": "esportes",
    },
    {
        "url": "https://www.reddit.com/r/nfl/.rss",
        "source": "r/nfl",
        "category": "esportes",
    },
    {
        "url": "https://www.reddit.com/r/MMA/.rss",
        "source": "r/MMA",
        "category": "esportes",
    },
    # ── Lacunas fechadas em 30/08/2026 ──────────────────────────────────────
    # Medição que motivou: cruzamos as FONTES com o VOLUME DE PREVISÕES e o
    # descasamento era grande — e-sports é nossa MAIOR categoria (82 resolvidos)
    # e tinha ZERO fontes; tênis (33) idem; beisebol aparecia nos mercados sem
    # nenhuma cobertura. O sintoma disso era o Cérebro devolver post de r/MMA
    # como "contexto" de um jogo de beisebol — ele buscava até achar qualquer
    # coisa, porque não havia a coisa certa.
    {
        "url": "https://www.reddit.com/r/leagueoflegends/.rss",
        "source": "r/leagueoflegends",
        "category": "esports",
    },
    {
        "url": "https://www.reddit.com/r/GlobalOffensive/.rss",
        "source": "r/GlobalOffensive",
        "category": "esports",
    },
    {
        "url": "https://www.reddit.com/r/VALORANT/.rss",
        "source": "r/VALORANT",
        "category": "esports",
    },
    {
        "url": "https://www.reddit.com/r/tennis/.rss",
        "source": "r/tennis",
        "category": "esportes",
    },
    {
        "url": "https://www.reddit.com/r/baseball/.rss",
        "source": "r/baseball",
        "category": "esportes",
    },
    {
        "url": "https://www.reddit.com/r/Predictem/.rss",
        "source": "r/Predictem",
        "category": "esportes",
    },

    # ── Cripto ───────────────────────────────────────────────────────────────
    {
        "url": "https://cointelegraph.com/feed",
        "source": "CoinTelegraph",
        "category": "cripto",
    },
    {
        "url": "https://decrypt.co/feed",
        "source": "Decrypt",
        "category": "cripto",
    },
    {
        "url": "https://www.theblock.co/rss.xml",
        "source": "The Block",
        "category": "cripto",
    },
    {
        "url": "https://www.reddit.com/r/CryptoCurrency/.rss",
        "source": "r/CryptoCurrency",
        "category": "cripto",
    },

    # ── Ciência / Tecnologia / IA ────────────────────────────────────────────
    {
        "url": "https://www.technologyreview.com/feed/",
        "source": "MIT Tech Review",
        "category": "ciência",
    },
    {
        "url": "https://www.reddit.com/r/artificial/.rss",
        "source": "r/artificial",
        "category": "ciência",
    },
]

# ─── Helpers ──────────────────────────────────────────────────────────────────

def slug_for(url: str) -> str:
    return hashlib.sha1(url.encode()).hexdigest()[:16]


def parse_date(entry: Any) -> str | None:
    ts = entry.get("published_parsed") or entry.get("updated_parsed")
    if ts:
        try:
            dt = datetime(*ts[:6], tzinfo=timezone.utc)
            return dt.isoformat()
        except Exception:
            pass
    return None


def is_recent(published_at: str | None, max_days: int) -> bool:
    """True se o artigo é dos últimos max_days dias (ou sem data — aceita)."""
    if not published_at:
        return True
    try:
        dt = datetime.fromisoformat(published_at.replace("Z", "+00:00"))
        cutoff = datetime.now(timezone.utc) - timedelta(days=max_days)
        return dt >= cutoff
    except Exception:
        return True


def extract_tags(entry: Any, category: str) -> list[str]:
    tags: list[str] = [category]
    for tag in entry.get("tags", []):
        term = (tag.get("term") or "").strip().lower()
        if term and len(term) < 40:
            tags.append(term)
    return list(dict.fromkeys(tags))[:8]


# ─── Tradução ─────────────────────────────────────────────────────────────────

_TRANSLATION_ERROR_MARKERS = (
    "mymemory warning",
    "you used all",
    "quota",
    "next available in",
    "invalid language pair",
    "must be shorter than",
)


def _is_translation_error(text: str) -> bool:
    t = text.lower()
    return any(m in t for m in _TRANSLATION_ERROR_MARKERS)


async def _try_google_translate(client: httpx.AsyncClient, text: str) -> str | None:
    """Google Translate unofficial — sem cota, sem chave."""
    try:
        resp = await client.get(
            "https://translate.googleapis.com/translate_a/single",
            params={"client": "gtx", "sl": "en", "tl": "pt-BR", "dt": "t", "q": text[:500]},
            headers={"User-Agent": "Mozilla/5.0"},
            timeout=6.0,
        )
        if resp.status_code != 200:
            return None
        data = resp.json()
        chunks = data[0] if isinstance(data, list) and data else []
        result = "".join(c[0] for c in chunks if isinstance(c, list) and c).strip()
        return result if result and not _is_translation_error(result) else None
    except Exception:
        return None


async def _try_mymemory(client: httpx.AsyncClient, text: str) -> str | None:
    """MyMemory como fallback — tem cota diária."""
    try:
        resp = await client.get(
            "https://api.mymemory.translated.net/get",
            params={"q": text[:500], "langpair": "en|pt-BR"},
            timeout=8.0,
        )
        data = resp.json()
        if data.get("responseStatus") != 200:
            return None
        result: str = data.get("responseData", {}).get("translatedText", "").strip()
        return result if result and not _is_translation_error(result) else None
    except Exception:
        return None


async def _try_groq(client: httpx.AsyncClient, text: str) -> str | None:
    """
    3º tradutor: Groq (grátis, rápido, com chave própria).

    Existe porque os dois gratuitos SEM chave passaram a bloquear em massa — e o
    efeito foi invisível: o artigo era salvo em inglês e seguia a vida. A medição
    que revelou (30/08/2026): títulos em inglês no acervo saltaram de ~0,6% até
    10/08 para 10,3% e depois 38,3% na semana corrente. Como o índice FTS é
    português, cada título em inglês é um artigo que a busca por palavra deixa de
    achar. Degradação silenciosa do Cérebro, semana após semana.
    """
    key = os.getenv("GROQ_API_KEY", "")
    if not key:
        return None
    model = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
    try:
        resp = await client.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": "Traduza para português do Brasil. Responda APENAS com a tradução, sem aspas nem comentários."},
                    {"role": "user", "content": text[:500]},
                ],
                "max_tokens": 300,
                "temperature": 0,
            },
            timeout=15.0,
        )
        if resp.status_code != 200:
            return None
        content = resp.json()["choices"][0]["message"]["content"].strip()
        # Um modelo pode "explicar" em vez de traduzir; título traduzido não vira
        # texto 3x maior que o original.
        if not content or len(content) > len(text) * 3:
            return None
        return content if not _is_translation_error(content) else None
    except Exception:
        return None


_PT_WORDS = {"do", "da", "de", "no", "na", "em", "com", "que", "por", "uma", "são", "foi", "está"}


async def translate_to_pt(client: httpx.AsyncClient, text: str) -> str:
    if not text:
        return text
    words = set(text.lower().split())
    if len(words & _PT_WORDS) >= 2:
        return text
    result = await _try_google_translate(client, text)
    if result:
        return result
    result = await _try_mymemory(client, text)
    if result:
        return result
    # Último recurso antes de salvar em inglês (que envenena o índice PT).
    result = await _try_groq(client, text)
    return result if result else text


# ─── Supabase ─────────────────────────────────────────────────────────────────

def _supa_headers(service_key: str) -> dict[str, str]:
    return {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
    }


async def upsert_articles(
    client: httpx.AsyncClient,
    supabase_url: str,
    service_key: str,
    articles: list[dict],
) -> int:
    if not articles:
        return 0
    url = f"{supabase_url}/rest/v1/cerebro_articles"
    headers = {**_supa_headers(service_key), "Prefer": "resolution=merge-duplicates,return=minimal"}
    try:
        resp = await client.post(url, headers=headers, json=articles, timeout=30.0)
        if resp.status_code in (200, 201):
            return len(articles)
        log.warning("Supabase upsert status %s: %s", resp.status_code, resp.text[:300])
        return 0
    except Exception as exc:
        log.error("Supabase upsert error: %s", exc)
        return 0


async def cleanup_bad_articles(
    client: httpx.AsyncClient,
    supabase_url: str,
    service_key: str,
    dry_run: bool,
) -> int:
    """Remove artigos com título corrompido (mensagens de erro de tradução)."""
    markers = ["MYMEMORY", "YOU USED ALL", "QUOTA", "NEXT AVAILABLE IN", "TRANSLATED.NET"]
    headers = _supa_headers(service_key)
    deleted = 0

    for marker in markers:
        url = (
            f"{supabase_url}/rest/v1/cerebro_articles"
            f"?title=ilike.*{marker}*"
            f"&select=id,title"
            f"&limit=200"
        )
        try:
            resp = await client.get(url, headers=headers, timeout=15.0)
            if not resp.ok:
                log.warning("Erro ao buscar artigos com '%s': %s", marker, resp.text[:200])
                continue
            rows = resp.json()
            if not rows:
                continue

            log.info("Encontrados %d artigos com '%s'", len(rows), marker)
            for row in rows:
                log.info("  [bad] %s", row.get("title", "")[:80])

            if dry_run:
                deleted += len(rows)
                continue

            del_url = f"{supabase_url}/rest/v1/cerebro_articles?title=ilike.*{marker}*"
            del_resp = await client.delete(del_url, headers=headers, timeout=15.0)
            if del_resp.status_code in (200, 204):
                deleted += len(rows)
                log.info("  → %d artigos removidos", len(rows))
            else:
                log.warning("Erro ao deletar: %s", del_resp.text[:200])
        except Exception as exc:
            log.error("Erro no cleanup '%s': %s", marker, exc)

    return deleted


# ─── Coleta de um feed ────────────────────────────────────────────────────────

async def collect_feed(
    client: httpx.AsyncClient,
    feed_cfg: dict[str, str],
    limit: int,
    max_days: int,
    dry_run: bool,
    supabase_url: str,
    service_key: str,
) -> int:
    source = feed_cfg["source"]
    category = feed_cfg["category"]
    feed_url = feed_cfg["url"]

    log.info("Coletando %s…", source)

    # O Reddit responde 429 quando as requisições vêm coladas — e ANTES isso caía
    # no mesmo "Sem entries" de um feed legitimamente vazio. Ou seja: metade das
    # fontes podia estar sendo BLOQUEADA e o log dizia a mesma coisa que diria se
    # não houvesse notícia nova. Falha silenciosa é o pior tipo — foi assim que a
    # fila de resolução ficou 4 dias parada sem ninguém notar.
    resp = None
    for attempt in range(3):
        try:
            resp = await client.get(feed_url, timeout=15.0, follow_redirects=True)
        except Exception as exc:
            log.warning("Falha ao buscar %s: %s", source, exc)
            return 0
        if resp.status_code != 429:
            break
        wait = 5 * (attempt + 1)  # 5s, 10s — o Reddit solta rápido
        log.info("  → %s respondeu 429 (limite); aguardando %ss…", source, wait)
        await asyncio.sleep(wait)

    if resp is not None and resp.status_code == 429:
        log.warning("  ⚠️ %s BLOQUEADO por rate limit após 3 tentativas — sem coleta desta vez", source)
        return 0
    if resp is not None and resp.status_code >= 400:
        log.warning("  ⚠️ %s respondeu HTTP %s — feed quebrado?", source, resp.status_code)
        return 0

    feed = feedparser.parse(resp.text)
    entries = feed.entries[:limit]
    if not entries:
        # Agora só chega aqui com HTTP 200: é feed realmente sem novidade OU
        # formato inesperado — nunca mais um bloqueio disfarçado.
        log.info("  → Sem entries em %s (HTTP 200 — feed vazio ou formato inesperado)", source)
        return 0

    articles: list[dict] = []
    for entry in entries:
        url = entry.get("link") or entry.get("id") or ""
        if not url:
            continue

        title_raw = entry.get("title", "").strip()
        if not title_raw:
            continue

        published_at = parse_date(entry)

        # Descarta artigos muito antigos
        if not is_recent(published_at, max_days):
            continue

        title = await translate_to_pt(client, title_raw)

        # Nunca salvar erros de tradução
        if _is_translation_error(title):
            log.warning("  [skip] erro de tradução em '%s'", title_raw[:60])
            continue

        summary_raw = (entry.get("summary") or entry.get("description") or "").strip()
        summary_clean = re.sub(r"<[^>]+>", "", summary_raw)[:500].strip()
        summary: str | None = None
        if summary_clean:
            translated_summary = await translate_to_pt(client, summary_clean)
            if not _is_translation_error(translated_summary):
                summary = translated_summary

        article = {
            "slug": slug_for(url),
            "title": title,
            "source": source,
            "category": category,
            "url": url,
            "summary": summary,
            "tags": extract_tags(entry, category),
            "published_at": published_at,
            "status": "active",
        }
        articles.append(article)

    if not articles:
        log.info("  → 0 artigos recentes de %s", source)
        return 0

    if dry_run:
        for a in articles:
            print(json.dumps({k: a[k] for k in ("title", "source", "category", "url")}, ensure_ascii=False))
        return len(articles)

    saved = await upsert_articles(client, supabase_url, service_key, articles)
    log.info("  → %d/%d artigos salvos de %s", saved, len(articles), source)
    return saved


# ─── Main ─────────────────────────────────────────────────────────────────────

async def main() -> None:
    parser = argparse.ArgumentParser(description="JLB Cerebro — RSS Collector")
    parser.add_argument("--dry-run", action="store_true", help="Imprime sem salvar")
    parser.add_argument("--cleanup", action="store_true", help="Remove artigos corrompidos do banco")
    parser.add_argument("--limit", type=int, default=15, help="Máximo de artigos por feed (padrão: 15)")
    parser.add_argument("--days", type=int, default=MAX_ARTICLE_AGE_DAYS, help="Janela de tempo em dias (padrão: 7)")
    parser.add_argument("--feed", help="Coletar só este source (ex: Reuters Politics)")
    args = parser.parse_args()

    supabase_url = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL", "")
    service_key = os.getenv("SUPABASE_SERVICE_KEY", "")

    if not args.dry_run:
        if not supabase_url:
            sys.exit("SUPABASE_URL não configurada no .env")
        if not service_key:
            sys.exit("SUPABASE_SERVICE_KEY não configurada.")

    async with httpx.AsyncClient(
        headers={"User-Agent": "JLB-Cerebro/1.0 (educational)"},
    ) as client:

        # Limpeza de artigos corrompidos
        if args.cleanup:
            log.info("=== Limpando artigos corrompidos ===")
            removed = await cleanup_bad_articles(client, supabase_url, service_key, args.dry_run)
            log.info("Total removidos: %d%s", removed, " (dry-run)" if args.dry_run else "")
            if not args.dry_run:
                log.info("Limpeza concluída. Execute novamente sem --cleanup para re-coletar.")
                return

        feeds = FEEDS
        if args.feed:
            feeds = [f for f in FEEDS if args.feed.lower() in f["source"].lower()]
            if not feeds:
                sys.exit(f"Feed '{args.feed}' não encontrado. Disponíveis: {[f['source'] for f in FEEDS]}")

        total = 0
        t0 = time.monotonic()

        for feed_cfg in feeds:
            count = await collect_feed(
                client, feed_cfg, args.limit, args.days,
                args.dry_run, supabase_url, service_key,
            )
            total += count
            # Pausa maior depois do Reddit: ele responde 429 quando as requisições
            # vêm coladas, e o Reddit é ~40% das nossas fontes — perder o bloco
            # inteiro por pressa é caro. 0,5s serve para os demais (RSS comum
            # aguenta bem). O cron roda em background: 3s a mais por feed do
            # Reddit não custa nada e evita o bloqueio.
            await asyncio.sleep(3.0 if "reddit.com" in feed_cfg["url"] else 0.5)

        elapsed = time.monotonic() - t0
        log.info("Concluído: %d artigos em %.1fs (janela: %d dias)", total, elapsed, args.days)


if __name__ == "__main__":
    asyncio.run(main())
