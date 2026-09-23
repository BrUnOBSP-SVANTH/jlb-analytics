import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Toda URL externa que o navegador chama tem que caber na CSP.
 *
 * O QUE ACONTECEU (Auditoria 21/09, SEG-04). `passwordSafety.ts` chamava
 * `https://api.pwnedpasswords.com` para recusar senha já vazada. Só que o
 * `connect-src` da CSP libera apenas o próprio domínio, o Supabase e o wss: o
 * navegador BLOQUEAVA a chamada, o `catch` devolvia `null` e a regra — que
 * falha aberta de propósito — deixava a senha passar.
 *
 * Ninguém percebeu porque o sintoma é a AUSÊNCIA de um erro: o cadastro
 * funcionava, só que sem a proteção. Este teste existe para que a próxima
 * chamada externa esbarre aqui, e não em produção, em silêncio.
 */
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ_CLIENTE = join(AQUI, "..");
const SERVER_INDEX = join(AQUI, "..", "..", "..", "server", "index.ts");

function arquivosDoCliente(dir: string, saida: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) arquivosDoCliente(caminho, saida);
    else if (/\.(ts|tsx)$/.test(nome) && !nome.includes(".test.")) saida.push(caminho);
  }
  return saida;
}

/** Hosts que o `connect-src` da CSP libera, lidos do próprio servidor. */
function hostsLiberados(): string[] {
  const fonte = readFileSync(SERVER_INDEX, "utf-8");
  const bloco = fonte.slice(fonte.indexOf('"connect-src"'));
  const fim = bloco.indexOf("],");
  const trecho = bloco.slice(0, fim);
  const hosts: string[] = [];
  // Hosts literais e os que vêm de variável (supabaseHost, appHost).
  for (const m of trecho.matchAll(/https?:\/\/([a-z0-9.*-]+)/gi)) hosts.push(m[1].toLowerCase());
  if (/supabaseHost/.test(trecho)) hosts.push("__supabase__");
  return hosts;
}

/** Hosts que o cliente chama por `fetch`/`EventSource` com URL absoluta. */
function hostsChamados(): Array<{ host: string; arquivo: string }> {
  const achados: Array<{ host: string; arquivo: string }> = [];
  for (const arquivo of arquivosDoCliente(RAIZ_CLIENTE)) {
    const texto = readFileSync(arquivo, "utf-8");
    // Só o que está dentro de uma chamada de rede — link em href não passa pela CSP de connect-src.
    for (const m of texto.matchAll(/(?:fetch|EventSource|sendBeacon)\s*\(\s*[`"']https?:\/\/([a-z0-9.-]+)/gi)) {
      achados.push({ host: m[1].toLowerCase(), arquivo: arquivo.replace(RAIZ_CLIENTE, "") });
    }
  }
  return achados;
}

describe("CSP — o navegador consegue mesmo chamar o que o código chama", () => {
  it("🔴 nenhuma chamada externa do cliente fica fora do connect-src", () => {
    const liberados = hostsLiberados();
    const foraDaCSP = hostsChamados().filter(({ host }) => {
      if (host.includes("supabase")) return false;           // coberto por supabaseHost
      return !liberados.some((l) => l === host || (l.startsWith("*.") && host.endsWith(l.slice(1))));
    });

    expect(
      foraDaCSP,
      "chamada externa que a CSP bloqueia (o sintoma é a ausência de erro):\n"
      + foraDaCSP.map((f) => `  ${f.host} em ${f.arquivo}`).join("\n")
      + "\nOu passe pelo servidor (proxy), ou acrescente o host ao connect-src.",
    ).toEqual([]);
  });

  it("a checagem de senha vazada passa pelo nosso servidor", () => {
    // O caso concreto do achado: era chamada direta, e por isso nunca rodou.
    const fonte = readFileSync(join(RAIZ_CLIENTE, "lib", "passwordSafety.ts"), "utf-8");
    expect(fonte).toContain("/api/conta/senha-vazada");
    expect(fonte).not.toMatch(/fetch\(`https:\/\/api\.pwnedpasswords\.com/);
  });
});
