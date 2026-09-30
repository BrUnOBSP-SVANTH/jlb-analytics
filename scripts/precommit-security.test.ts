import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { temSenhaLiteral, SECRET_RE } from "./precommit-security.mjs";

/**
 * 🔴 A SENHA DA CONTA DE TUTORIAL FOI PARA O GITHUB PÚBLICO (30/09/2026).
 *
 * O gravador tinha um valor padrão "para funcionar sem configurar":
 *
 *     const senha = process.env.TUTORIAL_SENHA?.trim() || "<a senha da conta>";
 *
 * A conta existia, estava confirmada e tinha login recente. O hook não barrou
 * porque só procurava FORMATO de chave de API (JWT, sk_live, sk-ant) — e uma
 * senha escolhida por uma pessoa não tem formato nenhum.
 *
 * Estes testes usam a FORMA exata que passou, e não a senha: repetir a senha
 * aqui para provar que ela não pode estar no código seria o mesmo erro.
 *
 * ⚠️ E NENHUMA senha de exemplo está escrita neste arquivo — nem fictícia. Na
 * primeira versão estavam, e o próprio hook barrou o commit deste teste. Ele
 * estava certo: não sabe distinguir uma senha de exemplo de uma de verdade, e
 * não deveria precisar. Os valores são montados em tempo de execução, a partir
 * de pedaços curtos demais para casar, e entram no lugar do `§`.
 */
const SENHA_FICTICIA = ["Abc", "def", "20", "26!"].join("");
const comSenha = (modelo: string) => modelo.replace("§", SENHA_FICTICIA);

describe("o hook barra senha em texto puro", () => {
  it.each([
    ["a linha que passou (senha depois de ||)", comSenha(`const senha = process.env.TUTORIAL_SENHA?.trim() || "§";`)],
    ["atribuição direta", comSenha(`const senha = "§";`)],
    ["em objeto", comSenha(`{ password: "§" }`)],
    ["apiSecret", comSenha(`const apiSecret = "§";`)],
    ["passwd com aspa simples", comSenha(`passwd = '§'`)],
  ])("barra: %s", (_nome, linha) => {
    expect(temSenhaLiteral(linha)).toBe(true);
  });

  /**
   * Hook que reclama do jeito CERTO de escrever é hook que as pessoas aprendem
   * a contornar com --no-verify. Cada caso abaixo é código legítimo.
   */
  it.each([
    ["variável de ambiente sem padrão", `const senha = process.env.TUTORIAL_SENHA?.trim();`],
    ["string vazia", `const senha = "";`],
    ["seletor de formulário", `await page.getByLabel(/senha/i).first().fill(senha);`],
    ["comentário", `// a senha vem de TUTORIAL_SENHA`],
    ["atributo de input", `<input name="senha" type="password" />`],
    ["curto demais para ser senha", `const pwd = "abc";`],
    ["texto de interface (tem espaço)", `senhaFraca: "Use pelo menos 8 caracteres",`],
    ["ternário de rótulo", `const senhaValida = ok ? "muito forte" : "fraca";`],
    ["mensagem de erro", `if (!senha) throw new Error("configure TUTORIAL_SENHA no ambiente");`],
    // Os dois que a varredura do repositório achou ANTES de o hook entrar:
    ["import de tela (App.tsx)", `const ResetPassword = lazy(() => import("./pages/ResetPassword"));`],
    ["'secretário' em português", `secretario: ["secretary"], ministro: ["minister"],`],
  ])("deixa passar: %s", (_nome, linha) => {
    expect(temSenhaLiteral(linha)).toBe(false);
  });
});

describe("o repositório inteiro passa no hook", () => {
  /**
   * A garantia que importa: se uma linha JÁ commitada casar, a próxima pessoa
   * que mexer nela é bloqueada sem ter feito nada de errado. Foi assim que os
   * dois falsos positivos acima apareceram — varrendo antes de ligar o hook.
   *
   * E é também o que teria pegado a senha no dia 30/09.
   */
  it("nenhum arquivo rastreado tem senha literal", () => {
    const arquivos = execSync("git ls-files", { encoding: "utf8" })
      .split("\n")
      .filter((f) => f && /\.(ts|tsx|js|mjs|cjs|py|json|sql|yaml|yml|toml|sh)$/.test(f));
    const culpados: string[] = [];
    for (const f of arquivos) {
      let texto = "";
      try { texto = readFileSync(f, "utf8"); } catch { continue; }
      texto.split("\n").forEach((linha, i) => {
        if (temSenhaLiteral(linha)) culpados.push(`${f}:${i + 1}`);
      });
    }
    // Âncora: se a varredura não tivesse lido nada, "zero culpados" seria
    // mentira — é a armadilha do teste que fica verde sem olhar.
    expect(arquivos.length).toBeGreaterThan(100);
    expect(culpados, `senha literal em: ${culpados.join(", ")}`).toEqual([]);
  });

  it("as regras antigas continuam valendo", () => {
    // Montada em pedaços pelo mesmo motivo da senha: escrita inteira, ela é o
    // formato de chave da Anthropic, e o hook barra — com razão.
    const chaveFicticia = ["sk", "ant", "api03", "abcdefghijklmnop"].join("-");
    expect(SECRET_RE.test(chaveFicticia)).toBe(true);
    expect(SECRET_RE.test("const x = 1;")).toBe(false);
  });
});
