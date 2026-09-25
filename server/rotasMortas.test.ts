import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..");
const ler = (rel: string) => readFileSync(join(RAIZ, rel), "utf-8");

function arquivos(dir: string, exts: RegExp, saida: string[] = []): string[] {
  if (!existsSync(dir)) return saida;
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === "dist") continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) arquivos(p, exts, saida);
    else if (exts.test(e)) saida.push(p);
  }
  return saida;
}

/**
 * DES-04 — código morto que gastava cota de API externa.
 *
 * `broadcastQuotes` consultava BRAPI e Yahoo a cada 30 segundos, e também a cada
 * nova conexão WebSocket, para transmitir uma mensagem `type: "quotes"` que
 * NENHUM cliente consumia — zero referências no cliente inteiro. Enquanto
 * alguém tivesse o site aberto, o servidor queimava cota de duas APIs externas
 * duas vezes por minuto, gastava CPU num plano de 0,1 e arriscava o IP no
 * Yahoo, para jogar o resultado fora.
 *
 * Junto saíram cinco rotas com zero referências em todo o repositório:
 * `/api/quotes/br`, `/us`, `/indices`, `/ticker/:symbol` e `/api/ticker-tape`.
 * Cada uma era uma porta aberta para o mesmo desperdício.
 *
 * Medido depois: `brapi.dev` aparece 0 vez no bundle do servidor; do Yahoo
 * sobrou apenas o endpoint de histórico, que a aba de correlação do Nível 2 usa.
 */
describe("cotação só é buscada por quem usa", () => {
  const market = ler("server/routes/market.ts");
  const index = ler("server/index.ts");
  const semComentarios = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("🔴 as cinco rotas sem uso não voltaram", () => {
    const codigo = semComentarios(market);
    for (const rota of ["/quotes/br", "/quotes/us", "/quotes/indices", "/quotes/ticker/:symbol", "/ticker-tape"]) {
      expect(codigo, rota).not.toContain(`router.get("${rota}"`);
    }
  });

  it("as duas que são usadas continuam de pé", () => {
    // Medidas em uso, não supostas: `/rates` no painel macro e
    // `/quotes/history` na aba de correlação do Nível 2.
    expect(market).toContain('router.get("/rates"');
    expect(market).toContain('router.get("/quotes/history/:symbol"');
  });

  it("🔴 o broadcast de cotações não existe mais", () => {
    const codigo = semComentarios(index);
    expect(codigo).not.toMatch(/broadcastQuotes/);
    expect(codigo).not.toMatch(/type: "quotes"/);
  });

  it("⚠️ BRAPI saiu do servidor inteiro", () => {
    // O módulo foi apagado. Se alguém reintroduzir, é porque tem consumidor —
    // e aí este teste é o lugar de dizer qual.
    // Sem os próprios testes: este arquivo CITA "brapi.dev" ao explicar a
    // remoção, e na primeira rodada ele se acusou.
    const arquivosDoServidor = arquivos(join(RAIZ, "server"), /\.ts$/).filter((f) => !/\.test\.ts$/.test(f));
    const comBrapi = arquivosDoServidor
      .filter((f) => /brapi\.dev|fetchBrapiQuotes/.test(readFileSync(f, "utf-8")))
      .map((f) => f.slice(RAIZ.length + 1));
    expect(comBrapi).toEqual([]);
  });

  it("nenhum cliente perdeu nada: ninguém lia `type: \"quotes\"`", () => {
    const doCliente = arquivos(join(RAIZ, "client", "src"), /\.tsx?$/).filter((f) => !/\.test\.tsx?$/.test(f));
    const leitores = doCliente
      .filter((f) => /"quotes"/.test(readFileSync(f, "utf-8")))
      .map((f) => f.slice(RAIZ.length + 1));
    expect(leitores).toEqual([]);
  });
});
