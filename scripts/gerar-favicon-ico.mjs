/**
 * gerar-favicon-ico.mjs — client/public/favicon.ico a partir do favicon.svg.
 *
 * Só existia o SVG, e /favicon.ico — que navegador antigo, leitor de feed e
 * crawler pedem sem olhar o <link rel="icon"> — caía no SPA e voltava 200 com
 * HTML (auditoria de 14/09, item 11). O ICO embala PNGs renderizados do mesmo
 * SVG, então a marca continua tendo uma fonte só.
 *
 * Uso: node scripts/gerar-favicon-ico.mjs   (rodar de novo se o SVG mudar)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const PUBLICO = join(dirname(fileURLToPath(import.meta.url)), "..", "client", "public");
const svg = readFileSync(join(PUBLICO, "favicon.svg"), "utf-8");
const TAMANHOS = [16, 32, 48];

const navegador = await chromium.launch();
const pngs = [];
for (const lado of TAMANHOS) {
  const pagina = await navegador.newPage({ viewport: { width: lado, height: lado }, deviceScaleFactor: 1 });
  await pagina.setContent(`<html><body style="margin:0;background:transparent">${svg.replace(/width="\d+" height="\d+"/, `width="${lado}" height="${lado}"`)}</body></html>`);
  pngs.push(await pagina.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: lado, height: lado } }));
  await pagina.close();
}
await navegador.close();

// ICO: cabeçalho (6) + uma entrada de 16 bytes por imagem + os PNGs, em sequência.
const cabecalho = Buffer.alloc(6);
cabecalho.writeUInt16LE(0, 0); cabecalho.writeUInt16LE(1, 2); cabecalho.writeUInt16LE(pngs.length, 4);
let deslocamento = 6 + 16 * pngs.length;
const entradas = pngs.map((png, i) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(TAMANHOS[i], 0); e.writeUInt8(TAMANHOS[i], 1);
  e.writeUInt8(0, 2); e.writeUInt8(0, 3);
  e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
  e.writeUInt32LE(png.length, 8); e.writeUInt32LE(deslocamento, 12);
  deslocamento += png.length;
  return e;
});
const ico = Buffer.concat([cabecalho, ...entradas, ...pngs]);
writeFileSync(join(PUBLICO, "favicon.ico"), ico);
console.log(`favicon.ico: ${ico.length} bytes (${TAMANHOS.join(", ")} px)`);
