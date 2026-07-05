"""
market_snapshots.py — JLB Analytics
Coleta snapshots diários de Polymarket e Kalshi e salva no Supabase.

Uso:
  python market_snapshots.py [--dry-run] [--limit N] [--source polymarket|kalshi|all]

Requer:
  SUPABASE_URL + SUPABASE_SERVICE_KEY no .env
"""

import argparse
import asyncio
import os
import sys
from datetime import datetime, timezone
from typing import Optional

import httpx
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

POLYMARKET_URL = (
    "https://gamma-api.polymarket.com/events"
    "?active=true&closed=false&limit={limit}&order=volume&ascending=false&with_nested_markets=true"
)
KALSHI_URL = (
    "https://api.elections.kalshi.com/trade-api/v2/events"
    "?with_nested_markets=true&limit={limit}&status=open"
)
MANIFOLD_URL = "https://api.manifold.markets/v0/markets?limit={limit}&sort=liquidity"


def supabase_headers() -> dict:
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
    }


def to_float(v) -> Optional[float]:
    if v is None:
        return None
    try:
        return float(str(v))
    except (ValueError, TypeError):
        return None


async def fetch_polymarket(client: httpx.AsyncClient, limit: int) -> list[dict]:
    url = POLYMARKET_URL.format(limit=limit)
    try:
        r = await client.get(url, timeout=20)
        r.raise_for_status()
        events = r.json()
    except Exception as e:
        print(f"[polymarket] fetch error: {e}", file=sys.stderr)
        return []

    rows: list[dict] = []
    for ev in events:
        for m in ev.get("markets") or []:
            prices_raw = m.get("outcomePrices")
            yes_prob: Optional[float] = None
            if prices_raw:
                try:
                    prices = (
                        prices_raw
                        if isinstance(prices_raw, list)
                        else __import__("json").loads(prices_raw)
                    )
                    yes_prob = round(float(prices[0]) * 100, 2)
                except Exception:
                    pass

            rows.append(
                {
                    "market_id": str(m.get("id", "")),
                    "source": "polymarket",
                    "title": (m.get("question") or ev.get("title") or "")[:500],
                    "category": ev.get("category") or (ev.get("tags") or [{}])[0].get("label"),
                    "yes_prob": yes_prob,
                    "volume": to_float(m.get("volume") or ev.get("volume")),
                    "volume_24h": to_float(m.get("volume24hr") or ev.get("volume24hr")),
                    "liquidity": to_float(m.get("liquidity") or ev.get("liquidity")),
                    "status": "open",
                    "outcome": None,
                }
            )
    return rows


async def fetch_kalshi(client: httpx.AsyncClient, limit: int) -> list[dict]:
    url = KALSHI_URL.format(limit=limit)
    try:
        r = await client.get(url, timeout=20)
        r.raise_for_status()
        data = r.json()
    except Exception as e:
        print(f"[kalshi] fetch error: {e}", file=sys.stderr)
        return []

    rows: list[dict] = []
    for ev in data.get("events") or []:
        for m in ev.get("markets") or []:
            yes_price_raw = m.get("yes_price") or m.get("yes_bid")
            yes_prob: Optional[float] = None
            if yes_price_raw is not None:
                try:
                    yes_prob = round(float(str(yes_price_raw)) * 100, 2)
                except Exception:
                    pass

            rows.append(
                {
                    "market_id": str(m.get("ticker") or m.get("id", "")),
                    "source": "kalshi",
                    "title": (m.get("title") or ev.get("title") or "")[:500],
                    "category": ev.get("category"),
                    "yes_prob": yes_prob,
                    "volume": to_float(m.get("volume")),
                    "volume_24h": to_float(m.get("volume_24h")),
                    "liquidity": None,
                    "status": "open",
                    "outcome": None,
                }
            )
    return rows


async def fetch_manifold(client: httpx.AsyncClient, limit: int) -> list[dict]:
    url = MANIFOLD_URL.format(limit=limit)
    try:
        r = await client.get(url, timeout=20)
        r.raise_for_status()
        markets = r.json()
    except Exception as e:
        print(f"[manifold] fetch error: {e}", file=sys.stderr)
        return []

    rows: list[dict] = []
    for m in markets:
        if m.get("outcomeType") != "BINARY":
            continue
        rows.append(
            {
                "market_id": str(m.get("id", "")),
                "source": "manifold",
                "title": (m.get("question") or "")[:500],
                "category": m.get("category"),
                "yes_prob": to_float(m.get("probability", 0)) and round(float(m.get("probability", 0)) * 100, 2),
                "volume": to_float(m.get("volume")),
                "volume_24h": None,
                "liquidity": to_float(m.get("totalLiquidity")),
                "status": "open" if not m.get("isResolved") else "resolved",
                "outcome": m.get("resolution") == "YES" if m.get("isResolved") else None,
            }
        )
    return rows


async def upsert_rows(client: httpx.AsyncClient, rows: list[dict], dry_run: bool) -> int:
    if not rows:
        return 0
    if dry_run:
        print(f"  [dry-run] {len(rows)} rows — não inseridas")
        return len(rows)

    url = f"{SUPABASE_URL}/rest/v1/market_snapshots"
    # upsert with daily uniqueness key
    headers = {**supabase_headers(), "Prefer": "resolution=merge-duplicates,return=minimal"}

    # Batch em chunks de 200
    inserted = 0
    for i in range(0, len(rows), 200):
        chunk = rows[i : i + 200]
        try:
            r = await client.post(url, json=chunk, headers=headers, timeout=30)
            if r.status_code not in (200, 201, 204):
                print(f"  [upsert] HTTP {r.status_code}: {r.text[:200]}", file=sys.stderr)
            else:
                inserted += len(chunk)
        except Exception as e:
            print(f"  [upsert] error: {e}", file=sys.stderr)
    return inserted


async def main(dry_run: bool, limit: int, source: str):
    if not dry_run and (not SUPABASE_URL or not SUPABASE_KEY):
        print("❌  SUPABASE_URL e SUPABASE_SERVICE_KEY são obrigatórios.", file=sys.stderr)
        sys.exit(1)

    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    print(f"[snapshots] Iniciando coleta — {now}")

    async with httpx.AsyncClient() as client:
        tasks = []
        if source in ("all", "polymarket"):
            tasks.append(fetch_polymarket(client, limit))
        if source in ("all", "kalshi"):
            tasks.append(fetch_kalshi(client, limit))
        if source in ("all", "manifold"):
            tasks.append(fetch_manifold(client, limit))

        results = await asyncio.gather(*tasks)

    all_rows: list[dict] = []
    for r in results:
        all_rows.extend(r)

    # Adiciona snapped_at e snap_date explícitos.
    # snap_date é a chave do índice de unicidade diário — deve ser enviado pelo cliente
    # para garantir consistência (o DEFAULT no Postgres funcionaria, mas o ON CONFLICT
    # precisa que o valor seja o mesmo em insert e no índice existente).
    now_utc = datetime.now(timezone.utc)
    snap_ts = now_utc.isoformat()
    snap_date = now_utc.strftime("%Y-%m-%d")  # YYYY-MM-DD, UTC
    for row in all_rows:
        row["snapped_at"] = snap_ts
        row["snap_date"] = snap_date

    print(f"[snapshots] Coletados: {len(all_rows)} mercados")

    async with httpx.AsyncClient() as client:
        inserted = await upsert_rows(client, all_rows, dry_run)

    print(f"[snapshots] {'Inseridos/atualizados' if not dry_run else 'Simulados'}: {inserted}")
    return inserted


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Coleta snapshots diários de mercados preditivos")
    parser.add_argument("--dry-run", action="store_true", help="Não insere no Supabase")
    parser.add_argument("--limit", type=int, default=100, help="Mercados por fonte (padrão: 100)")
    parser.add_argument("--source", choices=["all", "polymarket", "kalshi", "manifold"], default="all")
    args = parser.parse_args()

    asyncio.run(main(dry_run=args.dry_run, limit=args.limit, source=args.source))
