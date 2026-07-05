// ── Wrapper compartilhado da API do Claude (Anthropic) ───────────────────────

export interface ClaudeMessage { role: "user" | "assistant"; content: string }
interface ClaudeResp { content: { type: string; text: string }[] }

export async function callClaude(opts: {
  model: string;
  maxTokens: number;
  system?: string;
  messages: ClaudeMessage[];
  timeoutMs?: number;
  prefillJson?: boolean; // força a resposta a começar com {
  cacheSystem?: boolean; // prompt caching do system (prefixo grande e estático)
}): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY ?? "";
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
  return opts.prefillJson ? "{" + text : text;
}
