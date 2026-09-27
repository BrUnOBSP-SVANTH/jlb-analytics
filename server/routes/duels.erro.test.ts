import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ehFalhaDeFonte } from "./duels.ts";

const AQUI = dirname(fileURLToPath(import.meta.url));
const duels = readFileSync(join(AQUI, "duels.ts"), "utf-8");
const cliente = (rel: string) => readFileSync(join(AQUI, "..", "..", "client", "src", rel), "utf-8");

/** O comentário que explica o defeito cita o defeito. Já mordeu seis vezes. */
const semComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

/**
 * "A FONTE NÃO RESPONDEU" NÃO É "O CÓDIGO QUEBROU" — nem "não há nada".
 *
 * A varredura de 27/09/2026 pegou /duelos e /leaderboard devolvendo
 * `500 {"error":"internal"}` de forma intermitente: numa rodada falhavam, na
 * seguinte passavam, e oito curls seguidos davam 200. Era o Supabase passando
 * dos 8s de timeout — nada de errado com o código.
 *
 * O estrago vinha em dois lugares ao mesmo tempo, e este arquivo cobre os dois
 * porque consertar só um deixa o defeito de pé:
 *
 *  · no SERVIDOR, chamar isso de 500 manda procurar um bug que não existe;
 *  · no CLIENTE, `fetch(...).then(r => r.json())` transformava a resposta de
 *    erro num objeto sem `duels`, o `?? []` fazia dele uma lista vazia, e a
 *    tela anunciava "Nenhum duelo aberto agora" — afirmando um fato que ninguém
 *    verificou, e convidando a pessoa a criar um duelo para encher um lobby que
 *    podia estar cheio.
 */
describe("o servidor diz de quem é a culpa", () => {
  it("nenhum handler devolve 500 direto no catch", () => {
    const fonte = semComentarios(duels);
    const cruas = fonte.split(/\r?\n/).filter((l) => /status\(500\)/.test(l));
    // A única 500 que resta vive dentro de `respostaDeErro`, que só a usa
    // depois de descartar falha de fonte.
    expect(cruas.length, `500 fora de respostaDeErro: ${cruas.join(" | ")}`).toBeLessThanOrEqual(1);
    expect(fonte).toMatch(/function respostaDeErro/);
  });

  it("timeout e rede viram 503, e com frase em português", () => {
    const bloco = duels.slice(duels.indexOf("function respostaDeErro"), duels.indexOf("function respostaDeErro") + 900);
    expect(bloco).toMatch(/status\(503\)/);
    // "internal" não é uma frase. Toda resposta de erro carrega `message`.
    expect(bloco).toMatch(/message:/);
  });

  /**
   * A linha divisória, com os erros que estas rotas REALMENTE lançam — e não
   * com exemplos inventados. Os sete primeiros são o que o Node e o PostgREST
   * produzem quando a fonte cai; os três últimos são defeito nosso e têm de
   * continuar 500, senão o 503 vira o novo "internal" e esconde bug de verdade.
   */
  it.each([
    ["AbortError: The operation was aborted due to timeout", true],
    ["TimeoutError: signal timed out", true],
    ["Error: supabase 503", true],
    ["Error: supabase 500", true],
    ["TypeError: fetch failed", true],
    ["Error: connect ECONNRESET 1.2.3.4:443", true],
    ["Error: supabase 429", true],
    ["TypeError: Cannot read properties of undefined", false],
    ["Error: supabase 400", false],
    ["SyntaxError: Unexpected token < in JSON", false],
  ])("classifica %s", (texto, esperado) => {
    const [nome, ...resto] = texto.split(": ");
    const erro = Object.assign(new Error(resto.join(": ")), { name: nome });
    expect(ehFalhaDeFonte(erro)).toBe(esperado);
  });

  it("todo catch passa por respostaDeErro", () => {
    const fonte = semComentarios(duels);
    const catches = (fonte.match(/\}\s*catch\s*\(err\)\s*\{/g) ?? []).length;
    const tratados = (fonte.match(/respostaDeErro\(res,/g) ?? []).length;
    expect(tratados).toBe(catches);
  });
});

describe("a tela conta quando não conseguiu carregar", () => {
  it("o lobby de duelos separa 'vazio' de 'não carregou'", () => {
    const fonte = cliente("pages/Duelos.tsx");
    // `buscarJson` lança em resposta ruim; `fetch().then(r => r.json())` não.
    expect(semComentarios(fonte)).not.toMatch(/fetch\("\/api\/duels\/open"\)/);
    expect(fonte).toMatch(/buscarJson<\{ duels: OpenDuel\[\] \}>\("\/api\/duels\/open"\)/);
    expect(fonte).toMatch(/lobbyFora/);
  });

  it("o ranking de duelistas não some em silêncio", () => {
    const fonte = cliente("pages/Leaderboard.tsx");
    const bloco = semComentarios(fonte.slice(fonte.indexOf("function DuelRanking"), fonte.indexOf("export default function Leaderboard")));
    // Era `.catch(() => {})` seguido de `if (rows.length === 0) return null`:
    // falha e vazio davam a mesma tela — nenhuma.
    //
    // ⚠️ A checagem é só deste bloco, e de propósito. Há OUTRO `.catch(() => {})`
    // no arquivo, nas réguas de comparação, e ele está certo: quando o track
    // record não responde, a linha aparece com travessão em vez de número — o
    // estado já é visível. Catch vazio não é o defeito; catch vazio que apaga a
    // única prova de que algo falhou, sim.
    expect(bloco).not.toMatch(/catch\(\(\) => \{\}\)/);
    expect(bloco).toMatch(/setFonteFora\(true\)/);
    expect(bloco).toMatch(/buscarJson</);
  });
});
