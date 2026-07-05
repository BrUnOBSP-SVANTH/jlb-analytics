// ── Configuração compartilhada de acesso ao Supabase via REST ────────────────
// Centraliza URL/chave e headers de escrita usados por vários módulos (Cerebro,
// track record de IA, digest e handlers). Evita duplicar env + headers.

export const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
export const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? "";

/** Headers para writes (upsert merge-duplicates, retorno mínimo). */
export function supaWriteHeaders() {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "resolution=merge-duplicates,return=minimal",
  };
}
