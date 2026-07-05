/**
 * generate-icons.mjs — gera os ícones PWA, apple-touch-icon e og-image
 * a partir do monograma da marca (mesma arte do favicon.svg).
 *
 * Uso: node scripts/generate-icons.mjs   (requer devDep `sharp`)
 * Saída: client/public/icons/*.png, apple-touch-icon.png, og-image.png
 */
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUB = path.join(ROOT, "client", "public");
const ICONS = path.join(PUB, "icons");
fs.mkdirSync(ICONS, { recursive: true });

const BG = "#16161f";
const GOLD = "#d8b14a";

/** Monograma (linha ascendente + ponto) em um viewBox 32, reescalável. */
const monogram = (scale = 1, offset = 0) => `
  <g transform="translate(${offset} ${offset}) scale(${scale})">
    <path d="M6.5 21.5 L12.5 14 L17.5 18 L25 8.5" fill="none" stroke="${GOLD}"
      stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="25" cy="8.5" r="2.4" fill="${GOLD}"/>
  </g>`;

/** Ícone "any": quadrado arredondado com a arte ocupando ~78% */
function iconSvg(size) {
  const s = (size * 0.78) / 32;
  const off = (size - 32 * s) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <rect width="${size}" height="${size}" rx="${size * 0.22}" fill="${BG}"/>
    ${monogram(s, off)}
  </svg>`;
}

/** Ícone maskable: fundo full-bleed, arte dentro da safe zone (~58%) */
function maskableSvg(size) {
  const s = (size * 0.58) / 32;
  const off = (size - 32 * s) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <rect width="${size}" height="${size}" fill="${BG}"/>
    ${monogram(s, off)}
  </svg>`;
}

/** OG image 1200×630 — cartão editorial da marca */
const ogSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <rect width="1200" height="630" fill="${BG}"/>
  <rect width="1200" height="630" fill="url(#glow)"/>
  <defs>
    <radialGradient id="glow" cx="0.85" cy="0.1" r="1">
      <stop offset="0%" stop-color="#2a2438"/>
      <stop offset="60%" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  ${monogram(7.5, 0)}
  <g transform="translate(96 0)">
    <text x="0" y="330" font-family="Segoe UI, Arial, sans-serif" font-size="86"
      font-weight="700" fill="#f5f2ea" letter-spacing="-2">JLB Analytics</text>
    <text x="0" y="398" font-family="Segoe UI, Arial, sans-serif" font-size="34"
      fill="#a89e8c">Educação quantitativa para mercados preditivos</text>
    <g transform="translate(0 448)">
      <rect width="330" height="52" rx="26" fill="${GOLD}" fill-opacity="0.12"
        stroke="${GOLD}" stroke-opacity="0.4"/>
      <text x="165" y="34" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif"
        font-size="22" font-weight="600" fill="${GOLD}">Polymarket · Kalshi · ao vivo</text>
    </g>
  </g>
</svg>`;

const jobs = [
  [iconSvg(192), path.join(ICONS, "icon-192.png")],
  [iconSvg(512), path.join(ICONS, "icon-512.png")],
  [maskableSvg(512), path.join(ICONS, "icon-maskable-512.png")],
  [iconSvg(180), path.join(PUB, "apple-touch-icon.png")],
  [ogSvg, path.join(PUB, "og-image.png")],
];

for (const [svg, out] of jobs) {
  await sharp(Buffer.from(svg)).png().toFile(out);
  console.log("gerado:", path.relative(ROOT, out));
}
