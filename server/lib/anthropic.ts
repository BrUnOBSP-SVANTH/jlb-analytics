// ── Wrapper compartilhado da API do Claude (Anthropic) ───────────────────────

export interface ClaudeMessage { role: "user" | "assistant"; content: string }
interface ClaudeResp { content: { type: string; text: string }[] }

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

  let response: Response;
  try {
    response = await connect();
    if (!response.ok && response.status >= 500) throw new Error(`HTTP ${response.status}`);
  } catch {
    await new Promise((r) => setTimeout(r, 500));
    response = await connect();
  }
  if (!response.ok || !response.body) {
    const err = await response.text().catch(() => "");
    throw new Error(`Claude HTTP ${response.status}: ${err.slice(0, 300)}`);
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
