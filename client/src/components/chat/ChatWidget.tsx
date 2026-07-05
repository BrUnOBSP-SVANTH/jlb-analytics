/**
 * ChatWidget — botão flutuante do Analista JLB.
 *
 * O launcher é minúsculo e fica no bundle principal; o painel (lógica de
 * streaming, histórico, UI da conversa) é um chunk lazy carregado apenas no
 * primeiro clique — custo zero para quem nunca abre o chat.
 */
import { lazy, Suspense, useState } from "react";
import { Sparkles, X } from "lucide-react";

const ChatPanel = lazy(() => import("./ChatPanel"));

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false); // mantém o chunk montado após o 1º open

  return (
    <>
      {(open || loaded) && (
        <Suspense fallback={null}>
          <ChatPanel open={open} onClose={() => setOpen(false)} onReady={() => setLoaded(true)} />
        </Suspense>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Fechar assistente JLB" : "Abrir assistente JLB"}
        aria-expanded={open}
        className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-40 w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg shadow-black/20 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
      >
        {open ? <X className="w-5 h-5" aria-hidden="true" /> : <Sparkles className="w-5 h-5" aria-hidden="true" />}
      </button>
    </>
  );
}
