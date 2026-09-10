/**
 * ChatWidget — botão flutuante do Analista JLB.
 *
 * O launcher é minúsculo e fica no bundle principal; o painel (lógica de
 * streaming, histórico, UI da conversa) é um chunk lazy carregado apenas no
 * primeiro clique — custo zero para quem nunca abre o chat.
 */
import { lazy, Suspense, useState, useEffect, useRef } from "react";
import { Sparkles, X } from "lucide-react";
import { track } from "@/lib/analytics";

const ChatPanel = lazy(() => import("./ChatPanel"));

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false); // mantém o chunk montado após o 1º open

  /**
   * O botão SOME AO DESCER e volta ao subir.
   *
   * No celular ele fica sobre a lista de mercados e cobre o canto do botão
   * "Analisar mercado" de qualquer card que esteja embaixo dele — e quem está
   * descendo a lista está lendo cards, não querendo o chat. Encolher o botão não
   * resolveria: o problema é ele estar lá na hora errada.
   *
   * Some só descendo. Ao subir, a pessoa está procurando algo — e é aí que o
   * atalho para perguntar faz sentido. O padrão é o mesmo de app de conteúdo, e
   * o botão continua a um gesto de distância.
   */
  const [visivel, setVisivel] = useState(true);
  const ultimoY = useRef(0);

  useEffect(() => {
    // Com o painel aberto, esconder o botão seria esconder o "fechar".
    if (open) { setVisivel(true); return; }
    const aoRolar = () => {
      const y = window.scrollY;
      // 8px de folga: sem ela, o tremor do dedo no toque faz o botão piscar.
      if (Math.abs(y - ultimoY.current) > 8) {
        setVisivel(y < ultimoY.current || y < 120);
        ultimoY.current = y;
      }
    };
    window.addEventListener("scroll", aoRolar, { passive: true });
    return () => window.removeEventListener("scroll", aoRolar);
  }, [open]);

  const toggle = () => setOpen((v) => {
    if (!v) track("chat_opened");
    return !v;
  });

  // NAV-02: `Escape` não fechava o widget de chat — era um dos três overlays
  // que a auditoria testou e nenhum fechava. Quem navega por teclado ficava
  // preso: para sair era preciso achar o botão com o mouse.
  useEffect(() => {
    if (!open) return;
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [open]);

  return (
    <>
      {(open || loaded) && (
        <Suspense fallback={null}>
          <ChatPanel open={open} onClose={() => setOpen(false)} onReady={() => setLoaded(true)} />
        </Suspense>
      )}
      <button
        onClick={toggle}
        aria-label={open ? "Fechar assistente JLB" : "Abrir assistente JLB"}
        aria-expanded={open}
        // `pointer-events-none` quando escondido: um botão invisível que ainda
        // recebe toque é pior que um botão visível no caminho.
        className={`fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-40 w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg shadow-black/20 flex items-center justify-center hover:scale-105 active:scale-95 transition-all duration-300 ${
          visivel ? "translate-y-0 opacity-100" : "translate-y-20 opacity-0 pointer-events-none"
        }`}
      >
        {open ? <X className="w-5 h-5" aria-hidden="true" /> : <Sparkles className="w-5 h-5" aria-hidden="true" />}
      </button>
    </>
  );
}
