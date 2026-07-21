// ── Provedor de fallback: Google Gemini (free tier) ──────────────────────────
// Existe para o site NUNCA mais ficar sem IA quando a Anthropic falha (crédito
// esgotado, rate limit, instabilidade). Fica INERTE enquanto GEMINI_API_KEY não
// estiver no .env — sem chave, o comportamento é exatamente o de antes.
//
// Free tier (jul/2026): ~1.500 req/dia no Flash, sem cartão. ⚠️ Os termos do
// free tier permitem que o Google use os prompts para treinar modelos — por
// isso é FALLBACK, não primário: o caminho feliz continua na Anthropic.
import { log } from "./log.ts";

const GEMINI_KEY = () => process.env.GEMINI_API_KEY ?? "";
// Configurável: IDs de modelo do Google mudam de nome com frequência.
const GEMINI_MODEL = () => process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

export function geminiEnabled(): boolean {
  return GEMINI_KEY().length > 0;
}

export interface GeminiMessage { role: "user" | "assistant"; content: string }

/** Chamada única ao Gemini. Lança em erro — quem chama decide o fallback. */
export async function callGemini(opts: {
  messages: GeminiMessage[];
  system?: string;
  maxTokens: number;
  timeoutMs?: number;
}): Promise<string> {
  const key = GEMINI_KEY();
  if (!key) throw new Error("GEMINI_API_KEY ausente");

  const body: Record<string, unknown> = {
    contents: opts.messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
    generationConfig: { maxOutputTokens: opts.maxTokens },
  };
  if (opts.system) body.system_instruction = { parts: [{ text: opts.system }] };

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL()}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
    },
  );
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);

  interface GeminiResp { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
  const data = await res.json() as GeminiResp;
  const text = (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
  if (!text) throw new Error("Gemini retornou resposta vazia");
  return text;
}

/** Erros em que vale trocar de provedor (crédito/limite/indisponibilidade). */
export function shouldFallback(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /credit balance|rate_limit|429|529|overloaded|HTTP 5\d\d|timeout|aborted/i.test(msg);
}

/** Log padronizado — o fallback precisa ser VISÍVEL, não silencioso. */
export function logFallback(where: string, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  log.warn(`[ai-fallback] ${where}: Anthropic falhou (${msg.slice(0, 90)}) → tentando Gemini`);
}
