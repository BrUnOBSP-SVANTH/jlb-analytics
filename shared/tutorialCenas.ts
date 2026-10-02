/**
 * tutorialCenas.ts — o índice dos vídeos de ajuda que o player usa.
 *
 * ⚠️ GERADO por `pnpm tutorial` (scripts/indiceDoTutorial.mjs). NÃO EDITE À MÃO.
 * A narração vem de scripts/cenasDoTutorial.ts e os tempos foram MEDIDOS na
 * gravação de cada vídeo. Até 01/10/2026 este arquivo era uma cópia escrita à
 * mão, com a fala duplicada e os tempos chutados — clicar num capítulo pulava
 * para a cena errada. Editar aqui reintroduz exatamente isso.
 *
 * Só está aqui o filme que foi gravado: o player não oferece vídeo que não existe.
 */

export interface CapituloTutorial {
  id: string;
  titulo: string;
  rota: string;
  inicioSegundos: number;
  fimSegundos: number;
  narracao: string;
}

export interface FilmeTutorial {
  id: string;
  titulo: string;
  resumo: string;
  precisaConta: boolean;
  duracaoSegundos: number;
  /** Gravado com voz? `pnpm tutorial --sem-audio` produz vídeo mudo. */
  comAudio: boolean;
  /** Dia da gravação — o player mostra, para ninguém confundir vídeo velho com novo. */
  gravadoEm: string;
  capitulos: CapituloTutorial[];
}

/** De onde os arquivos são servidos (`TUTORIAL_VIDEO_BASE` na gravação). */
export const VIDEO_BASE = "/tutorial";

export const FILMES_TUTORIAL: readonly FilmeTutorial[] = /* DADOS */[]/* FIM */;

export function urlDoVideo(filme: FilmeTutorial, formato: "mp4" = "mp4"): string {
  return `${VIDEO_BASE}/${filme.id}.${formato}`;
}

/** O quadro de abertura do filme, para o player não mostrar um retângulo preto. */
export function urlDaCapa(filme: FilmeTutorial): string {
  return `${VIDEO_BASE}/${filme.id}.jpg`;
}

/** Formata segundos em MM:SS. */
export function formatarTempo(segundos: number): string {
  const s = Math.max(0, Math.floor(segundos));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** O capítulo em curso num dado segundo do vídeo. */
export function capituloPorSegundo(filme: FilmeTutorial, segundos: number): CapituloTutorial {
  return filme.capitulos.find((c) => segundos >= c.inicioSegundos && segundos < c.fimSegundos)
    ?? filme.capitulos[filme.capitulos.length - 1];
}
