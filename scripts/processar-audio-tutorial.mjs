/**
 * processar-audio-tutorial.mjs — orquestração de áudio e muxing para o tutorial do JLB.
 *
 * POR QUE ESTE MÓDULO EXISTE:
 * Ele une a síntese de voz neural (Edge TTS via scripts/gerar-narracao.py)
 * com o ffmpeg (ffmpeg-static) para:
 *   1. Sintetizar a narração neural em português de cada cena;
 *   2. Ajustar com silêncio (padding) para que cada frase comece exatamente
 *      no início da sua respectiva cena visual;
 *   3. Concatenar a trilha de voz completa;
 *   4. Mixar a trilha de áudio no vídeo bruto gerado pelo Playwright,
 *      produzindo tanto .webm (Opus) quanto .mp4 (H.264 + AAC).
 */

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import ffmpegStatic from "ffmpeg-static";

const ROOT = path.resolve(import.meta.dirname, "..");

export async function processarAudioTutorial(cenasComDuracao, saidaDir) {
  const audiosDir = path.join(saidaDir, "audios");
  fs.mkdirSync(audiosDir, { recursive: true });

  // 1. Prepara JSON para o script python
  const cenasJsonPath = path.join(audiosDir, "cenas.json");
  fs.writeFileSync(cenasJsonPath, JSON.stringify(cenasComDuracao, null, 2), "utf-8");

  // 2. Chama síntese neural em Python
  console.log("\n[Áudio] Sintetizando narração neural em português...");
  const pythonProc = spawnSync("python", [
    path.join(ROOT, "scripts", "gerar-narracao.py"),
    cenasJsonPath,
    audiosDir,
  ], { stdio: "inherit" });

  if (pythonProc.status !== 0) {
    throw new Error(`Falha na síntese de áudio via Python (código ${pythonProc.status})`);
  }

  // 3. Ajusta o tempo de cada áudio com silêncio final (apad) até a duração da cena
  console.log("[Áudio] Sincronizando e ajustando tempos dos capítulos com ffmpeg...");
  const concatLines = [];
  for (const cena of cenasComDuracao) {
    const inMp3 = path.join(audiosDir, `audio_${cena.id}.mp3`);
    const outWav = path.join(audiosDir, `padded_${cena.id}.wav`);

    execFileSync(ffmpegStatic, [
      "-i", inMp3,
      "-af", `apad=whole_dur=${cena.duracaoSegundos}`,
      "-ar", "48000",
      "-ac", "2",
      "-y", outWav,
    ], { stdio: "pipe" });

    // Nome relativo ao arquivo concat.txt que fica na mesma pasta
    concatLines.push(`file 'padded_${cena.id}.wav'`);
  }

  // 4. Concatena os áudios individuais em uma trilha contínua
  const concatTxt = path.join(audiosDir, "concat.txt");
  fs.writeFileSync(concatTxt, concatLines.join("\n"), "utf-8");

  const narracaoCompleta = path.join(saidaDir, "narracao_completa.wav");
  execFileSync(ffmpegStatic, [
    "-f", "concat",
    "-safe", "0",
    "-i", concatTxt,
    "-c", "copy",
    "-y", narracaoCompleta,
  ], { stdio: "pipe" });

  console.log(`[Áudio] Trilha contínua gerada: ${narracaoCompleta}`);
  return narracaoCompleta;
}

export function mixarVideoEAudio(videoBruto, narracaoWav, destinoWebm, destinoMp4) {
  console.log("\n[Muxing] Gerando tutorial.webm com áudio Opus...");
  execFileSync(ffmpegStatic, [
    "-i", videoBruto,
    "-i", narracaoWav,
    "-c:v", "copy",
    "-c:a", "libopus",
    "-b:a", "128k",
    "-shortest",
    "-y", destinoWebm,
  ], { stdio: "pipe" });

  console.log("[Muxing] Gerando tutorial.mp4 com H.264 e AAC para compatibilidade universal...");
  execFileSync(ffmpegStatic, [
    "-i", videoBruto,
    "-i", narracaoWav,
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-preset", "fast",
    "-c:a", "aac",
    "-b:a", "192k",
    "-movflags", "+faststart",
    "-shortest",
    "-y", destinoMp4,
  ], { stdio: "pipe" });

  console.log("[Muxing] Vídeos finalizados com áudio incorporado!");
}
