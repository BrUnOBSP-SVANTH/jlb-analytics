import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { urlPublica, hostPublico, ehProducao, ehEnderecoLocal, enderecoNoDominio } from "./urlPublica.ts";
import { ORIGEM_PUBLICA } from "../../shared/rotas.ts";

const RENDER = "https://jlb-analytics.onrender.com";

describe("urlPublica — endereço local não vence endereço público", () => {
  it("o caso real do Render (APP_URL=localhost): o endereço é o DOMÍNIO", () => {
    // 17/09: era isto que mandava quem pagasse para o próprio computador.
    // 02/10: a correção de então caía no endereço do Render, e quem pagava em
    // jlbanalytics.com voltava para jlb-analytics.onrender.com.
    const env = { APP_URL: "http://localhost:3000", RENDER_EXTERNAL_URL: RENDER };
    expect(urlPublica(env)).toBe("https://jlbanalytics.com");
    expect(hostPublico(env)).toBe("jlbanalytics.com");
    expect(urlPublica({ RENDER_EXTERNAL_URL: RENDER })).toBe(ORIGEM_PUBLICA);
  });

  it("APP_URL público manda — é a escolha de quem configurou", () => {
    const env = { APP_URL: "https://jlbanalytics.com.br", RENDER_EXTERNAL_URL: RENDER };
    expect(urlPublica(env)).toBe("https://jlbanalytics.com.br");
  });

  it("na máquina de quem desenvolve, local continua valendo", () => {
    expect(urlPublica({ APP_URL: "http://localhost:3000" })).toBe("http://localhost:3000");
    expect(urlPublica({})).toBe("http://localhost:3000");
  });

  it("barra no fim não entra no endereço", () => {
    expect(urlPublica({ APP_URL: "https://exemplo.com/" })).toBe("https://exemplo.com");
    expect(urlPublica({ NODE_ENV: "production" })).not.toMatch(/\/$/);
  });

  it("reconhece as formas de endereço local", () => {
    for (const u of ["http://localhost:3000", "http://127.0.0.1:8080", "http://localhost", "http://[::1]:3000"]) {
      expect(ehEnderecoLocal(u)).toBe(true);
    }
    for (const u of [RENDER, "https://jlbanalytics.com.br", undefined]) {
      expect(ehEnderecoLocal(u)).toBe(false);
    }
  });
});

describe("ehProducao — rodar no Render já é produção", () => {
  it("sem NODE_ENV, mas no Render: é produção", () => {
    // O serviço publicado está assim, e era o que soltava as origens de
    // desenvolvimento no CORS e na CSP do site.
    expect(ehProducao({ RENDER_EXTERNAL_URL: RENDER })).toBe(true);
  });

  it("NODE_ENV=production basta, mesmo fora do Render", () => {
    expect(ehProducao({ NODE_ENV: "production" })).toBe(true);
  });

  it("máquina de desenvolvimento não é produção", () => {
    expect(ehProducao({ NODE_ENV: "development" })).toBe(false);
    expect(ehProducao({})).toBe(false);
  });
});

describe("nenhuma trava do servidor pode depender de NODE_ENV", () => {
  // Em 17/09 a rota /api/cache/stats — que lista chaves com pergunta de usuário
  // — respondia 200 na internet aberta: a proteção dela era
  // `NODE_ENV === "production"`, e o serviço publicado está sem essa variável.
  // Quem decide isso é `ehProducao()`. Este teste existe para o atalho não voltar.
  const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

  function arquivosTs(dir: string): string[] {
    return readdirSync(dir).flatMap((nome) => {
      const alvo = path.join(dir, nome);
      if (statSync(alvo).isDirectory()) return arquivosTs(alvo);
      return nome.endsWith(".ts") && !nome.endsWith(".test.ts") ? [alvo] : [];
    });
  }

  // Comentário citando o erro (como o que ficou em index.ts) não é o erro.
  const semComentarios = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("ninguém compara NODE_ENV com production dentro de server/", () => {
    const culpados = arquivosTs(raiz)
      .filter((f) => f !== fileURLToPath(import.meta.url).replace(".test.ts", ".ts"))
      .filter((f) => /NODE_ENV\s*[=!]==?\s*["']production["']/.test(semComentarios(readFileSync(f, "utf8"))))
      .map((f) => path.relative(raiz, f));
    expect(culpados, "use ehProducao() de lib/urlPublica.ts").toEqual([]);
  });
});

describe("enderecoNoDominio — o endereço antigo leva ao domínio", () => {
  const HOST = "jlb-analytics.onrender.com";

  it("o caso real: a volta do login caía na raiz do Render", () => {
    // O fragmento (#access_token) não chega ao servidor; o navegador o carrega
    // sozinho através do redirecionamento — por isso o destino não o inclui.
    expect(enderecoNoDominio(HOST, "GET", "/")).toBe("https://jlbanalytics.com/");
  });

  it("mantém a página e a busca (o login PKCE volta com ?code=)", () => {
    expect(enderecoNoDominio(HOST, "GET", "/dashboard?code=abc&x=1")).toBe("https://jlbanalytics.com/dashboard?code=abc&x=1");
    expect(enderecoNoDominio(HOST, "HEAD", "/mercados")).toBe("https://jlbanalytics.com/mercados");
  });

  it("não desvia a API: o webhook do Stripe (POST em /api/stripe) pode estar cadastrado no endereço do Render", () => {
    expect(enderecoNoDominio(HOST, "POST", "/api/stripe/webhook")).toBeNull();
    expect(enderecoNoDominio(HOST, "GET", "/api/markets")).toBeNull();
    expect(enderecoNoDominio(HOST, "GET", "/api")).toBeNull();
    expect(enderecoNoDominio(HOST, "GET", "/ws")).toBeNull();
  });

  it("o service worker continua sendo servido no endereço antigo", () => {
    // O navegador recusa sw.js redirecionado: a versão velha instalada ali
    // nunca seria trocada.
    expect(enderecoNoDominio(HOST, "GET", "/sw.js")).toBeNull();
  });

  it("página com nome parecido com api não escapa por substring", () => {
    expect(enderecoNoDominio(HOST, "GET", "/apostas")).toBe("https://jlbanalytics.com/apostas");
  });

  it("o domínio, o www e a máquina local são servidos ali mesmo — sem laço", () => {
    expect(enderecoNoDominio("jlbanalytics.com", "GET", "/")).toBeNull();
    expect(enderecoNoDominio("www.jlbanalytics.com", "GET", "/")).toBeNull();
    expect(enderecoNoDominio("localhost", "GET", "/")).toBeNull();
    expect(enderecoNoDominio(undefined, "GET", "/")).toBeNull();
  });

  it("o próprio destino nunca é endereço do Render", () => {
    expect(new URL(ORIGEM_PUBLICA).hostname.endsWith(".onrender.com")).toBe(false);
  });
});
