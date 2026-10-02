/**
 * processar-audio-tutorial.mjs — a voz dos vídeos de ajuda, e o encaixe dela no vídeo.
 *
 * O vídeo do Playwright sai mudo (o Chromium não grava áudio de tela). A voz é
 * sintetizada à parte — Edge TTS, via scripts/gerar-narracao.py — e mixada no fim
 * com o ffmpeg-static.
 *
 * 🔴 A ORDEM MUDOU EM 01/10/2026, e é ela que garante a sincronia.
 *
 * Antes: grava o vídeo com cada cena durando o tempo ESTIMADO (palavras ÷ 2,6),
 * depois sintetiza a voz e completa cada trecho com silêncio (`apad`) até a
 * duração da cena. O `apad` só ESTICA, nunca corta: quando a voz falava mais
 * devagar que a estimativa, o trecho vazava para a cena seguinte — e cada cena
 * dali em diante ficava mais atrasada que a anterior. Uma análise de IA que leva
 * 30 segundos em vez dos 12 estimados desalinhava o resto do mesmo jeito.
 *
 * Agora:
 *   1. a voz de cada cena é sintetizada ANTES de gravar, e cada trecho é MEDIDO;
 *   2. o gravador segura cada cena pelo menos pelo tempo da fala dela;
 *   3. a trilha é montada com a duração REAL de cada cena — completada E cortada
 *      no tamanho exato, então nada vaza.
 */

import { spawnSync, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import ffmpegStatic from "ffmpeg-static";

const ROOT = path.resolve(import.meta.dirname, "..");

/** Duração de um arquivo de áudio em segundos, lida do próprio ffmpeg. */
function duracaoDoArquivo(arquivo) {
  // ffmpeg-static não traz ffprobe; o `-i` sem saída imprime a duração no stderr.
  const r = spawnSync(ffmpegStatic, ["-i", arquivo, "-f", "null", "-"], { encoding: "utf8" });
  const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(r.stderr ?? "");
  if (!m) throw new Error(`não consegui medir a duração de ${path.basename(arquivo)}`);
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

/**
 * Sintetiza a voz de cada cena e devolve quanto cada fala dura.
 * @param {{id: string, narracao: string}[]} cenas
 * @returns {Map<string, number>} id da cena → segundos de fala
 */
export function sintetizarNarracoes(cenas, audiosDir) {
  fs.mkdirSync(audiosDir, { recursive: true });
  const cenasJson = path.join(audiosDir, "cenas.json");
  fs.writeFileSync(cenasJson, JSON.stringify(cenas.map(({ id, narracao }) => ({ id, narracao })), null, 2), "utf-8");

  const py = spawnSync("python", [path.join(ROOT, "scripts", "gerar-narracao.py"), cenasJson, audiosDir], { stdio: "inherit" });
  if (py.status !== 0) throw new Error(`a síntese de voz falhou (python saiu com ${py.status})`);

  const duracoes = new Map();
  for (const c of cenas) duracoes.set(c.id, duracaoDoArquivo(path.join(audiosDir, `audio_${c.id}.mp3`)));
  return duracoes;
}

/**
 * Monta a trilha contínua com a duração REAL de cada cena.
 * `atrasoSegundos` é o silêncio antes da fala: o tempo que a página levou para
 * carregar, entre o começo da cena e o cartão do capítulo aparecer.
 * @param {{id: string, duracaoSegundos: number, atrasoSegundos?: number}[]} cenasMedidas
 */
export function montarTrilha(cenasMedidas, audiosDir, destinoWav) {
  const linhas = [];
  for (const cena of cenasMedidas) {
    const saida = path.join(audiosDir, `trecho_${cena.id}.wav`);
    const dur = cena.duracaoSegundos.toFixed(3);
    const atrasoMs = Math.max(0, Math.round((cena.atrasoSegundos ?? 0) * 1000));
    execFileSync(ffmpegStatic, [
      "-i", path.join(audiosDir, `audio_${cena.id}.mp3`),
      // adelay põe o silêncio da carga antes da fala; apad completa com silêncio;
      // atrim corta no tamanho exato. Juntos, o trecho tem EXATAMENTE a duração
      // da cena — é o que impede o vazamento.
      "-af", `adelay=${atrasoMs}:all=1,apad=whole_dur=${dur},atrim=0:${dur}`,
      "-ar", "48000", "-ac", "2",
      "-y", saida,
    ], { stdio: "pipe" });
    linhas.push(`file 'trecho_${cena.id}.wav'`);
  }
  const lista = path.join(audiosDir, "concat.txt");
  fs.writeFileSync(lista, linhas.join("\n"), "utf-8");
  execFileSync(ffmpegStatic, ["-f", "concat", "-safe", "0", "-i", lista, "-c", "copy", "-y", destinoWav], { stdio: "pipe" });
  return destinoWav;
}

export { duracaoDoArquivo };

/**
 * Junta vídeo e voz num mp4.
 *
 * ⚠️ O VÍDEO É ESTICADO ATÉ O FIM DA VOZ, nunca a voz cortada no fim do vídeo.
 * Medido em 01/10/2026: o vídeo do Playwright saiu 2,9 s mais curto que o
 * relógio da gravação. Ele só escreve quadro quando a tela muda, e na espera
 * final da última cena a página fica parada — esses quadros nunca chegam ao
 * arquivo. Com `-shortest`, a mixagem cortava pelo menor, e a última frase da
 * narração sobreviveu por 0,9 s de folga, por sorte. `tpad=clone` repete o
 * último quadro pelo tempo que faltar: a imagem é a mesma (a tela estava
 * parada), e a fala termina inteira.
 *
 * Só mp4 (H.264 + AAC): é o que o player usa e o que todo navegador toca. O
 * .webm custava 17 MB a mais por gravação e não era referenciado em lugar
 * nenhum depois que o player passou a usar `src` direto.
 */
export function mixarVideoEAudio(videoBruto, narracaoWav, destinoMp4) {
  const falta = Math.max(0, duracaoDoArquivo(narracaoWav) - duracaoDoArquivo(videoBruto));
  execFileSync(ffmpegStatic, [
    "-i", videoBruto, "-i", narracaoWav,
    "-vf", `tpad=stop_mode=clone:stop_duration=${(falta + 0.2).toFixed(2)}`,
    "-map", "0:v:0", "-map", "1:a:0",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "fast", "-crf", "26",
    "-c:a", "aac", "-b:a", "160k",
    // faststart: o índice vai para o começo do arquivo, e o player começa a
    // tocar antes de baixar tudo.
    "-movflags", "+faststart",
    // Agora `-shortest` corta só a folga de 0,2 s do tpad — pelo áudio.
    "-shortest", "-y", destinoMp4,
  ], { stdio: "pipe" });
}

/** Converte o vídeo mudo para mp4 — o caminho de `--sem-audio`. */
export function converterSemAudio(videoBruto, destinoMp4) {
  execFileSync(ffmpegStatic, [
    "-i", videoBruto,
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "fast", "-crf", "26",
    "-movflags", "+faststart", "-an", "-y", destinoMp4,
  ], { stdio: "pipe" });
}
