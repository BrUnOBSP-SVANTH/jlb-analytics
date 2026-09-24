import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { destinoAposLoginSocial, destinoSeguro, guardarDestino, consumirDestino } from "./retornoLogin";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

describe("destinoAposLoginSocial — terminar o caminho de quem voltou do Google", () => {
  it("o caso de 16/09: token na raiz leva ao dashboard", () => {
    expect(destinoAposLoginSocial("#access_token=eyJ.abc&expires_in=3600&token_type=bearer", "/")).toBe("/dashboard");
    expect(destinoAposLoginSocial("#expires_in=3600&access_token=eyJ.abc", "/")).toBe("/dashboard");
  });

  it("se a volta já caiu no lugar certo, não mexe", () => {
    expect(destinoAposLoginSocial("#access_token=eyJ.abc", "/dashboard")).toBeNull();
    expect(destinoAposLoginSocial("#access_token=eyJ.abc", "/mercados")).toBeNull();
  });

  it("recuperação de senha tem tela própria", () => {
    expect(destinoAposLoginSocial("#access_token=eyJ.abc&type=recovery", "/")).toBeNull();
  });

  it("sem token de login no endereço, nada acontece", () => {
    expect(destinoAposLoginSocial("", "/")).toBeNull();
    expect(destinoAposLoginSocial("#secao-precos", "/")).toBeNull();
    expect(destinoAposLoginSocial("#not_access_token=x", "/")).toBeNull();
  });
});

describe("o login devolve a pessoa onde ela estava", () => {
  /**
   * UXP-05. Todo caminho para o login jogava a pessoa em /dashboard depois de
   * entrar — inclusive quem clicou em "Entrar" lendo a Banca Simulada, o
   * Perfil, os Duelos ou um mercado. A tarefa que ela estava fazendo sumia.
   */
  // O vitest roda em Node, sem sessionStorage — mesmo padrão de
  // desfechoPrevisao.test.ts.
  function storageEmMemoria() {
    const dados = new Map<string, string>();
    return {
      getItem: (k: string) => dados.get(k) ?? null,
      setItem: (k: string, v: string) => { dados.set(k, String(v)); },
      removeItem: (k: string) => { dados.delete(k); },
      clear: () => dados.clear(),
    };
  }
  beforeEach(() => { vi.stubGlobal("sessionStorage", storageEmMemoria()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("guarda e devolve o caminho, uma vez só", () => {
    guardarDestino("/portfolio");
    expect(consumirDestino()).toBe("/portfolio");
    // Segunda leitura vem vazia: o destino vale para uma entrada.
    expect(consumirDestino()).toBeNull();
  });

  it("🔴 endereço de FORA não vira destino", () => {
    // "Volte para onde estava" é o molde clássico do redirecionamento aberto:
    // o domínio na barra é o nosso, a página é de outro. `//` é endereço
    // relativo de protocolo — parece caminho e não é.
    for (const veneno of ["//evil.com", "https://evil.com", "http://evil.com/x", "javascript:alert(1)", ""]) {
      expect(destinoSeguro(veneno), veneno).toBeNull();
    }
    expect(destinoSeguro(42)).toBeNull();
    expect(destinoSeguro(null)).toBeNull();
  });

  it("⚠️ o próprio login não é destino — seria laço", () => {
    expect(destinoSeguro("/login")).toBeNull();
    expect(destinoSeguro("/reset-password")).toBeNull();
    // Mas um caminho que só COMEÇA parecido continua valendo.
    expect(destinoSeguro("/loginhelp")).toBe("/loginhelp");
  });

  it("caminho com busca é preservado inteiro", () => {
    // "?desfecho=" é o que torna o link de mercado compartilhável; perdê-lo
    // devolveria a pessoa para o mercado certo e o desfecho errado.
    guardarDestino("/mercados/ev-30829?desfecho=abc");
    expect(consumirDestino()).toBe("/mercados/ev-30829?desfecho=abc");
  });

  it("volta do Google prefere o destino guardado ao painel", () => {
    guardarDestino("/portfolio");
    expect(destinoAposLoginSocial("#access_token=abc", "/")).toBe("/portfolio");
    // Sem nada guardado, o painel continua sendo o padrão.
    expect(destinoAposLoginSocial("#access_token=abc", "/")).toBe("/dashboard");
  });
});

describe("nenhuma tela esquece de guardar onde estava", () => {
  /**
   * UXP-05 não foi uma tela distraída: foram cinco — barra, Dashboard, Perfil,
   * Banca Simulada e Duelos —, cada uma escrita num dia diferente, todas
   * omitindo a mesma linha. Uma regra que depende de lembrança vira defeito de
   * novo na sexta tela. Este teste é a lembrança.
   */
  it("🔴 quem manda para /login chama lembrarOndeEstou", () => {
    const AQUI = dirname(fileURLToPath(import.meta.url));
    const CLIENTE = join(AQUI, "..");
    /**
     * Exceção com motivo — e só esta. Quem cai em /reset-password sem token
     * está num beco, não sendo interrompido no meio de uma tarefa: o envio para
     * o login é o FIM do caminho, não uma pausa nele. (E "/reset-password"
     * sequer passaria por `destinoSeguro`, justamente para não virar laço.)
     */
    const COM_MOTIVO = new Set(["pages/ResetPassword.tsx"]);
    const faltando: string[] = [];
    const varrer = (dir: string) => {
      for (const e of readdirSync(dir)) {
        const p = join(dir, e);
        if (statSync(p).isDirectory()) { varrer(p); continue; }
        if (!/\.tsx$/.test(e)) continue;
        const conteudo = readFileSync(p, "utf-8");
        // Só quem LEVA para o login (link ou navegação), não quem apenas o cita.
        const leva = /href="\/login"|navigate\("\/login"\)/.test(conteudo);
        // Sem as linhas de `import`: tirar o `onClick` e deixar o import para
        // trás faria este teste passar num arquivo quebrado — foi exatamente o
        // que aconteceu na primeira vez que tentei provar que ele acusa.
        const semImports = conteudo.split("\n").filter((l) => !/^\s*import\b/.test(l)).join("\n");
        const nome = relative(CLIENTE, p).split("\\").join("/");
        if (leva && !/lembrarOndeEstou/.test(semImports) && !COM_MOTIVO.has(nome)) {
          faltando.push(nome);
        }
      }
    };
    varrer(CLIENTE);
    expect(faltando).toEqual([]);
  });
});
