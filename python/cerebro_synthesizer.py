"""
cerebro_synthesizer.py — JLB Analytics Cerebro

Lê artigos brutos de cerebro_articles (Supabase), agrupa por categoria e data,
gera sínteses wiki por IA e salva em cerebro_analyses.

A IA vem da MESMA cadeia do servidor — Anthropic → Gemini → Groq —, e basta uma
das três chaves. Antes daqui só falar com a Anthropic, e por isso o Cérebro
passou 65 dias sem sintetizar quando os créditos acabaram (ver `chamar_ia`).

Uso:
  python cerebro_synthesizer.py                    # sintetiza artigos das últimas 24h
  python cerebro_synthesizer.py --days 3           # artigos dos últimos 3 dias
  python cerebro_synthesizer.py --category cripto  # só uma categoria
  python cerebro_synthesizer.py --dry-run          # imprime sem salvar

Requisitos:
  pip install httpx python-dotenv

Variáveis de ambiente (.env):
  SUPABASE_URL             — URL do projeto Supabase
  SUPABASE_SERVICE_KEY     — chave service_role
  ANTHROPIC_API_KEY        — 1ª opção de IA (melhor qualidade)
  GEMINI_API_KEY           — 2ª opção (free tier; é o que sustenta o site hoje)
  GROQ_API_KEY             — 3ª opção (rápida e grátis)
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import logging
import os
import sys
from datetime import datetime, timedelta, timezone
from typing import Any

try:
    # O SDK da Anthropic saiu: as três IAs são chamadas por HTTP (ver `chamar_ia`).
    # Uma dependência a menos é um motivo a menos para o cron morrer na instalação.
    import httpx
    from dotenv import load_dotenv
except ImportError:
    sys.exit(
        "Dependências ausentes. Execute:\n"
        "  pip install httpx python-dotenv"
    )

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("synthesizer")

# ─── Configuração ─────────────────────────────────────────────────────────────

CATEGORY_DOMAINS: dict[str, list[str]] = {
    "macro":     ["Economia", "Finanças"],
    "cripto":    ["Cripto", "Finanças"],
    "esportes":  ["Esportes"],
    "política":  ["Política"],
    "ciência":   ["Ciência", "Tech"],
    "mercados":  ["Mercados Preditivos", "Economia"],
    "geral":     ["Geral"],
}

WIKI_TYPE_MAP: dict[str, str] = {
    "macro":    "synthesis",
    "cripto":   "synthesis",
    "esportes": "synthesis",
    "política": "synthesis",
    "ciência":  "synthesis",
    "mercados": "synthesis",
    "geral":    "synthesis",
}

# ─── Supabase helpers ─────────────────────────────────────────────────────────

async def fetch_articles(
    client: httpx.AsyncClient,
    supabase_url: str,
    service_key: str,
    since_iso: str,
    category: str | None = None,
    limit: int = 60,
) -> list[dict]:
    url = f"{supabase_url}/rest/v1/cerebro_articles"
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
    }
    params: dict[str, Any] = {
        "status": "eq.active",
        "ingested_at": f"gte.{since_iso}",
        "order": "published_at.desc",
        "limit": limit,
        "select": "id,slug,title,source,category,summary,tags,published_at",
    }
    if category:
        params["category"] = f"eq.{category}"

    try:
        resp = await client.get(url, headers=headers, params=params, timeout=15.0)
        if resp.status_code == 200:
            return resp.json()
        log.warning("Supabase fetch status %s: %s", resp.status_code, resp.text[:200])
        return []
    except Exception as exc:
        log.error("Supabase fetch error: %s", exc)
        return []


async def upsert_analysis(
    client: httpx.AsyncClient,
    supabase_url: str,
    service_key: str,
    analysis: dict,
) -> bool:
    url = f"{supabase_url}/rest/v1/cerebro_analyses"
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }
    try:
        resp = await client.post(url, headers=headers, json=[analysis], timeout=20.0)
        if resp.status_code not in (200, 201):
            log.error("Supabase upsert 400: %s", resp.text[:500])
        return resp.status_code in (200, 201)
    except Exception as exc:
        log.error("Supabase upsert error: %s", exc)
        return False


# ─── Claude synthesis ─────────────────────────────────────────────────────────

def build_prompt(category: str, articles: list[dict], date_label: str) -> str:
    summaries = []
    for a in articles[:12]:
        tags = ", ".join(a.get("tags", [])[:4])
        summary = a.get("summary") or ""
        summaries.append(
            f"- [{a['source']}] {a['title']}" +
            (f"\n  Resumo: {summary[:180]}" if summary else "") +
            (f"\n  Tags: {tags}" if tags else "")
        )

    return f"""Você é um analista sênior do JLB Analytics gerando uma síntese de conhecimento para a plataforma de educação quantitativa.

Categoria: {category}
Data: {date_label}
Número de artigos: {len(articles)}

Artigos coletados:
{chr(10).join(summaries)}

Gere uma síntese wiki concisa (máx 250 palavras) em português brasileiro:
1. Tema principal e tendências emergentes
2. 2-3 insights quantitativos relevantes
3. Conexão com mercados preditivos quando aplicável

IMPORTANTE: NÃO use citações numéricas como [1], [2]. Se precisar atribuir um
fato a uma fonte, escreva o NOME dela por extenso (ex.: "segundo a Bloomberg").

RETORNE SOMENTE O JSON ABAIXO, SEM TEXTO ANTES OU DEPOIS, SEM MARKDOWN:
{{"title":"título conciso (max 60 chars)","content":"síntese em português (max 250 palavras)","tags":["tag1","tag2","tag3"],"keyInsight":"frase-chave do principal achado"}}"""


# ─── Cadeia de provedores: Anthropic → Gemini → Groq ──────────────────────────
#
# POR QUE ISTO EXISTE. Este script chamava SÓ a Anthropic. Quando os créditos
# acabaram, ele passou a falhar em silêncio a cada duas horas — e o Cérebro
# ficou 65 DIAS sem gerar síntese (última em 14/07/2026, descoberto em 17/09).
# A coleta de notícias seguiu normal o tempo todo, então nada parecia quebrado:
# o site continuava anunciando "sínteses IA ativas" e servindo as de julho.
#
# O servidor Node já tinha a cadeia de três provedores por causa desse mesmo
# risco (lib/anthropic.ts → gemini.ts → groq.ts). Aqui ela é replicada em HTTP
# puro, com os MESMOS modelos e a mesma ordem, para não depender de SDK.
#
# A ordem importa e é a medida: Anthropic é a melhor; o Gemini free é o plano B
# que sustenta o site; o Groq é rápido e grátis, último porque a qualidade cai.

ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-haiku-4-5-20251001")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-flash-lite-latest")
GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")


async def _via_anthropic(http: httpx.AsyncClient, prompt: str, max_tokens: int) -> str | None:
    key = os.getenv("ANTHROPIC_API_KEY", "")
    if not key:
        return None
    r = await http.post(
        "https://api.anthropic.com/v1/messages",
        headers={"x-api-key": key, "anthropic-version": "2023-06-01", "Content-Type": "application/json"},
        json={"model": ANTHROPIC_MODEL, "max_tokens": max_tokens, "messages": [{"role": "user", "content": prompt}]},
        timeout=60.0,
    )
    r.raise_for_status()
    return "".join(b.get("text", "") for b in r.json().get("content", []) if b.get("type") == "text")


async def _via_gemini(http: httpx.AsyncClient, prompt: str, max_tokens: int) -> str | None:
    key = os.getenv("GEMINI_API_KEY", "")
    if not key:
        return None
    # A chave vai no CABEÇALHO, não na URL: o httpx registra a URL completa em
    # nível INFO, e com `?key=` a chave do Gemini aparecia inteira no log do
    # servidor (visto na primeira execução, 18/09).
    r = await http.post(
        f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent",
        headers={"Content-Type": "application/json", "x-goog-api-key": key},
        json={
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {"maxOutputTokens": max_tokens},
        },
        timeout=60.0,
    )
    r.raise_for_status()
    cands = r.json().get("candidates", [])
    if not cands:
        return None
    return "".join(p.get("text", "") for p in cands[0].get("content", {}).get("parts", []))


async def _via_groq(http: httpx.AsyncClient, prompt: str, max_tokens: int) -> str | None:
    key = os.getenv("GROQ_API_KEY", "")
    if not key:
        return None
    r = await http.post(
        "https://api.groq.com/openai/v1/chat/completions",
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        json={"model": GROQ_MODEL, "max_tokens": max_tokens, "messages": [{"role": "user", "content": prompt}]},
        timeout=60.0,
    )
    r.raise_for_status()
    return r.json()["choices"][0]["message"]["content"]


async def chamar_ia(http: httpx.AsyncClient, prompt: str, max_tokens: int = 1200) -> tuple[str, str] | None:
    """Texto da IA e qual provedor respondeu. `None` só quando os TRÊS falham."""
    for nome, chamar in (("anthropic", _via_anthropic), ("gemini", _via_gemini), ("groq", _via_groq)):
        try:
            texto = await chamar(http, prompt, max_tokens)
            if texto and texto.strip():
                return texto.strip(), nome
            log.warning("  → %s sem chave ou resposta vazia; tentando o próximo", nome)
        except Exception as exc:
            log.warning("  → %s falhou (%s); tentando o próximo", nome, str(exc)[:160])
    log.error("  → TODOS os provedores falharam — nenhuma síntese nesta rodada")
    return None


async def synthesize_category(
    http: httpx.AsyncClient,
    category: str,
    articles: list[dict],
    date_label: str,
) -> dict | None:
    if not articles:
        return None

    prompt = build_prompt(category, articles, date_label)
    resposta = await chamar_ia(http, prompt)
    if not resposta:
        return None
    raw, provedor = resposta
    try:
        # Remove markdown code fences
        raw = raw.replace("```json", "").replace("```", "").strip()
        # Extract outermost {...}
        start = raw.find("{")
        end = raw.rfind("}")
        if start == -1 or end == -1:
            raise json.JSONDecodeError("No JSON object found", raw, 0)
        data = json.loads(raw[start:end + 1])
        data["_provedor"] = provedor
        return data
    except json.JSONDecodeError as exc:
        log.warning("JSON inválido de %s para %s: %s", provedor, category, exc)
        return None


# ─── Main ─────────────────────────────────────────────────────────────────────

async def main() -> None:
    parser = argparse.ArgumentParser(description="JLB Cerebro — Synthesizer")
    parser.add_argument("--dry-run", action="store_true", help="Imprime sem salvar")
    parser.add_argument("--days", type=int, default=1, help="Artigos dos últimos N dias (padrão: 1)")
    parser.add_argument("--category", help="Processar só esta categoria")
    args = parser.parse_args()

    supabase_url = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL", "")
    service_key = os.getenv("SUPABASE_SERVICE_KEY", "")
    # Basta UM provedor. Exigir a Anthropic era o que derrubava o script inteiro
    # quando os créditos acabavam — com duas alternativas configuradas ao lado.
    provedores = [p for p in ("ANTHROPIC_API_KEY", "GEMINI_API_KEY", "GROQ_API_KEY") if os.getenv(p, "")]

    if not args.dry_run:
        if not supabase_url:
            sys.exit("SUPABASE_URL não configurada.")
        if not service_key:
            sys.exit("SUPABASE_SERVICE_KEY não configurada.")
    if not provedores:
        sys.exit("Nenhum provedor de IA configurado (ANTHROPIC_API_KEY, GEMINI_API_KEY ou GROQ_API_KEY).")
    log.info("Provedores disponíveis, em ordem: %s", ", ".join(provedores))

    since = (datetime.now(timezone.utc) - timedelta(days=args.days)).isoformat()
    date_label = datetime.now(timezone.utc).strftime("%d/%m/%Y")

    categories = [args.category] if args.category else list(CATEGORY_DOMAINS.keys())

    total_saved = 0
    async with httpx.AsyncClient(
        headers={"User-Agent": "JLB-Cerebro-Synthesizer/1.0"},
    ) as http:
        for cat in categories:
            log.info("Processando categoria: %s…", cat)

            articles = []
            if not args.dry_run:
                articles = await fetch_articles(http, supabase_url, service_key, since, cat)
            else:
                # dry-run: gera com dados fictícios para testar o prompt
                articles = [
                    {"source": "InfoMoney", "title": f"Exemplo de artigo sobre {cat}", "summary": "Resumo de teste.", "tags": [cat]},
                ]

            if not articles:
                log.info("  → Sem artigos novos para %s", cat)
                continue

            log.info("  → %d artigos encontrados, sintetizando…", len(articles))
            result = await synthesize_category(http, cat, articles, date_label)
            if not result:
                log.warning("  → Falha na síntese de %s", cat)
                continue

            slug = hashlib.sha1(f"{cat}:{date_label}".encode()).hexdigest()[:16]
            analysis = {
                "slug": slug,
                "title": result.get("title", f"Síntese {cat} — {date_label}"),
                "wiki_type": WIKI_TYPE_MAP.get(cat, "synthesis"),
                "domains": CATEGORY_DOMAINS.get(cat, ["Geral"]),
                "tags": result.get("tags", [cat]),
                "content": result.get("content", ""),
                "sources_used": list({a["source"] for a in articles}),
                "status": "active",
                "wiki_date": datetime.now(timezone.utc).date().isoformat(),
            }

            if args.dry_run:
                print(json.dumps(analysis, ensure_ascii=False, indent=2))
                total_saved += 1
                continue

            ok = await upsert_analysis(http, supabase_url, service_key, analysis)
            if ok:
                log.info("  → Síntese salva (%s): %s", result.get("_provedor", "?"), analysis["title"])
                total_saved += 1
            else:
                log.warning("  → Falha ao salvar síntese de %s", cat)

            await asyncio.sleep(2.0)  # rate limit Claude

    log.info("Concluído: %d sínteses geradas", total_saved)


if __name__ == "__main__":
    asyncio.run(main())
