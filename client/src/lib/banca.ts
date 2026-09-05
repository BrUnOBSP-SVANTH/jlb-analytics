/**
 * Banca simulada — a ponte entre a tela e a conta do usuário.
 *
 * Duas responsabilidades, e nada além disso:
 *  1. Ler e gravar as apostas na conta (Supabase, com RLS) — não mais em
 *     localStorage, onde trocar de aparelho apagava a banca inteira.
 *  2. Trazer os mercados REAIS do mesmo cache que abastece a aba Mercados, para
 *     que o preço da simulação seja o preço que está na tela ao lado.
 *
 * A matemática do dinheiro NÃO mora aqui: mora em shared/banca.ts, que o
 * servidor também usa para liquidar. Uma conta só, dos dois lados.
 */
import { supabase } from "./supabase";
import { getAllMarkets } from "./marketsCache";
import type { PolyBet, KalshiMarket } from "./trending";
import { SALDO_INICIAL, type Aposta, type Lado } from "@shared/banca";

/** Uma aposta da banca, como a tela precisa dela. */
export interface ApostaBanca extends Aposta {
  id: string;
  marketId: string;
  pergunta: string;
  fonte: "polymarket" | "kalshi";
  urlExterna: string | null;
  fechaEm: string | null;
  criadaEm: string;
  pago: number | null;
  fonteResolucao: string | null;
  liquidadaEm: string | null;
}

/** Um mercado real disponível para apostar. */
export interface MercadoBanca {
  id: string;              // poly-<id> | kalshi-<ticker> — o formato que o liquidador entende
  titulo: string;
  probSim: number;         // 0–1, ao vivo
  urlExterna: string;
  fechaEm: string | null;
  fonte: "polymarket" | "kalshi";
  volume: number;
  categoria: string;
}

interface LinhaPaperBet {
  id: string;
  market_id: string;
  market_question: string;
  source: "polymarket" | "kalshi";
  external_url: string | null;
  closes_at: string | null;
  side: Lado;
  entry_price: number | string;
  stake: number | string;
  created_at: string;
  resolved: boolean;
  outcome: boolean | null;
  payout: number | string | null;
  resolution_source: string | null;
  settled_at: string | null;
}

function daLinha(l: LinhaPaperBet): ApostaBanca {
  return {
    id: l.id,
    marketId: l.market_id,
    pergunta: l.market_question,
    fonte: l.source,
    urlExterna: l.external_url,
    fechaEm: l.closes_at,
    criadaEm: l.created_at,
    lado: l.side,
    precoEntrada: Number(l.entry_price),
    valor: Number(l.stake),
    resolvido: l.resolved,
    desfecho: l.outcome,
    pago: l.payout === null ? null : Number(l.payout),
    fonteResolucao: l.resolution_source,
    liquidadaEm: l.settled_at,
  };
}

// ── Apostas na conta ─────────────────────────────────────────────────────────

/** As apostas do usuário, mais recentes primeiro. RLS garante que são só as dele. */
export async function carregarApostas(): Promise<ApostaBanca[]> {
  const { data, error } = await supabase
    .from("paper_bets")
    .select("*")
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return (data as LinhaPaperBet[]).map(daLinha);
}

export interface NovaAposta {
  mercado: MercadoBanca;
  lado: Lado;
  valor: number;
}

/**
 * Registra a aposta. O preço gravado é o do MERCADO no instante do clique —
 * nunca um preço escolhido pelo usuário. Deixar escolher o preço de entrada
 * seria simular uma compra que não existiria: ninguém compra a 20% o que está
 * sendo negociado a 80%. O palpite do usuário aparece na tela como comparação,
 * não como preço.
 */
export async function registrarAposta(nova: NovaAposta): Promise<{ ok: true; aposta: ApostaBanca } | { ok: false; erro: string }> {
  const { data: sessao } = await supabase.auth.getUser();
  const userId = sessao?.user?.id;
  if (!userId) return { ok: false, erro: "Entre na sua conta para usar a banca simulada." };

  const { data, error } = await supabase
    .from("paper_bets")
    .insert({
      user_id: userId,
      market_id: nova.mercado.id,
      source: nova.mercado.fonte,
      market_question: nova.mercado.titulo,
      external_url: nova.mercado.urlExterna,
      closes_at: nova.mercado.fechaEm,
      side: nova.lado,
      entry_price: nova.mercado.probSim,
      stake: nova.valor,
    })
    .select()
    .single();

  if (error) {
    // 23505 = índice único: já existe aposta desse usuário nesse lado do mercado.
    const jaExiste = error.code === "23505";
    return {
      ok: false,
      erro: jaExiste
        ? "Você já tem uma aposta nesse lado deste mercado. Cancele a atual para apostar de novo."
        : "Não foi possível registrar a aposta. Tente de novo em instantes.",
    };
  }
  return { ok: true, aposta: daLinha(data as LinhaPaperBet) };
}

/**
 * Cancela uma aposta ABERTA e devolve o valor à banca. A política de RLS recusa
 * apagar aposta já liquidada — desfazer o resultado seria apagar justamente a
 * perda que não agradou, e a banca deixaria de significar alguma coisa.
 */
export async function cancelarAposta(id: string): Promise<boolean> {
  const { error } = await supabase.from("paper_bets").delete().eq("id", id);
  return !error;
}

// ── Mercados reais para apostar ──────────────────────────────────────────────

function numero(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function probPoly(m: PolyBet): number | null {
  if (typeof m.yesProb === "number" && Number.isFinite(m.yesProb)) return m.yesProb;
  if (m.outcomePrices) {
    try {
      const arr = JSON.parse(m.outcomePrices) as string[];
      const p = parseFloat(arr?.[0]);
      if (Number.isFinite(p)) return p;
    } catch { /* preço ilegível → mercado fica de fora, não vira 50% inventado */ }
  }
  return null;
}

/**
 * Os mercados que a banca aceita. Vêm do mesmo cache compartilhado da aba
 * Mercados, então o preço aqui é o preço de lá — atualizado no mesmo ritmo,
 * sem uma segunda fonte que possa divergir.
 *
 * Manifold fica de fora de propósito: é dinheiro de brincadeira, o preço não
 * carrega a mesma informação e não há liquidação oficial para pagar a aposta.
 */
export async function carregarMercados(): Promise<MercadoBanca[]> {
  const { polymarket, kalshi } = await getAllMarkets<PolyBet, KalshiMarket>();

  const poly: MercadoBanca[] = polymarket
    .filter((m) => m.active && !m.closed)
    .map((m): MercadoBanca | null => {
      const p = probPoly(m);
      if (p === null) return null;
      const titulo = m.eventTitle && m.eventTitle.length > 10 && m.eventTitle !== m.question
        ? m.eventTitle : (m.question ?? "");
      return {
        id: `poly-${m.id}`,
        titulo,
        probSim: p,
        urlExterna: m.externalUrl ?? (m.eventSlug ? `https://polymarket.com/pt/event/${m.eventSlug}` : "https://polymarket.com/pt"),
        fechaEm: m.endDate ?? m.closeTime ?? null,
        fonte: "polymarket" as const,
        volume: numero(m.volume),
        categoria: m.category ?? "",
      };
    })
    .filter((m): m is MercadoBanca => m !== null);

  const kal: MercadoBanca[] = kalshi
    .filter((m) => typeof m.yesProb === "number" && Number.isFinite(m.yesProb))
    .map((m) => ({
      id: `kalshi-${m.ticker}`,
      titulo: m.title ?? "",
      probSim: m.yesProb,
      urlExterna: m.externalUrl ?? `https://kalshi.com/markets/${(m.seriesTicker ?? "").toLowerCase()}/${(m.eventTicker ?? "").toLowerCase()}`,
      fechaEm: m.closeTime ?? null,
      fonte: "kalshi" as const,
      volume: numero(m.volume),
      categoria: m.category ?? "",
    }));

  // Título curto demais não identifica evento nenhum; o mais líquido primeiro,
  // que é onde o preço significa mais.
  return [...poly, ...kal]
    .filter((m) => m.titulo.length > 8)
    .sort((a, b) => b.volume - a.volume);
}

/**
 * Atualiza o preço das apostas ABERTAS com a cotação de agora — é o que faz a
 * banca acompanhar o mercado entre a aposta e o resultado. Quem já liquidou não
 * se mexe mais: o valor dela é o que a plataforma pagou, não o preço de hoje.
 */
export function marcarAMercado(apostas: ApostaBanca[], mercados: MercadoBanca[]): ApostaBanca[] {
  const precos = new Map(mercados.map((m) => [m.id, m.probSim]));
  return apostas.map((a) =>
    a.resolvido ? a : { ...a, precoAtual: precos.get(a.marketId) });
}

export { SALDO_INICIAL };
