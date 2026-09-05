/**
 * cerebroLimpeza — descarta a notícia que já não serve a ninguém.
 *
 * POR QUE EXISTE. O Cérebro cresce ~660 artigos por dia e NUNCA descartava por
 * idade — só havia limpeza de artigo corrompido. Medido em 03/09/2026: 24.716
 * artigos ocupando ~226MB dos 500MB do plano gratuito do Supabase, com ~5MB
 * entrando por dia. Nesse ritmo o banco enche em menos de dois meses, e aí a
 * conta deixa de ser opcional.
 *
 * POR QUE É SEGURO DESCARTAR. Nada no site consulta notícia velha:
 *   · o coletor só aceita artigo dos últimos 7 dias;
 *   · a precificação usa janela de 3 a 14 dias (ver MAX_IDADE_PRECIFICACAO_DIAS);
 *   · as demais buscas de contexto ranqueiam por recência.
 * Artigo de 3 meses não aparece em lugar nenhum — só ocupa espaço e ainda arrasta
 * o índice de busca semântica, que fica mais lento quanto maior a tabela.
 *
 * ⚠️ Apagar é IRREVERSÍVEL. Por isso o padrão é só CONTAR, e a exclusão exige
 * pedido explícito. E a margem é generosa de propósito: 90 dias é seis vezes a
 * maior janela que o site realmente usa.
 */
import { SUPABASE_URL, SUPABASE_KEY, supaWriteHeaders } from "./supabaseRest.ts";
import { log } from "./log.ts";

/**
 * 60 dias — escolhido por medição, não por gosto.
 *
 * A maior janela OPERACIONAL do site é 14 dias (precificação), e o estudo
 * `pnpm news:impact` olha 45. Sessenta dá quatro vezes a primeira e folga sobre o
 * segundo.
 *
 * O ganho que importa não é o espaço liberado hoje (~65MB), é o TETO: com ~660
 * artigos/dia entrando, a retenção estabiliza o acervo em torno de 40 mil artigos
 * (~310MB) em vez de crescer para sempre. Sem ela, o plano gratuito de 500MB
 * enchia em menos de dois meses.
 */
export const RETENCAO_DIAS = 60;

export interface ResultadoLimpeza {
  candidatos: number;
  apagados: number;
  espacoLiberadoMb: number;
  erro?: string;
}

/**
 * ~8KB por artigo: o embedding são 1536 números de 4 bytes (~6KB) e o texto
 * (título + resumo + conteúdo) fica perto de 2KB. É estimativa, não medição do
 * banco — serve para dimensionar o ganho, não para relatório contábil.
 */
const KB_POR_ARTIGO = 8;

export async function limparArtigosAntigos(
  { aplicar = false, dias = RETENCAO_DIAS }: { aplicar?: boolean; dias?: number } = {},
): Promise<ResultadoLimpeza> {
  const vazio: ResultadoLimpeza = { candidatos: 0, apagados: 0, espacoLiberadoMb: 0 };
  if (!SUPABASE_URL || !SUPABASE_KEY) return { ...vazio, erro: "supabase ausente" };

  const corte = new Date(Date.now() - dias * 86_400_000).toISOString();
  const filtro = `ingested_at=lt.${corte}`;

  try {
    // Conta primeiro, sempre — mesmo quando vai apagar. Saber o tamanho do
    // estrago antes de causá-lo é o mínimo numa operação irreversível.
    const r = await fetch(`${SUPABASE_URL}/rest/v1/cerebro_articles?select=id&${filtro}`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Prefer: "count=exact", Range: "0-0" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) return { ...vazio, erro: `contagem falhou: HTTP ${r.status}` };
    const candidatos = Number((r.headers.get("content-range") ?? "/0").split("/")[1]) || 0;
    const espacoLiberadoMb = Number(((candidatos * KB_POR_ARTIGO) / 1024).toFixed(1));

    if (!aplicar || candidatos === 0) return { candidatos, apagados: 0, espacoLiberadoMb };

    const del = await fetch(`${SUPABASE_URL}/rest/v1/cerebro_articles?${filtro}`, {
      method: "DELETE",
      headers: { ...supaWriteHeaders(), Prefer: "return=minimal" },
      signal: AbortSignal.timeout(60_000),
    });
    if (!del.ok) return { candidatos, apagados: 0, espacoLiberadoMb: 0, erro: `exclusão falhou: HTTP ${del.status}` };

    log.info(`[cerebro] limpeza: ${candidatos} artigos com mais de ${dias} dias removidos (~${espacoLiberadoMb}MB)`);
    return { candidatos, apagados: candidatos, espacoLiberadoMb };
  } catch (e) {
    return { ...vazio, erro: e instanceof Error ? e.message : String(e) };
  }
}
