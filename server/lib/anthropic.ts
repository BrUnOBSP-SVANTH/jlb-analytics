// ── Wrapper compartilhado da API do Claude (Anthropic) ───────────────────────
// Com fallback automático para o Gemini (free tier) quando a Anthropic falha
// por crédito/rate limit/instabilidade — ver lib/gemini.ts. Sem GEMINI_API_KEY
// o comportamento é idêntico ao de antes (erro propaga).
import { callGemini, geminiEnabled, shouldFallback, logFallback } from "./gemini.ts";
import { callGroq, groqEnabled, logGroqFallback } from "./groq.ts";
import { recordAiCall } from "./ai/metrics.ts";

export interface ClaudeMessage { role: "user" | "assistant"; content: string }
interface ClaudeResp { content: { type: string; text: string }[] }

// ── Circuit breaker do provedor Anthropic ────────────────────────────────────
// Com a Anthropic fora (sem crédito/instabilidade), toda chamada pagava um
// round-trip que falha ANTES de cair no Gemini. O breaker "abre" após N falhas
// seguidas e, durante o cooldown, vai direto pro fallback — menos latência e
// menos chamadas desperdiçadas. Half-open: a 1ª chamada após o cooldown testa a
// Anthropic de novo; sucesso fecha o breaker, falha reabre.
const BREAKER = { failures: 0, openUntil: 0 };
const BREAKER_THRESHOLD = 3;
const BREAKER_COOLDOWN_MS = 60_000;

function anthropicBlocked(): boolean {
  return BREAKER.openUntil > Date.now();
}
export function recordAnthropicSuccess(): void {
  BREAKER.failures = 0;
  BREAKER.openUntil = 0;
}
export function recordAnthropicFailure(): void {
  BREAKER.failures += 1;
  if (BREAKER.failures >= BREAKER_THRESHOLD) BREAKER.openUntil = Date.now() + BREAKER_COOLDOWN_MS;
}

/** Test-only: zera o breaker entre casos. */
export function _resetBreaker(): void { BREAKER.failures = 0; BREAKER.openUntil = 0; }

/** Estado do breaker — exposto para observabilidade das métricas de IA. */
export function anthropicBreakerState(): { open: boolean; failures: number; cooldownMsLeft: number } {
  return {
    open: anthropicBlocked(),
    failures: BREAKER.failures,
    cooldownMsLeft: Math.max(0, BREAKER.openUntil - Date.now()),
  };
}

/**
 * Streaming da API do Claude — emite cada delta de texto via onDelta e
 * devolve o texto completo ao final.
 *
 * `system` é enviado como bloco COM cache_control (prefixo estático — persona/
 * instruções) e `systemDynamic` como segundo bloco SEM cache (data, taxas,
 * contexto do usuário). Separar os dois é o que faz o prompt caching realmente
 * acertar: o prefixo idêntico entre usuários é reaproveitado (~90% mais barato,
 * TTFT menor) mesmo com a parte dinâmica mudando a cada request.
 *
 * Retry: 1 tentativa extra com backoff de 500ms, apenas se a falha ocorrer
 * ANTES do primeiro byte (conexão/5xx) — nunca no meio do stream.
 */
export async function streamClaude(opts: {
  model: string;
  maxTokens: number;
  system: string;
  systemDynamic?: string;
  messages: ClaudeMessage[];
  timeoutMs?: number;
  onDelta?: (text: string) => void;
}): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY ?? "";
  const t0 = Date.now();

  async function connect(): Promise<Response> {
    return fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: opts.model,
        max_tokens: opts.maxTokens,
        stream: true,
        system: [
          { type: "text", text: opts.system, cache_control: { type: "ephemeral" } },
          ...(opts.systemDynamic ? [{ type: "text", text: opts.systemDynamic }] : []),
        ],
        messages: opts.messages,
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000),
    });
  }

  /** Cadeia de fallback: Gemini → Groq. Nenhum dos dois faz streaming aqui —
   *  emitem o texto inteiro num delta só, o que só é seguro ANTES do primeiro
   *  byte (depois duplicaria conteúdo). Percorre os provedores disponíveis e só
   *  desiste quando todos falharem. */
  async function fallbackChain(err: unknown): Promise<string> {
    const payload = {
      messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
      system: [opts.system, opts.systemDynamic].filter(Boolean).join("\n\n"),
      maxTokens: opts.maxTokens,
      timeoutMs: opts.timeoutMs,
    };
    const chain: Array<{ name: "gemini" | "groq"; call: () => Promise<string>; logIt: (w: string, e: unknown) => void }> = [];
    if (geminiEnabled()) chain.push({ name: "gemini", call: () => callGemini(payload), logIt: logFallback });
    if (groqEnabled()) chain.push({ name: "groq", call: () => callGroq(payload), logIt: logGroqFallback });

    let lastErr = err;
    for (const p of chain) {
      p.logIt("streamClaude", lastErr);
      try {
        const text = await p.call();
        opts.onDelta?.(text);
        recordAiCall(p.name, Date.now() - t0);
        return text;
      } catch (e) { lastErr = e; }
    }
    recordAiCall("error", Date.now() - t0);
    throw lastErr;
  }

  const hasFallback = () => geminiEnabled() || groqEnabled();

  // Circuit breaker: Anthropic "aberta" (falhas recentes) → direto pro fallback.
  if (hasFallback() && anthropicBlocked()) return fallbackChain(new Error("anthropic circuit open"));

  let response: Response;
  try {
    response = await connect();
    if (!response.ok && response.status >= 500) throw new Error(`HTTP ${response.status}`);
  } catch {
    // 1ª tentativa falhou (conexão/5xx) → 1 retry com backoff. Se o retry TAMBÉM
    // lançar (rede/timeout/abort), tratamos AQUI: antes a exceção escapava das
    // métricas E do fallback, deixando o chat "indisponível" mesmo com Gemini.
    await new Promise((r) => setTimeout(r, 500));
    try {
      response = await connect();
    } catch (retryErr) {
      recordAnthropicFailure();
      if (hasFallback()) return fallbackChain(retryErr); // seguro: nada foi transmitido ainda
      recordAiCall("error", Date.now() - t0);
      throw retryErr;
    }
  }
  if (!response.ok || !response.body) {
    const err = await response.text().catch(() => "");
    const error = new Error(`Claude HTTP ${response.status}: ${err.slice(0, 300)}`);
    if (hasFallback() && shouldFallback(error)) { recordAnthropicFailure(); return fallbackChain(error); }
    recordAiCall("error", Date.now() - t0);
    throw error;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      for (const line of block.split("\n")) {
        if (!line.startsWith("data:")) continue;
        try {
          const evt = JSON.parse(line.slice(5)) as { type: string; delta?: { type: string; text?: string } };
          if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta" && evt.delta.text) {
            full += evt.delta.text;
            opts.onDelta?.(evt.delta.text);
          }
        } catch { /* linha parcial/keepalive — ignora */ }
      }
    }
  }
  recordAnthropicSuccess();
  recordAiCall("anthropic", Date.now() - t0);
  return full;
}

export async function callClaude(opts: {
  model: string;
  maxTokens: number;
  system?: string;
  messages: ClaudeMessage[];
  timeoutMs?: number;
  prefillJson?: boolean; // força a resposta a começar com {
  cacheSystem?: boolean; // prompt caching do system (prefixo grande e estático)
  onProvider?: (p: "anthropic" | "gemini" | "groq") => void; // qual provedor respondeu (p/ track record honesto)
}): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY ?? "";
  const t0 = Date.now();
  // ⚠️ ATENÇÃO: os modelos 4.x (claude-sonnet-4-6, claude-haiku-4-5) NÃO suportam
  // prefill de mensagem do assistente — a API retorna 400 "This model does not
  // support assistant message prefill". NÃO use prefillJson:true com esses modelos.
  const messages = opts.prefillJson
    ? [...opts.messages, { role: "assistant" as const, content: "{" }]
    : opts.messages;

  // Prompt caching: envia o system como bloco com cache_control ephemeral. A
  // Anthropic guarda o prefixo estático (~5 min) — chamadas seguintes com o mesmo
  // system pulam o reprocessamento (TTFT menor + ~90% mais barato nesses tokens).
  async function doFetch(useCache: boolean): Promise<Response> {
    const systemField = opts.system
      ? (useCache && opts.cacheSystem
          ? [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }]
          : opts.system)
      : undefined;
    return fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: opts.model,
        max_tokens: opts.maxTokens,
        ...(systemField ? { system: systemField } : {}),
        messages,
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
    });
  }

  /** Cadeia de fallback: Gemini → Groq. Grava QUAL provedor respondeu (onProvider)
   *  — é o que permite fatiar o track record por modelo e nunca misturar níveis
   *  de qualidade num número público sem poder separar. */
  async function fallbackChain(err: unknown, where: string): Promise<string> {
    const payload = {
      messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
      system: opts.system,
      maxTokens: opts.maxTokens,
      timeoutMs: opts.timeoutMs,
    };
    const chain: Array<{ name: "gemini" | "groq"; call: () => Promise<string>; logIt: (w: string, e: unknown) => void }> = [];
    if (geminiEnabled()) chain.push({ name: "gemini", call: () => callGemini(payload), logIt: logFallback });
    if (groqEnabled()) chain.push({ name: "groq", call: () => callGroq(payload), logIt: logGroqFallback });

    let lastErr = err;
    for (const p of chain) {
      p.logIt(where, lastErr);
      try {
        const text = await p.call();
        opts.onProvider?.(p.name);
        recordAiCall(p.name, Date.now() - t0);
        return text;
      } catch (e) { lastErr = e; }
    }
    recordAiCall("error", Date.now() - t0);
    throw lastErr;
  }

  const hasFallback = () => geminiEnabled() || groqEnabled();

  // Circuit breaker: Anthropic "aberta" → direto pro fallback, sem round-trip que falha.
  if (hasFallback() && anthropicBlocked()) {
    return fallbackChain(new Error("anthropic circuit open"), "callClaude(breaker)");
  }

  try {
    let response = await doFetch(true);
    // Defensivo: se o caching não for aceito, refaz sem cache uma vez (não quebra).
    if (!response.ok && response.status === 400 && opts.cacheSystem) {
      const errText = await response.text();
      if (/cache/i.test(errText)) response = await doFetch(false);
      else throw new Error(`Claude HTTP 400: ${errText}`);
    }
    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Claude HTTP ${response.status}: ${err}`);
    }
    const data = await response.json() as ClaudeResp;
    const text = data.content.find((b) => b.type === "text")?.text ?? "";
    recordAnthropicSuccess();
    recordAiCall("anthropic", Date.now() - t0);
    opts.onProvider?.("anthropic");
    return opts.prefillJson ? "{" + text : text;
  } catch (err) {
    // Fallback de provedor: sem crédito/rate limit/instabilidade, o site responde
    // pelo Gemini e, se ele também falhar (cota diária estourada), pelo Groq —
    // em vez de degradar. Inerte sem as chaves.
    if (!hasFallback() || !shouldFallback(err)) { recordAiCall("error", Date.now() - t0); throw err; }
    recordAnthropicFailure();
    return fallbackChain(err, "callClaude");
  }
}
