/**
 * TutorialModal.tsx — modal com player do vídeo tutorial e índice de capítulos.
 *
 * POR QUE ESTE COMPONENTE EXISTE:
 * O JLB Analytics tem um gerador automatizado de tutorial (scripts/gravar-tutorial.mjs)
 * que filma o site real com dados reais. No entanto, o visitante precisa de uma
 * forma intuitiva de assistir dentro da própria aplicação — com navegação por
 * capítulos, transcrição sincronizada (útil pois o vídeo gerado é filmado sem som)
 * e atalhos diretos para as ferramentas explicadas.
 *
 * ACESSIBILIDADE E REGRAS:
 *  - role="dialog" com aria-modal="true" e foco gerenciado via useModalA11y.
 *  - Fecha no Escape ou no clique fora.
 *  - Cores via tokens do design system (oklch), funcionando no tema claro e escuro.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "wouter";
import {
  X,
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Maximize,
  ExternalLink,
  BookOpen,
  Film,
  Clock,
  Sparkles,
  ChevronRight,
} from "lucide-react";
import {
  CAPITULOS_TUTORIAL,
  DURACAO_TOTAL_SEGUNDOS,
  formatarTempo,
  capituloPorSegundo,
  type CapituloTutorial,
} from "@shared/tutorialCenas";
import { EVENTO_TUTORIAL, type DetalheTutorial } from "@/lib/tutorial";
import { useModalA11y } from "@/hooks/useModalA11y";

export default function TutorialModal() {
  const [aberto, setAberto] = useState(false);
  const [tempoAtual, setTempoAtual] = useState(0);
  const [estaTocando, setEstaTocando] = useState(false);
  const [mudo, setMudo] = useState(false);
  const [capituloAtivoId, setCapituloAtivoId] = useState<string>(CAPITULOS_TUTORIAL[0].id);
  const [erroVideo, setErroVideo] = useState(false);

  const painelRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const fechar = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.pause();
    }
    setAberto(false);
  }, []);

  useModalA11y(fechar, painelRef);

  // Escuta o evento global jlb:tutorial
  useEffect(() => {
    function aoDisparar(e: Event) {
      const detalhe = (e as CustomEvent<DetalheTutorial>).detail ?? {};
      setAberto(true);
      setErroVideo(false);

      if (detalhe.capituloId) {
        const cap = CAPITULOS_TUTORIAL.find((c) => c.id === detalhe.capituloId);
        if (cap) {
          setCapituloAtivoId(cap.id);
          setTempoAtual(cap.inicioSegundos);
          setTimeout(() => {
            if (videoRef.current) {
              videoRef.current.currentTime = cap.inicioSegundos;
              if (detalhe.autoPlay !== false) {
                videoRef.current.play().catch(() => {});
              }
            }
          }, 80);
        }
      }
    }

    window.addEventListener(EVENTO_TUTORIAL, aoDisparar);
    return () => window.removeEventListener(EVENTO_TUTORIAL, aoDisparar);
  }, []);

  // Abre automaticamente se a URL tiver ?tutorial=1
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("tutorial") === "1" || params.get("tutorial") === "true") {
      setAberto(true);
    }
  }, []);

  // Sincroniza o capítulo ativo conforme o tempo do vídeo avança
  const aoAtualizarTempo = useCallback(() => {
    if (!videoRef.current) return;
    const agora = videoRef.current.currentTime;
    setTempoAtual(agora);
    const atual = capituloPorSegundo(agora);
    if (atual && atual.id !== capituloAtivoId) {
      setCapituloAtivoId(atual.id);
    }
  }, [capituloAtivoId]);

  const pularParaCapitulo = (capitulo: CapituloTutorial) => {
    setCapituloAtivoId(capitulo.id);
    setTempoAtual(capitulo.inicioSegundos);
    if (videoRef.current) {
      videoRef.current.currentTime = capitulo.inicioSegundos;
      videoRef.current.play().catch(() => {});
    }
  };

  const alternarPlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play().catch(() => {});
    } else {
      videoRef.current.pause();
    }
  };

  const alternarMudo = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !videoRef.current.muted;
    setMudo(videoRef.current.muted);
  };

  const telaCheia = () => {
    if (!videoRef.current) return;
    if (videoRef.current.requestFullscreen) {
      videoRef.current.requestFullscreen().catch(() => {});
    }
  };

  const capituloAtivo =
    CAPITULOS_TUTORIAL.find((c) => c.id === capituloAtivoId) ?? CAPITULOS_TUTORIAL[0];

  if (!aberto) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-tutorial"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 bg-background/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) fechar();
      }}
    >
      <div
        ref={painelRef}
        tabIndex={-1}
        className="bg-card border border-border/50 text-card-foreground rounded-2xl shadow-2xl flex flex-col w-full max-w-5xl max-h-[92vh] overflow-hidden focus:outline-none"
      >
        {/* Cabeçalho */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/30 bg-secondary/15 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gold/15 border border-gold/30 flex items-center justify-center text-gold">
              <Film className="w-4 h-4" aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="titulo-tutorial" className="text-sm sm:text-base font-semibold text-foreground">
                  Como usar o JLB Analytics
                </h2>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-gold/15 text-gold border border-gold/30">
                  {formatarTempo(DURACAO_TOTAL_SEGUNDOS)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground hidden sm:block">
                Tour guiado pelas ferramentas, cálculos de probabilidade e dados reais da plataforma.
              </p>
            </div>
          </div>

          <button
            onClick={fechar}
            className="alvo-toque p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors"
            aria-label="Fechar tutorial"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Corpo com Grid: Vídeo à esquerda e Capítulos à direita */}
        <div className="grid grid-cols-1 lg:grid-cols-12 overflow-y-auto flex-1 divide-y lg:divide-y-0 lg:divide-x divide-border/30">
          {/* Lado Esquerdo: Player + Transcrição / Legenda Dinâmica */}
          <div className="lg:col-span-7 flex flex-col p-4 sm:p-5 gap-4">
            {/* Player Container 16:9 */}
            <div className="relative aspect-video bg-black/90 rounded-xl overflow-hidden border border-border/40 group shadow-inner">
              {erroVideo ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-muted-foreground bg-secondary/20">
                  <Film className="w-10 h-10 text-gold mb-3 animate-pulse" aria-hidden="true" />
                  <p className="text-sm font-medium text-foreground mb-1">Vídeo tutorial disponível</p>
                  <p className="text-xs max-w-sm mb-4">
                    Você pode navegar pelos capítulos ao lado para entender cada ferramenta e ler o roteiro explicativo.
                  </p>
                  <button
                    onClick={() => {
                      setErroVideo(false);
                      if (videoRef.current) {
                        videoRef.current.load();
                      }
                    }}
                    className="text-xs font-semibold px-3 py-1.5 rounded-md bg-secondary/50 hover:bg-secondary text-foreground transition-colors"
                  >
                    Tentar recarregar vídeo
                  </button>
                </div>
              ) : (
                <video
                  ref={videoRef}
                  playsInline
                  preload="metadata"
                  onTimeUpdate={aoAtualizarTempo}
                  onPlay={() => setEstaTocando(true)}
                  onPause={() => setEstaTocando(false)}
                  onError={() => setErroVideo(true)}
                  className="w-full h-full object-contain cursor-pointer"
                  onClick={alternarPlay}
                >
                  <source src="/tutorial.mp4" type="video/mp4" />
                  <source src="/tutorial.webm" type="video/webm" />
                </video>
              )}

              {/* Barra de controle inferior customizada */}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-3 flex flex-col gap-1.5 opacity-90 sm:opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                {/* Linha de progresso clicável */}
                <input
                  type="range"
                  min={0}
                  max={DURACAO_TOTAL_SEGUNDOS}
                  step={0.5}
                  value={tempoAtual}
                  onChange={(e) => {
                    const novoTempo = Number(e.target.value);
                    setTempoAtual(novoTempo);
                    if (videoRef.current) {
                      videoRef.current.currentTime = novoTempo;
                    }
                  }}
                  className="w-full h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-gold hover:h-2 transition-all"
                  aria-label="Barra de progresso do tutorial"
                />

                <div className="flex items-center justify-between text-white text-xs pt-1">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={alternarPlay}
                      className="p-1 rounded hover:bg-white/20 transition-colors"
                      aria-label={estaTocando ? "Pausar" : "Reproduzir"}
                    >
                      {estaTocando ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
                    </button>

                    <button
                      onClick={() => {
                        if (videoRef.current) {
                          videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 10);
                        }
                      }}
                      className="p-1 rounded hover:bg-white/20 transition-colors"
                      aria-label="Voltar 10 segundos"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>

                    <button
                      onClick={alternarMudo}
                      className="p-1 rounded hover:bg-white/20 transition-colors"
                      aria-label={mudo ? "Ativar som" : "Desativar som"}
                    >
                      {mudo ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                    </button>

                    <span className="font-mono text-[11px] text-white/80">
                      {formatarTempo(tempoAtual)} / {formatarTempo(DURACAO_TOTAL_SEGUNDOS)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={telaCheia}
                      className="p-1 rounded hover:bg-white/20 transition-colors"
                      aria-label="Tela cheia"
                    >
                      <Maximize className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Cartão de Transcrição / Explicação Sincronizada */}
            <div className="bg-secondary/20 border border-border/30 rounded-xl p-3.5 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gold flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                  Cena Atual: {capituloAtivo.titulo}
                </span>

                <Link
                  href={capituloAtivo.rota}
                  onClick={fechar}
                  className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors"
                >
                  Abrir tela ({capituloAtivo.rota})
                  <ExternalLink className="w-3 h-3" aria-hidden="true" />
                </Link>
              </div>

              <p className="text-xs sm:text-sm text-foreground/90 leading-relaxed font-normal">
                "{capituloAtivo.narracao}"
              </p>
            </div>
          </div>

          {/* Lado Direito: Índice de Capítulos Clicáveis */}
          <div className="lg:col-span-5 flex flex-col p-4 sm:p-5 bg-secondary/5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5" aria-hidden="true" />
                Capítulos do Tutorial
              </span>
              <span className="text-[11px] text-muted-foreground">
                {CAPITULOS_TUTORIAL.length} partes
              </span>
            </div>

            <div className="space-y-1.5 overflow-y-auto max-h-[380px] lg:max-h-[500px] pr-1">
              {CAPITULOS_TUTORIAL.map((cap) => {
                const ativo = cap.id === capituloAtivoId;
                return (
                  <button
                    key={cap.id}
                    onClick={() => pularParaCapitulo(cap)}
                    className={`w-full text-left p-2.5 rounded-xl border transition-all flex items-start gap-2.5 ${
                      ativo
                        ? "bg-gold/10 border-gold/40 shadow-sm"
                        : "bg-card/40 border-border/25 hover:bg-secondary/30 hover:border-border/50"
                    }`}
                  >
                    <div
                      className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 text-xs font-mono font-medium ${
                        ativo
                          ? "bg-gold text-black font-bold"
                          : "bg-secondary/40 text-muted-foreground"
                      }`}
                    >
                      {ativo ? <Play className="w-3 h-3 fill-current" /> : formatarTempo(cap.inicioSegundos).split(":")[0]}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <p
                          className={`text-xs font-medium truncate ${
                            ativo ? "text-gold font-semibold" : "text-foreground"
                          }`}
                        >
                          {cap.titulo}
                        </p>
                        <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                          {formatarTempo(cap.inicioSegundos)}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-snug line-clamp-2">
                        {cap.resumo}
                      </p>
                    </div>

                    <ChevronRight
                      className={`w-3.5 h-3.5 shrink-0 transition-transform ${
                        ativo ? "text-gold translate-x-0.5" : "text-muted-foreground/40"
                      }`}
                      aria-hidden="true"
                    />
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Rodapé informativo */}
        <div className="px-5 py-3 border-t border-border/30 bg-secondary/15 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-gold shrink-0" aria-hidden="true" />
            <span>Duração total: 3 minutos e 35 segundos.</span>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/educacao"
              onClick={fechar}
              className="text-gold hover:underline transition-colors"
            >
              Conhecer Trilha Educacional →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

