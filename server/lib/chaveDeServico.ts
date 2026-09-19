/**
 * Só quem tem a chave de serviço dispara manutenção.
 *
 * Nasceu em routes/snapshots.ts: `/seed` era PÚBLICO e escrevia no banco com a
 * chave de serviço (achado da auditoria de 14/09, confirmado em 16/09). Em
 * 19/09 apareceram mais duas portas iguais, estas gastando a cota de IA do
 * site: `/api/ai/embed-cerebro` (6×/min × 200 artigos = 1.200 embeddings por
 * minuto por IP, contra um teto de 1.000 por DIA) e `/api/ai/seed-forecasts`.
 * Por isso a regra saiu da rota e mora aqui.
 *
 * Comparação em tempo constante: o tempo de um `!==` cresce com o tanto de
 * prefixo acertado, e isso vaza a chave caractere a caractere para quem medir.
 */
import { timingSafeEqual } from "crypto";

export function autorizadoComChaveDeServico(cabecalho: unknown): boolean {
  const chave = process.env.SUPABASE_SERVICE_KEY ?? "";
  if (!chave) return false; // sem chave configurada, ninguém entra
  const esperado = Buffer.from(`Bearer ${chave}`);
  const recebido = Buffer.from(typeof cabecalho === "string" ? cabecalho : "");
  if (recebido.length !== esperado.length) return false;
  return timingSafeEqual(recebido, esperado);
}
