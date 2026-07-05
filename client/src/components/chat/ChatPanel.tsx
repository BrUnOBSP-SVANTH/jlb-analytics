/**
 * ChatPanel — conversa com o Analista JLB (chunk lazy do ChatWidget).
 *
 * - Streaming SSE de POST /api/ai/chat/stream: o texto aparece token a token
 *   (latência percebida ~1s em vez de esperar a resposta inteira).
 * - Histórico: últimas mensagens em localStorage; as 10 mais recentes vão em
 *   cada request (memória de conversa no servidor é stateless).
 * - Erros: timeout de 60s com AbortController, 1 retry de conexão e mensagem
 *   amigável com botão de tentar de novo.
 */
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, Send, Sparkles, Square, ThumbsDown, ThumbsUp, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface ChatMessage { role: "user" | "assistant"; content: string }

const STORAGE_KEY = "jlb_chat_history_v1";
const MAX_STORED = 30;

const SUGGESTIONS = [
  "O que é valor esperado numa aposta?",
  "Como o Critério de Kelly define o tamanho da aposta?",
  "Como ler a probabilidade de um mercado do Polymarket?",
];

function loadHistory(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ChatMessage[]) : [];
  } catch { return []; }
}

function saveHistory(msgs: ChatMessage[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(msgs.slice(-MAX_STORED))); } catch { /* quota */ }
}

const Bubble = memo(function Bubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words ${
          isUser ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-secondary/60 text-foreground rounded-bl-sm"
        }`}
      >
        {msg.content || <span className="inline-flex gap-1 items-center text-muted-foreground"><RefreshCw className="w-3 h-3 animate-spin" aria-hidden="true" /> pensando…</span>}
      </div>
    </div>
  );
});

export default function ChatPanel({ open, onClose, onReady }: { open: boolean; onClose: () => void; onReady: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>(loadHistory);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFailed, setLastFailed] = useState<string | null>(null);
  const [credits, setCredits] = useState<{ used: string; limit: string } | null>(null);
  const [voted, setVoted] = useState<Record<number, 1 | -1>>({});

  const abortRef = useRef<AbortController | null>(null);
  const stoppedRef = useRef(false);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { onReady(); }, [onReady]);
  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);
  useEffect(() => () => abortRef.current?.abort(), []);

  // Autoscroll para a última mensagem enquanto o texto chega
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [messages]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && open) onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const send = useCallback(async (text: string) => {
    const message = text.trim();
    if (!message || streaming) return;

    setError(null);
    setLastFailed(null);
    setInput("");
    setStreaming(true);
    stoppedRef.current = false;

    // Otimista: mensagem do usuário + balão vazio do assistente (vira "pensando…")
    let base: ChatMessage[] = [];
    setMessages((prev) => {
      base = [...prev, { role: "user" as const, content: message }];
      return [...base, { role: "assistant", content: "" }];
    });

    const history = base.slice(0, -1).slice(-10);
    const controller = new AbortController();
    abortRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), 60_000);
    let acc = "";

    try {
      const { data: { session } } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
      const doFetch = () => fetch("/api/ai/chat/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        signal: controller.signal,
        body: JSON.stringify({ message, history }),
      });

      // 1 retry só para falha de CONEXÃO (nunca no meio do stream)
      let res: Response;
      try { res = await doFetch(); } catch (e) {
        if (controller.signal.aborted) throw e;
        await new Promise((r) => setTimeout(r, 600));
        res = await doFetch();
      }
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({})) as { message?: string; error?: string };
        throw new Error(err.message ?? (res.status === 429 ? "Limite de mensagens atingido. Aguarde um instante." : `HTTP ${res.status}`));
      }

      // Contador de créditos de IA (plano free) — o middleware devolve nos headers
      const used = res.headers.get("X-AI-Credits-Used");
      const limit = res.headers.get("X-AI-Credits-Limit");
      if (used && limit) setCredits({ used, limit });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let sep: number;
        while ((sep = buffer.indexOf("\n\n")) !== -1) {
          const block = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          let evt = "message"; let dataStr = "";
          for (const line of block.split("\n")) {
            if (line.startsWith("event:")) evt = line.slice(6).trim();
            else if (line.startsWith("data:")) dataStr += line.slice(5).trim();
          }
          if (!dataStr) continue;
          const payload = JSON.parse(dataStr) as { text?: string; reply?: string; message?: string };
          if (evt === "delta" && payload.text) {
            acc += payload.text;
            const current = acc;
            setMessages([...base, { role: "assistant", content: current }]);
          } else if (evt === "done") {
            acc = payload.reply ?? acc;
          } else if (evt === "error") {
            throw new Error(payload.message ?? "stream_error");
          }
        }
      }
      if (!acc.trim()) throw new Error("Resposta vazia — tente novamente.");
      const finalMsgs: ChatMessage[] = [...base, { role: "assistant", content: acc }];
      setMessages(finalMsgs);
      saveHistory(finalMsgs);
    } catch (e) {
      // Parada manual com texto parcial = resultado válido, não erro
      if (stoppedRef.current && acc.trim()) {
        const partial: ChatMessage[] = [...base, { role: "assistant", content: acc }];
        setMessages(partial);
        saveHistory(partial);
        return;
      }
      const aborted = e instanceof DOMException && e.name === "AbortError";
      setMessages(base); // remove o balão vazio
      setError(aborted && !stoppedRef.current
        ? "A resposta demorou demais. Tente uma pergunta mais curta."
        : stoppedRef.current ? null
        : e instanceof Error ? e.message : "Não consegui falar com o assistente agora.");
      if (!stoppedRef.current) setLastFailed(message);
    } finally {
      clearTimeout(timeoutId);
      setStreaming(false);
      abortRef.current = null;
    }
  }, [streaming]);

  const stop = useCallback(() => {
    stoppedRef.current = true;
    abortRef.current?.abort();
  }, []);

  const clear = useCallback(() => {
    setMessages([]);
    setError(null);
    setVoted({});
    saveHistory([]);
  }, []);

  // Fire-and-forget: marca o voto na hora e envia em background
  const sendFeedback = useCallback((index: number, rating: 1 | -1) => {
    const answer = messages[index]?.content;
    const question = messages[index - 1]?.content;
    if (!answer || !question) return;
    setVoted((v) => ({ ...v, [index]: rating }));
    void supabase.auth.getSession().catch(() => ({ data: { session: null } })).then(({ data }) =>
      fetch("/api/ai/chat/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {}),
        },
        body: JSON.stringify({ question, answer, rating }),
      }),
    ).catch(() => { /* feedback é best-effort */ });
  }, [messages]);

  if (!open) return null;

  return (
    <div
      role="complementary"
      aria-label="Assistente JLB"
      className="fixed z-40 inset-x-3 bottom-20 sm:inset-x-auto sm:right-6 sm:bottom-[5.5rem] sm:w-[380px] h-[70vh] sm:h-[520px] glass-card rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-foreground leading-none">Analista JLB</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Educacional — nunca recomenda apostas</p>
          </div>
        </div>
        {messages.length > 0 && (
          <button onClick={clear} aria-label="Limpar conversa" className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors">
            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Mensagens */}
      <div ref={logRef} aria-live="polite" className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5">
        {messages.length === 0 && !streaming && (
          <div className="space-y-2 pt-2">
            <p className="text-xs text-muted-foreground px-1">
              Tire dúvidas sobre mercados preditivos, valor esperado, Kelly, calibração e a plataforma.
            </p>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => void send(s)}
                className="block w-full text-left text-xs px-3 py-2 rounded-xl border border-border/40 text-foreground/90 hover:border-primary/40 hover:bg-secondary/30 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i}>
            <Bubble msg={m} />
            {/* 👍/👎 na última resposta concluída — alimenta o loop de qualidade */}
            {m.role === "assistant" && m.content && i === messages.length - 1 && !streaming && (
              <div className="flex items-center gap-1 mt-1 pl-1">
                {voted[i] ? (
                  <span className="text-[10px] text-muted-foreground">Obrigado pelo feedback!</span>
                ) : (
                  <>
                    <button onClick={() => sendFeedback(i, 1)} aria-label="Resposta útil" className="p-1 rounded text-muted-foreground/60 hover:text-positive transition-colors">
                      <ThumbsUp className="w-3 h-3" aria-hidden="true" />
                    </button>
                    <button onClick={() => sendFeedback(i, -1)} aria-label="Resposta ruim" className="p-1 rounded text-muted-foreground/60 hover:text-negative transition-colors">
                      <ThumbsDown className="w-3 h-3" aria-hidden="true" />
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
        {error && (
          <div className="text-xs text-negative bg-negative/10 border border-negative/20 rounded-xl px-3 py-2 flex items-center justify-between gap-2">
            <span>{error}</span>
            {lastFailed && (
              <button onClick={() => void send(lastFailed)} className="shrink-0 font-semibold underline underline-offset-2">
                Tentar de novo
              </button>
            )}
          </div>
        )}
      </div>

      {/* Input */}
      <form
        onSubmit={(e) => { e.preventDefault(); void send(input); }}
        className="flex items-center gap-2 px-3 py-2.5 border-t border-border/40 shrink-0"
      >
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Pergunte sobre EV, Kelly, mercados…"
          aria-label="Mensagem para o assistente"
          maxLength={2000}
          disabled={streaming}
          className="flex-1 bg-secondary/40 border border-border/40 rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 disabled:opacity-60"
        />
        {streaming ? (
          <button
            type="button"
            onClick={stop}
            aria-label="Parar geração"
            className="w-9 h-9 rounded-xl bg-secondary text-foreground border border-border/50 flex items-center justify-center hover:bg-secondary/70 transition-colors shrink-0"
          >
            <Square className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim()}
            aria-label="Enviar mensagem"
            className="w-9 h-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 hover:opacity-90 transition-opacity shrink-0"
          >
            <Send className="w-4 h-4" aria-hidden="true" />
          </button>
        )}
      </form>
      {credits && credits.limit !== "unlimited" && (
        <p className="text-[10px] text-muted-foreground text-center pb-1.5 -mt-0.5">
          {credits.used}/{credits.limit} análises de IA neste mês
        </p>
      )}
    </div>
  );
}
