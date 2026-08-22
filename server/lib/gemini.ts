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
// ⚠️ Usar SEMPRE o alias "-latest": IDs fixos são descontinuados para chaves
// novas (gemini-2.5-flash já responde 404 "no longer available to new users",
// verificado 2026-07-21). O alias acompanha o Flash atual sozinho.
// ⚠️ Padrão = "flash-LITE": o Flash cheio (gemini-flash-latest → 3.7-flash) tem cota
// DIÁRIA free minúscula e vive estourada (429 RESOURCE_EXHAUSTED — verificado
// 2026-08-22, seed rendeu 0/30). O lite tem cota própria bem maior e é mais rápido —
// para o fallback (fair value + confiança) a qualidade basta. Override via GEMINI_MODEL.
const GEMINI_MODEL = () => process.env.GEMINI_MODEL ?? "gemini-flash-lite-latest";

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

  // ⚠️ Os modelos Flash atuais pensam por padrão, e o "thinking" consome do
  // MESMO orçamento de saída: com maxOutputTokens pequeno (o seed usa 80) a
  // resposta volta vazia ou truncada. Duas defesas: thinkingLevel baixo e
  // folga generosa no orçamento (verificado 2026-07-21).
  const maxOutputTokens = Math.max(1024, opts.maxTokens * 4);

  async function doFetch(withThinking: boolean): Promise<Response> {
    const generationConfig: Record<string, unknown> = { maxOutputTokens };
    if (withThinking) generationConfig.thinkingConfig = { thinkingLevel: "low" };
    const body: Record<string, unknown> = {
      contents: opts.messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
      generationConfig,
    };
    if (opts.system) body.system_instruction = { parts: [{ text: opts.system }] };

    return fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL()}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
      },
    );
  }

  // thinkingLevel não existe em modelos mais antigos → 400: refaz sem ele.
  let res = await doFetch(true);
  if (!res.ok && res.status === 400) res = await doFetch(false);
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);

  interface GeminiResp { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }> }
  const data = await res.json() as GeminiResp;
  const cand = data.candidates?.[0];
  const text = (cand?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
  if (!text) throw new Error(`Gemini retornou resposta vazia (finishReason=${cand?.finishReason ?? "?"})`);
  return text;
}

/** Erros em que vale trocar de provedor (crédito/limite/indisponibilidade). */
export function shouldFallback(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  // "timed out" (com espaço) cobre a variante do AbortSignal.timeout do Node que
  // "timeout" (uma palavra) não pega — sem isso, um timeout da Anthropic derrubaria
  // o site em vez de cair no Gemini.
  return /credit balance|rate_limit|429|529|overloaded|HTTP 5\d\d|timeout|timed out|aborted/i.test(msg);
}

/** Log padronizado — o fallback precisa ser VISÍVEL, não silencioso. */
export function logFallback(where: string, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  log.warn(`[ai-fallback] ${where}: Anthropic falhou (${msg.slice(0, 90)}) → tentando Gemini`);
}
