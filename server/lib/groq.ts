// ── Provedor de 3º nível: Groq (free tier) ───────────────────────────────────
// Rede de segurança da rede de segurança. A cadeia é: Anthropic → Gemini → Groq.
//
// Por que existe: hoje o site roda 100% no Gemini free (a Anthropic está sem
// crédito), e a cota DIÁRIA do Gemini já estourou antes — quando isso acontece,
// não sobra ninguém. O Groq tem free tier próprio e independente, então um
// apagão de cota do Google deixa de derrubar a IA do site.
//
// Fica INERTE sem GROQ_API_KEY: sem chave, o comportamento é exatamente o de antes.
//
// ⚠️ QUALIDADE: roda modelos open-weight (Llama e afins), abaixo de Claude/Gemini
// em raciocínio calibrado. É fallback de DISPONIBILIDADE, não de qualidade — por
// isso o provedor que respondeu é gravado no track record (coluna `model`), para
// nunca misturar níveis de modelo num número público sem poder fatiar.
//
// API compatível com a da OpenAI (/chat/completions), o que torna este arquivo
// trivial perto do gemini.ts.
import { log } from "./log.ts";

const GROQ_KEY = () => process.env.GROQ_API_KEY ?? "";
// Override via GROQ_MODEL. Padrão escolhido por TESTE na conta real (2026-08-29),
// com o prompt do seed — não por chute (o palpite inicial, llama-3.3-70b, sequer
// existia mais: 404 model_not_found):
//   openai/gpt-oss-120b   919ms  JSON ok  fair value 62 (= preço de mercado)
//   openai/gpt-oss-20b    495ms  JSON ok  70  (+8pp)
//   qwen/qwen3.8-27b      269ms  JSON ok  45  (−17pp → seria cortado pelo clamp)
// Escolhido o 120b: maior modelo, ancoragem sóbria e latência aceitável para um
// 3º fallback. Se o id sair do ar, o erro aparece no log e troca-se por env.
// ⚠️ n=1: isto valida FORMATO e disponibilidade, não calibração. A prova real, se
// este provedor chegar a responder, vem do track record (coluna `model`).
const GROQ_MODEL = () => process.env.GROQ_MODEL ?? "openai/gpt-oss-120b";

export function groqEnabled(): boolean {
  return GROQ_KEY().length > 0;
}

export interface GroqMessage { role: "user" | "assistant"; content: string }

/** Chamada única ao Groq. Lança em erro — quem chama decide o próximo passo. */
export async function callGroq(opts: {
  messages: GroqMessage[];
  system?: string;
  maxTokens: number;
  timeoutMs?: number;
}): Promise<string> {
  const key = GROQ_KEY();
  if (!key) throw new Error("GROQ_API_KEY ausente");

  const messages = [
    ...(opts.system ? [{ role: "system" as const, content: opts.system }] : []),
    ...opts.messages,
  ];

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL(),
      messages,
      // Folga no orçamento pelo mesmo motivo do Gemini: saída truncada volta vazia
      // e o JSON não fecha. Mínimo de 1024 protege as chamadas curtas (seed usa 80).
      max_tokens: Math.max(1024, opts.maxTokens * 2),
      temperature: 0.3,
    }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
  });

  if (!res.ok) throw new Error(`Groq HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);

  interface GroqResp { choices?: Array<{ message?: { content?: string }; finish_reason?: string }> }
  const data = await res.json() as GroqResp;
  const choice = data.choices?.[0];
  const text = (choice?.message?.content ?? "").trim();
  if (!text) throw new Error(`Groq retornou resposta vazia (finish_reason=${choice?.finish_reason ?? "?"})`);
  return text;
}

/** Log padronizado — o 2º fallback também precisa ser VISÍVEL, não silencioso. */
export function logGroqFallback(where: string, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  log.warn(`[ai-fallback] ${where}: Gemini também falhou (${msg.slice(0, 90)}) → tentando Groq`);
}
