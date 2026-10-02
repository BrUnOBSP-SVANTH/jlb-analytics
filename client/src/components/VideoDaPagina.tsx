/**
 * VideoDaPagina.tsx — o vídeo de ajuda DENTRO da página de que ele fala.
 *
 * Até 02/10/2026 os vídeos só existiam num modal, aberto pelo menu "Aprender",
 * e quem chegava na página inicial nunca os via. O fundador pediu cada vídeo
 * na sua página. Qual vídeo mora onde não é tabela escrita à mão: é o filme cuja
 * primeira cena é naquela rota (`filmeDaPagina`, em shared/tutorialCenas.ts).
 * Filme ainda não gravado = nada na tela, sem placeholder.
 *
 * Duas formas, porque as páginas não são iguais:
 *  · `VideoDaPagina` — o player embutido, para páginas de CONTEÚDO (a inicial,
 *    a trilha), onde assistir é o que se veio fazer;
 *  · `BotaoVideoDaPagina` — uma linha que abre o player em modal, para telas de
 *    FERRAMENTA, onde um vídeo grande no topo empurraria o trabalho de quem já
 *    sabe usar.
 *
 * ⚠️ PESO. A página inicial tem orçamento (452→340 KB, memória de performance).
 * Até o play, o embutido é só a capa (~115 KB, `loading="lazy"`, e ela fica
 * abaixo da dobra); o <video> nem existe. Os 7 MB vêm só para quem pediu.
 */
import { useRef, useState } from "react";
import { Play, Film, VideoOff } from "lucide-react";
import {
  filmeDaPagina,
  formatarTempo,
  capituloPorSegundo,
  urlDoVideo,
  urlDaCapa,
  type CapituloTutorial,
  type FilmeTutorial,
} from "@shared/tutorialCenas";
import { abrirTutorial } from "@/lib/tutorial";
import { track } from "@/lib/analytics";

/** "2 de outubro de 2026" — para ninguém tomar um vídeo velho por novo. */
function dataGravacao(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
}

/** "2:56" em vez de "02:56" — no texto corrido o zero à esquerda pesa. */
function duracaoCurta(segundos: number): string {
  return formatarTempo(segundos).replace(/^0(\d)/, "$1");
}

export default function VideoDaPagina({ rota }: { rota: string }) {
  const filme = filmeDaPagina(rota);
  if (!filme) return null;
  return <PlayerEmbutido filme={filme} />;
}

function PlayerEmbutido({ filme }: { filme: FilmeTutorial }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  /** Segundo em que o vídeo deve começar quando montar (capítulo clicado antes do play). */
  const inicioPendente = useRef(0);
  const [iniciado, setIniciado] = useState(false);
  const [erro, setErro] = useState(false);
  const [capituloAtivo, setCapituloAtivo] = useState(filme.capitulos[0]?.id);

  const idTitulo = `video-${filme.id}-titulo`;

  function assistir(desde?: CapituloTutorial) {
    const segundo = desde?.inicioSegundos ?? 0;
    if (desde) setCapituloAtivo(desde.id);
    if (!iniciado) {
      inicioPendente.current = segundo;
      setIniciado(true);
      track("cta_click", { id: `video_${filme.id}` });
      return;
    }
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = segundo;
    v.play().catch(() => {});
  }

  return (
    <div role="region" aria-labelledby={idTitulo} className="rounded-2xl border border-border/30 overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-12">
        <div className="lg:col-span-8 relative aspect-video bg-background">
          {erro ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center" role="status">
              <VideoOff className="w-8 h-8 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm font-medium text-foreground">Este vídeo não carregou.</p>
              <p className="text-xs text-muted-foreground max-w-sm">
                O que ele diz está logo abaixo, em “Ler o que o vídeo diz”.
              </p>
              <button
                type="button"
                onClick={() => { setErro(false); setIniciado(false); }}
                className="mt-2 text-xs font-semibold px-3 py-1.5 rounded-md border border-border/40 text-foreground hover:bg-secondary/40 transition-colors"
              >
                Tentar de novo
              </button>
            </div>
          ) : iniciado ? (
            // `src` direto (não <source>): com <source>, o erro dispara no filho
            // e o onError do <video> nunca chega — foi a caixa preta muda do modal.
            <video
              ref={videoRef}
              src={urlDoVideo(filme)}
              poster={urlDaCapa(filme)}
              controls
              autoPlay
              playsInline
              preload="auto"
              onLoadedMetadata={(e) => {
                if (inicioPendente.current > 0) e.currentTarget.currentTime = inicioPendente.current;
              }}
              onTimeUpdate={(e) => {
                const atual = capituloPorSegundo(filme, e.currentTarget.currentTime);
                if (atual && atual.id !== capituloAtivo) setCapituloAtivo(atual.id);
              }}
              onError={() => setErro(true)}
              className="absolute inset-0 w-full h-full object-contain"
            />
          ) : (
            <button
              type="button"
              onClick={() => assistir()}
              aria-label={`Assistir: ${filme.titulo} (${duracaoCurta(filme.duracaoSegundos)}${filme.comAudio ? ", com narração" : ""})`}
              className="group absolute inset-0 w-full h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
            >
              <img
                src={urlDaCapa(filme)}
                alt=""
                width={1280}
                height={720}
                loading="lazy"
                decoding="async"
                className="absolute inset-0 w-full h-full object-cover"
              />
              <span className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
                <span className="flex items-center gap-2.5 pl-4 pr-5 py-3 rounded-full bg-primary text-primary-foreground font-semibold text-sm shadow-lg group-hover:scale-[1.03] transition-transform duration-200">
                  <Play className="w-4 h-4 fill-current" />
                  Assistir
                  <span className="font-mono text-xs tabular-nums opacity-80">{duracaoCurta(filme.duracaoSegundos)}</span>
                </span>
              </span>
            </button>
          )}
        </div>

        <div className="lg:col-span-4 flex flex-col gap-4 p-5 border-t lg:border-t-0 lg:border-l border-border/30">
          <div>
            <h3 id={idTitulo} className="text-base font-semibold text-foreground text-balance flex items-start gap-2">
              <Film className="w-4 h-4 mt-1 text-primary shrink-0" aria-hidden="true" />
              {filme.titulo}
            </h3>
            <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed max-w-prose">{filme.resumo}</p>
            <p className="text-xs text-muted-foreground mt-2">
              {filme.comAudio ? "Com narração" : "Sem narração"}, gravado em {dataGravacao(filme.gravadoEm)}.
            </p>
          </div>

          {/* Os capítulos são uma sequência de verdade (a ordem do vídeo), e o
              tempo de cada um é o MEDIDO na gravação — clicar leva ao ponto certo. */}
          <ol className="flex flex-col gap-0.5 -mx-2" aria-label="Capítulos">
            {filme.capitulos.map((c) => {
              const ativo = iniciado && c.id === capituloAtivo;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => assistir(c)}
                    aria-current={ativo ? "true" : undefined}
                    className={`w-full flex items-baseline gap-3 px-2 py-1.5 rounded-md text-left text-sm transition-colors ${
                      ativo ? "bg-secondary/50 text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary/30"
                    }`}
                  >
                    <span className="font-mono text-xs tabular-nums shrink-0 w-10">{formatarTempo(c.inicioSegundos)}</span>
                    <span className="min-w-0">{c.titulo}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      {/* A transcrição: quem não pode (ou não quer) ouvir lê o mesmo conteúdo. */}
      <details className="border-t border-border/30">
        <summary className="px-5 py-3 text-sm text-muted-foreground hover:text-foreground cursor-pointer select-none">
          Ler o que o vídeo diz
        </summary>
        <div className="px-5 pb-5 flex flex-col gap-4">
          {filme.capitulos.map((c) => (
            <div key={c.id}>
              <p className="text-sm font-semibold text-foreground">{c.titulo}</p>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-prose mt-1">{c.narracao}</p>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

/**
 * A forma compacta, para telas de ferramenta: uma linha que abre o player do
 * site (o TutorialModal) já no vídeo desta página.
 */
export function BotaoVideoDaPagina({ rota, className = "" }: { rota: string; className?: string }) {
  const filme = filmeDaPagina(rota);
  if (!filme) return null;
  return (
    <button
      type="button"
      onClick={() => {
        track("cta_click", { id: `video_${filme.id}` });
        abrirTutorial({ capituloId: filme.capitulos[0]?.id });
      }}
      className={`inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors ${className}`}
    >
      <Play className="w-3.5 h-3.5 text-primary fill-current" aria-hidden="true" />
      Ver como funciona
      <span className="font-mono text-xs tabular-nums">{duracaoCurta(filme.duracaoSegundos)}</span>
    </button>
  );
}
