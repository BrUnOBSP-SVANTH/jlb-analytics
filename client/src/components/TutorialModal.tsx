/**
 * TutorialModal.tsx — o player dos vídeos de ajuda, com o índice de capítulos.
 *
 * Os vídeos são filmados pelo `pnpm tutorial` (scripts/gravar-tutorial.mjs), que
 * usa cada função do site de verdade e confere o resultado. O índice que este
 * player lê (`shared/tutorialCenas.ts`) é GERADO na gravação, com os tempos
 * medidos — e só lista filme que foi gravado.
 *
 * 🔴 O QUE MUDOU EM 01/10/2026:
 *  · eram um vídeo e um índice copiado à mão, com tempos chutados; agora são
 *    vários filmes curtos, cada um com o índice da própria gravação;
 *  · o estado de erro dizia "Vídeo tutorial disponível" justamente quando o
 *    vídeo NÃO carregou. E ele nem aparecia: o `onError` estava no <video>,
 *    mas com <source> dentro o erro dispara no <source>. Em produção — onde o
 *    arquivo dava 404 — quem abria o tutorial via uma caixa preta muda. Agora o
 *    vídeo usa `src` direto, o erro chega, e a tela diz o que houve;
 *  · a duração estava escrita à mão no rodapé ("3 minutos e 35 segundos").
 *
 * Sem vídeo, o painel continua útil: a narração de cada capítulo e o atalho
 * para abrir a tela de que ela fala.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "wouter";
import {
  X, Play, Pause, RotateCcw, Volume2, VolumeX, Maximize, ExternalLink,
  BookOpen, Film, Sparkles, ChevronRight, VideoOff,
} from "lucide-react";
import {
  FILMES_TUTORIAL,
  formatarTempo,
  capituloPorSegundo,
  urlDoVideo,
  urlDaCapa,
  type CapituloTutorial,
  type FilmeTutorial,
} from "@shared/tutorialCenas";
import { EVENTO_TUTORIAL, type DetalheTutorial } from "@/lib/tutorial";
import { useModalA11y } from "@/hooks/useModalA11y";

/** "1º de outubro de 2026" — para ninguém tomar um vídeo velho por novo. */
const dataGravacao = (iso: string) => {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
};

/** A primeira frase da narração serve de resumo do capítulo no índice. */
const primeiraFrase = (t: string) => (t.match(/^.+?[.!?](\s|$)/)?.[0] ?? t).trim();

export default function TutorialModal() {
  // `?tutorial=1` abre o player já na primeira pintura — lido na criação do
  // estado, e não num efeito que pintaria a tela fechada e depois abriria.
  const [aberto, setAberto] = useState(() => {
    if (typeof window === "undefined") return false;
    const t = new URLSearchParams(window.location.search).get("tutorial");
    return t === "1" || t === "true";
  });
  const [filmeId, setFilmeId] = useState<string | undefined>(FILMES_TUTORIAL[0]?.id);
  const [tempoAtual, setTempoAtual] = useState(0);
  const [estaTocando, setEstaTocando] = useState(false);
  const [mudo, setMudo] = useState(false);
  const [capituloAtivoId, setCapituloAtivoId] = useState<string | undefined>(FILMES_TUTORIAL[0]?.capitulos[0]?.id);
  const [erroVideo, setErroVideo] = useState(false);

  const painelRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const filme: FilmeTutorial | undefined = FILMES_TUTORIAL.find((f) => f.id === filmeId) ?? FILMES_TUTORIAL[0];

  const fechar = useCallback(() => {
    videoRef.current?.pause();
    setAberto(false);
  }, []);

  useModalA11y(fechar, painelRef);

  const escolherFilme = useCallback((f: FilmeTutorial, inicio?: CapituloTutorial) => {
    setFilmeId(f.id);
    setErroVideo(false);
    setEstaTocando(false);
    const cap = inicio ?? f.capitulos[0];
    setCapituloAtivoId(cap?.id);
    setTempoAtual(cap?.inicioSegundos ?? 0);
  }, []);

  // Escuta o evento global jlb:tutorial (Navbar, rodapé, Ctrl+K, tour de boas-vindas).
  useEffect(() => {
    function aoDisparar(e: Event) {
      const detalhe = (e as CustomEvent<DetalheTutorial>).detail ?? {};
      setAberto(true);
      setErroVideo(false);
      if (!detalhe.capituloId) return;
      // O capítulo pode estar em qualquer filme: o pedido diz a cena, não o vídeo.
      for (const f of FILMES_TUTORIAL) {
        const cap = f.capitulos.find((c) => c.id === detalhe.capituloId);
        if (!cap) continue;
        escolherFilme(f, cap);
        setTimeout(() => {
          if (!videoRef.current) return;
          videoRef.current.currentTime = cap.inicioSegundos;
          if (detalhe.autoPlay !== false) videoRef.current.play().catch(() => {});
        }, 120);
        return;
      }
    }
    window.addEventListener(EVENTO_TUTORIAL, aoDisparar);
    return () => window.removeEventListener(EVENTO_TUTORIAL, aoDisparar);
  }, [escolherFilme]);

  const aoAtualizarTempo = useCallback(() => {
    if (!videoRef.current || !filme) return;
    const agora = videoRef.current.currentTime;
    setTempoAtual(agora);
    const atual = capituloPorSegundo(filme, agora);
    if (atual && atual.id !== capituloAtivoId) setCapituloAtivoId(atual.id);
  }, [capituloAtivoId, filme]);

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
    if (videoRef.current.paused) videoRef.current.play().catch(() => {});
    else videoRef.current.pause();
  };

  const alternarMudo = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !videoRef.current.muted;
    setMudo(videoRef.current.muted);
  };

  const telaCheia = () => {
    videoRef.current?.requestFullscreen?.().catch(() => {});
  };

  if (!aberto) return null;

  const capituloAtivo = filme?.capitulos.find((c) => c.id === capituloAtivoId) ?? filme?.capitulos[0];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-tutorial"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 bg-background/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={(e) => { if (e.target === e.currentTarget) fechar(); }}
    >
      <div
        ref={painelRef}
        tabIndex={-1}
        className="bg-card border border-border/50 text-card-foreground rounded-2xl shadow-2xl flex flex-col w-full max-w-5xl max-h-[92vh] overflow-hidden focus:outline-none"
      >
        {/* Cabeçalho */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/30 bg-secondary/15 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-gold/15 border border-gold/30 flex items-center justify-center text-gold shrink-0">
              <Film className="w-4 h-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 id="titulo-tutorial" className="text-sm sm:text-base font-semibold text-foreground truncate">
                {filme ? filme.titulo : "Vídeos de ajuda"}
              </h2>
              {filme && (
                <p className="text-xs text-muted-foreground">
                  {formatarTempo(filme.duracaoSegundos)} · gravado em {dataGravacao(filme.gravadoEm)}
                  {!filme.comAudio && " · sem narração em áudio"}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={fechar}
            className="alvo-toque p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors shrink-0"
            aria-label="Fechar tutorial"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {!filme ? (
          // O índice só lista o que foi gravado. Vazio = nenhum vídeo ainda —
          // dizer isso é melhor que abrir um player que não toca nada.
          <div className="p-10 text-center text-muted-foreground">
            <VideoOff className="w-9 h-9 mx-auto mb-3 text-muted-foreground/70" aria-hidden="true" />
            <p className="text-sm font-medium text-foreground">Os vídeos de ajuda ainda não foram gravados.</p>
            <p className="text-xs mt-1 max-w-prose mx-auto">
              Enquanto isso, a trilha de educação explica cada ferramenta com exemplos para você calcular.
            </p>
            <Link href="/educacao" onClick={fechar} className="inline-block mt-4 text-xs font-semibold text-gold hover:underline">
              Abrir a trilha de educação
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 overflow-y-auto flex-1 divide-y lg:divide-y-0 lg:divide-x divide-border/30">
            {/* Esquerda: player + o que está sendo dito */}
            <div className="lg:col-span-7 flex flex-col p-4 sm:p-5 gap-4">
              <div className="relative aspect-video bg-background rounded-xl overflow-hidden border border-border/40 group shadow-inner">
                {erroVideo ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-muted-foreground bg-secondary/20" role="status">
                    <VideoOff className="w-9 h-9 text-muted-foreground mb-3" aria-hidden="true" />
                    <p className="text-sm font-medium text-foreground mb-1">Este vídeo não carregou.</p>
                    <p className="text-xs max-w-sm mb-4">
                      Os capítulos ao lado têm a narração de cada parte e o atalho para abrir a tela de que ela fala.
                    </p>
                    <button
                      onClick={() => { setErroVideo(false); videoRef.current?.load(); }}
                      className="text-xs font-semibold px-3 py-1.5 rounded-md bg-secondary/50 hover:bg-secondary text-foreground transition-colors"
                    >
                      Tentar de novo
                    </button>
                  </div>
                ) : (
                  // `src` direto, e não <source>: com <source> o erro dispara no
                  // filho e o `onError` do <video> nunca é chamado. `key` troca o
                  // elemento quando o filme muda, para não herdar estado do outro.
                  <video
                    key={filme.id}
                    ref={videoRef}
                    src={urlDoVideo(filme)}
                    poster={urlDaCapa(filme)}
                    playsInline
                    preload="metadata"
                    onTimeUpdate={aoAtualizarTempo}
                    onPlay={() => setEstaTocando(true)}
                    onPause={() => setEstaTocando(false)}
                    onError={() => setErroVideo(true)}
                    className="w-full h-full object-contain cursor-pointer"
                    onClick={alternarPlay}
                  />
                )}

                {!erroVideo && (
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/90 via-background/40 to-transparent p-3 flex flex-col gap-1.5 opacity-90 sm:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-200">
                    <input
                      type="range"
                      min={0}
                      max={filme.duracaoSegundos}
                      step={0.5}
                      value={tempoAtual}
                      onChange={(e) => {
                        const novo = Number(e.target.value);
                        setTempoAtual(novo);
                        if (videoRef.current) videoRef.current.currentTime = novo;
                      }}
                      className="w-full h-1.5 rounded-lg cursor-pointer accent-gold"
                      aria-label="Posição no vídeo"
                    />
                    <div className="flex items-center justify-between text-foreground text-xs pt-1">
                      <div className="flex items-center gap-2">
                        <button onClick={alternarPlay} className="p-1 rounded hover:bg-secondary/50 transition-colors" aria-label={estaTocando ? "Pausar" : "Reproduzir"}>
                          {estaTocando ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
                        </button>
                        <button
                          onClick={() => { if (videoRef.current) videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 10); }}
                          className="p-1 rounded hover:bg-secondary/50 transition-colors"
                          aria-label="Voltar 10 segundos"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                        {filme.comAudio && (
                          <button onClick={alternarMudo} className="p-1 rounded hover:bg-secondary/50 transition-colors" aria-label={mudo ? "Ativar som" : "Desativar som"}>
                            {mudo ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                          </button>
                        )}
                        <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                          {formatarTempo(tempoAtual)} / {formatarTempo(filme.duracaoSegundos)}
                        </span>
                      </div>
                      <button onClick={telaCheia} className="p-1 rounded hover:bg-secondary/50 transition-colors" aria-label="Tela cheia">
                        <Maximize className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {capituloAtivo && (
                <div className="bg-secondary/20 border border-border/30 rounded-xl p-3.5 flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold text-gold flex items-center gap-1.5 min-w-0">
                      <Sparkles className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span className="truncate">{capituloAtivo.titulo}</span>
                    </span>
                    <Link
                      href={capituloAtivo.rota}
                      onClick={fechar}
                      className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors shrink-0"
                    >
                      Abrir esta tela
                      <ExternalLink className="w-3 h-3" aria-hidden="true" />
                    </Link>
                  </div>
                  <p className="text-xs sm:text-sm text-foreground/90 leading-relaxed max-w-prose">
                    {capituloAtivo.narracao}
                  </p>
                </div>
              )}
            </div>

            {/* Direita: os vídeos e os capítulos do escolhido */}
            <div className="lg:col-span-5 flex flex-col p-4 sm:p-5 bg-secondary/5 gap-4">
              {FILMES_TUTORIAL.length > 1 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                    <Film className="w-3.5 h-3.5" aria-hidden="true" />
                    Vídeos
                  </p>
                  <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Escolher vídeo">
                    {FILMES_TUTORIAL.map((f) => {
                      const ativo = f.id === filme.id;
                      return (
                        <button
                          key={f.id}
                          role="tab"
                          aria-selected={ativo}
                          onClick={() => escolherFilme(f)}
                          title={f.resumo}
                          className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                            ativo ? "bg-gold/15 border-gold/40 text-foreground font-semibold" : "bg-card/40 border-border/30 text-muted-foreground hover:text-foreground hover:border-border/60"
                          }`}
                        >
                          {f.titulo}
                          <span className="ml-1.5 font-mono text-[10px] text-muted-foreground tabular-nums">{formatarTempo(f.duracaoSegundos)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5" aria-hidden="true" />
                    Capítulos
                  </p>
                  <span className="text-[11px] text-muted-foreground">{filme.capitulos.length}</span>
                </div>
                <div className="space-y-1.5 overflow-y-auto max-h-[380px] lg:max-h-[420px] pr-1">
                  {filme.capitulos.map((cap) => {
                    const ativo = cap.id === capituloAtivo?.id;
                    return (
                      <button
                        key={cap.id}
                        onClick={() => pularParaCapitulo(cap)}
                        className={`w-full text-left p-2.5 rounded-xl border transition-colors flex items-start gap-2.5 ${
                          ativo ? "bg-gold/10 border-gold/40" : "bg-card/40 border-border/25 hover:bg-secondary/30 hover:border-border/50"
                        }`}
                      >
                        <span className={`w-11 shrink-0 text-[11px] font-mono tabular-nums pt-0.5 ${ativo ? "text-gold font-semibold" : "text-muted-foreground"}`}>
                          {formatarTempo(cap.inicioSegundos)}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className={`block text-xs font-medium ${ativo ? "text-foreground font-semibold" : "text-foreground"}`}>
                            {cap.titulo}
                          </span>
                          <span className="block text-[11px] text-muted-foreground leading-snug line-clamp-2 mt-0.5">
                            {primeiraFrase(cap.narracao)}
                          </span>
                        </span>
                        <ChevronRight className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${ativo ? "text-gold" : "text-muted-foreground/40"}`} aria-hidden="true" />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
