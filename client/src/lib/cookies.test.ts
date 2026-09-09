import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const cookies = readFileSync(join(SRC, "lib", "cookies.ts"), "utf-8");
const analytics = readFileSync(join(SRC, "lib", "analytics.ts"), "utf-8");
const aviso = readFileSync(join(SRC, "components", "AvisoDeCookies.tsx"), "utf-8");
const privacidade = readFileSync(join(SRC, "pages", "Privacidade.tsx"), "utf-8");

/**
 * A regra que orienta tudo isto: um aviso de cookies que não muda comportamento
 * é TEATRO — e teatro é pior que nada, porque dá ao usuário a impressão de
 * escolha e ao site a impressão de conformidade, sem nenhuma das duas.
 *
 * Cada teste aqui prende uma das peças que fazem a escolha ser real. Todas são
 * fáceis de desfazer sem perceber, e nenhuma quebraria a tela ao ser desfeita.
 */
describe("o consentimento MEXE no que o site faz", () => {
  it("a medição consulta o consentimento antes de enviar", () => {
    expect(analytics).toMatch(/podeMedir\(\)/);
  });

  it("a checagem vem ANTES de criar o identificador", () => {
    // Chamar anonId() antes da checagem criaria justamente o identificador que a
    // pessoa acabou de recusar — o dado já teria sido gravado.
    //
    // Compara as duas CHAMADAS exatas, e não os nomes soltos: a primeira versão
    // deste teste falhou porque o comentário que explica a ordem menciona
    // "anonId()" logo acima da linha do guarda. O código estava certo; o teste
    // é que estava lendo o comentário.
    const corpo = analytics.slice(analytics.indexOf("export function track"));
    const guarda = corpo.indexOf("if (!podeMedir()) return;");
    const uso = corpo.indexOf("anonId: anonId()");
    expect(guarda).toBeGreaterThan(-1);
    expect(uso).toBeGreaterThan(-1);
    expect(guarda).toBeLessThan(uso);
  });

  it("recusar APAGA o identificador que já existia", () => {
    // Recusar tem que desfazer, não só impedir daqui para a frente.
    expect(cookies).toMatch(/removeItem\(CHAVE_ANON\)/);
  });

  it("quem ainda não escolheu NÃO é medido", () => {
    // O contrário — medir e parar depois — já teria coletado o dado que a pessoa
    // vai recusar em seguida.
    expect(cookies).toMatch(/=== "completo" \? "completo" : "essencial"/);
  });

  it("navegador sem storage não vira consentimento por acidente", () => {
    // Se localStorage falhar, o padrão tem que ser o mais restritivo.
    const bloco = cookies.slice(cookies.indexOf("export function consentimento"));
    expect(bloco.slice(0, 260)).toMatch(/catch\s*\{\s*\n?\s*return "essencial"/);
  });
});

describe("o aviso oferece escolha de verdade", () => {
  it("recusar custa o mesmo que aceitar", () => {
    // O padrão da internet é esconder a recusa atrás de dois cliques ou de um
    // cinza apagado. Se recusar é mais difícil que aceitar, não é escolha.
    const botoes = aviso.match(/className="flex-1 lg:flex-none px-4 py-2\.5 rounded-lg text-xs font-semibold border[^"]*"/g) ?? [];
    expect(botoes.length).toBe(2);
    expect(botoes[0]).toBe(botoes[1]);   // mesmo peso visual, literalmente
  });

  it("não tem X de fechar — as duas saídas são decisões", () => {
    // Fechar sem escolher deixaria a pessoa achando que decidiu quando não decidiu.
    expect(aviso).not.toMatch(/aria-label="Fechar"/);
  });

  it("diz o que está em jogo, não 'este site usa cookies'", () => {
    expect(aviso).toMatch(/identificador aleatório/i);
    expect(aviso).toMatch(/sem nome, e-mail\s*\n?\s*ou IP|sem nome, e-mail ou IP/i);
  });

  it("leva para a lista completa", () => {
    expect(aviso).toMatch(/\/privacidade/);
  });
});

describe("a política descreve o que o site REALMENTE guarda", () => {
  it("lista as chaves de verdade, não uma frase genérica", () => {
    // Política que não bate com o código é pior que política nenhuma: promete
    // uma coisa e o site faz outra.
    for (const chave of ["jlb-theme", "jlb_anon_id", "jlb_aceite_pendente"]) {
      expect(privacidade).toContain(chave);
    }
  });

  it("separa o essencial do opcional", () => {
    expect(privacidade).toMatch(/Essencial/i);
    expect(privacidade).toMatch(/opcional/i);
  });

  it("nega publicidade e rastreador de terceiro", () => {
    expect(privacidade).toMatch(/publicidade/i);
    expect(privacidade).toMatch(/rastreador de terceiro|terceiro/i);
  });

  it("o contato é o e-mail que existe de verdade", () => {
    expect(privacidade).toContain("contato.jlbanalytics@gmail.com");
    expect(privacidade).not.toContain("jlbassetanalytics");
  });
});
