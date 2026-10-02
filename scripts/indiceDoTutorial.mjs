/**
 * indiceDoTutorial.mjs — escreve `shared/tutorialCenas.ts`, o índice que o
 * player do site usa, a partir do que foi DE FATO gravado.
 *
 * 🔴 POR QUE ISTO EXISTE (01/10/2026). O índice de capítulos do player era uma
 * CÓPIA escrita à mão do roteiro — a narração duplicada e os tempos chutados
 * (0, 22, 49, 69…). O cabeçalho do roteiro dizia existir "para não existir uma
 * segunda versão da fala", e havia uma segunda versão da fala. E os tempos não
 * eram os do vídeo: a gravação real tem login, carregamento e a IA pensando, e
 * clicar num capítulo pulava para o meio da cena errada. O total do player
 * também era fixo (215s), então a barra de progresso não chegava ao fim do vídeo.
 *
 * Agora o gravador chama isto ao fim de cada filme que deu certo, com os
 * segundos MEDIDOS de cada cena. Filme que não foi gravado não entra — o player
 * só oferece vídeo que existe.
 *
 * Regravar um filme só substitui ele: os outros continuam no índice. A ordem é
 * sempre a do roteiro.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FILMES } from "./cenasDoTutorial.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARQUIVO = path.join(ROOT, "shared", "tutorialCenas.ts");

/** O que já estava gravado, lido do próprio arquivo gerado (o bloco JSON dele). */
function filmesJaGravados() {
  if (!fs.existsSync(ARQUIVO)) return [];
  const fonte = fs.readFileSync(ARQUIVO, "utf-8");
  const m = /\/\* DADOS \*\/([\s\S]*?)\/\* FIM \*\//.exec(fonte);
  if (!m) return []; // a versão antiga, escrita à mão, não tem o bloco — some
  try { return JSON.parse(m[1]); } catch { return []; }
}

const r1 = (n) => Math.round(n * 10) / 10;

export function escreverIndiceDoPlayer(filme, medidas, duracaoTotal, { comAudio }) {
  const porId = new Map(filme.cenas.map((c) => [c.id, c]));
  const gravado = {
    id: filme.id,
    titulo: filme.titulo,
    resumo: filme.resumo,
    precisaConta: filme.precisaConta,
    duracaoSegundos: r1(duracaoTotal),
    comAudio,
    gravadoEm: new Date().toISOString().slice(0, 10),
    capitulos: medidas.map((m) => {
      const c = porId.get(m.id);
      return { id: m.id, titulo: c.legenda, rota: c.rota, inicioSegundos: r1(m.inicio), fimSegundos: r1(m.fim), narracao: c.narracao };
    }),
  };

  const anteriores = filmesJaGravados().filter((f) => f.id !== filme.id);
  const ordem = FILMES.map((f) => f.id);
  const todos = [...anteriores, gravado]
    .filter((f) => ordem.includes(f.id)) // filme que saiu do roteiro sai do índice
    .sort((a, b) => ordem.indexOf(a.id) - ordem.indexOf(b.id));

  const base = (process.env.TUTORIAL_VIDEO_BASE ?? "/tutorial").replace(/\/$/, "");
  fs.writeFileSync(ARQUIVO, montarFonte(todos, base), "utf-8");
}

/**
 * Zera o índice: o player passa a dizer que os vídeos ainda não foram gravados.
 *
 * É o estado certo para o que vai ao Git enquanto os vídeos não têm onde morar
 * em produção — índice listando filme cujo arquivo dá 404 faria todo visitante
 * cair no "este vídeo não carregou". Uso: `node scripts/indiceDoTutorial.mjs --zerar`.
 */
export function escreverIndiceVazio() {
  const base = (process.env.TUTORIAL_VIDEO_BASE ?? "/tutorial").replace(/\/$/, "");
  fs.writeFileSync(ARQUIVO, montarFonte([], base), "utf-8");
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/indiceDoTutorial.mjs") && process.argv.includes("--zerar")) {
  escreverIndiceVazio();
  console.log(`índice zerado: ${ARQUIVO}`);
}

function montarFonte(filmes, base) {
  return `/**
 * tutorialCenas.ts — o índice dos vídeos de ajuda que o player usa.
 *
 * ⚠️ GERADO por \`pnpm tutorial\` (scripts/indiceDoTutorial.mjs). NÃO EDITE À MÃO.
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
  /** Gravado com voz? \`pnpm tutorial --sem-audio\` produz vídeo mudo. */
  comAudio: boolean;
  /** Dia da gravação — o player mostra, para ninguém confundir vídeo velho com novo. */
  gravadoEm: string;
  capitulos: CapituloTutorial[];
}

/** De onde os arquivos são servidos (\`TUTORIAL_VIDEO_BASE\` na gravação). */
export const VIDEO_BASE = ${JSON.stringify(base)};

export const FILMES_TUTORIAL: readonly FilmeTutorial[] = /* DADOS */${JSON.stringify(filmes, null, 2)}/* FIM */;

export function urlDoVideo(filme: FilmeTutorial, formato: "mp4" = "mp4"): string {
  return \`\${VIDEO_BASE}/\${filme.id}.\${formato}\`;
}

/** O quadro de abertura do filme, para o player não mostrar um retângulo preto. */
export function urlDaCapa(filme: FilmeTutorial): string {
  return \`\${VIDEO_BASE}/\${filme.id}.jpg\`;
}

/** Formata segundos em MM:SS. */
export function formatarTempo(segundos: number): string {
  const s = Math.max(0, Math.floor(segundos));
  return \`\${String(Math.floor(s / 60)).padStart(2, "0")}:\${String(s % 60).padStart(2, "0")}\`;
}

/** O capítulo em curso num dado segundo do vídeo. */
export function capituloPorSegundo(filme: FilmeTutorial, segundos: number): CapituloTutorial {
  return filme.capitulos.find((c) => segundos >= c.inicioSegundos && segundos < c.fimSegundos)
    ?? filme.capitulos[filme.capitulos.length - 1];
}
`;
}
