import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const termos = readFileSync(join(SRC, "pages", "Termos.tsx"), "utf-8");
const login = readFileSync(join(SRC, "pages", "Login.tsx"), "utf-8");
const aceite = readFileSync(join(SRC, "lib", "aceite.ts"), "utf-8");
const auth = readFileSync(join(SRC, "contexts", "AuthContext.tsx"), "utf-8");

/**
 * O aceite dos Termos protege o site de uma expectativa específica: a de que
 * análise é garantia de ganho. Estes testes prendem as três afirmações que o
 * fundador pediu que ficassem explícitas, e o caminho que grava o aceite.
 *
 * São fáceis de perder sem perceber: um "simplificar o texto" apaga uma frase,
 * um "limpar o formulário" tira a caixa, e nada quebra.
 */
describe("os Termos dizem com todas as letras o que precisam dizer", () => {
  it("assume que a plataforma ERRA", () => {
    expect(termos).toMatch(/erramos|erra/i);
    // E aponta onde o erro fica publicado — dizer que erra sem mostrar seria retórica.
    expect(termos).toMatch(/track-record/);
  });

  it("nega que análise seja garantia de ganho", () => {
    expect(termos).toMatch(/não é garantia|garante lucro|não garantem?/i);
  });

  it("nega método de lucro e tecnologia para burlar sistema", () => {
    // A frase que o fundador pediu, e a que mais evita briga depois.
    expect(termos).toMatch(/burlar/i);
    expect(termos).toMatch(/ganho garantido|retorno astronômico/i);
  });

  it("afirma o que a plataforma É: educação e análise", () => {
    expect(termos).toMatch(/EDUCAÇÃO e\s*\n?\s*ANÁLISE|educação e análise/i);
  });

  it("traz canal de ajuda para quem perdeu o controle", () => {
    // Não é exigência legal nossa hoje, é o mínimo decente num site que fala de
    // aposta o dia inteiro.
    expect(termos).toMatch(/Jogadores Anônimos|CVV|188/);
  });

  it("tem VERSÃO, e ela acompanha a data de atualização", () => {
    // Guardar "aceitou" sem guardar O QUE aceitou não prova nada depois que o
    // texto muda. A versão é o que dá sentido ao registro.
    expect(termos).toMatch(/export const VERSAO_TERMOS = "(\d{4}-\d{2}-\d{2})"/);
    const versao = termos.match(/VERSAO_TERMOS = "(\d{4})-(\d{2})-(\d{2})"/);
    expect(versao).not.toBeNull();

    // A data por extenso e a versão têm que falar do MESMO dia. São duas fontes
    // de verdade para a mesma data, e duas fontes divergem na primeira pressa:
    // alguém edita o texto visível e esquece a constante, e o aceite passa a
    // registrar uma versão diferente da que a pessoa leu.
    const porExtenso = termos.match(/UPDATED = "(\d{1,2}) de \w+ de (\d{4})"/);
    expect(porExtenso).not.toBeNull();
    expect(Number(porExtenso![1])).toBe(Number(versao![3]));   // dia
    expect(porExtenso![2]).toBe(versao![1]);                    // ano
  });
});

describe("o cadastro não passa sem aceite", () => {
  it("o botão de criar conta fica travado sem a caixa marcada", () => {
    expect(login).toMatch(/mode === "signup" && !aceitou/);
  });

  it("o envio também barra — não só o botão", () => {
    // Quem burlar o HTML desabilitado não passa daqui.
    expect(login).toMatch(/if \(!aceitou\)/);
  });

  it("o cadastro pelo GOOGLE passa pela mesma porta", () => {
    // Sem isto o aceite seria contornável com um clique: trocar para "criar
    // conta" e entrar pelo Google daria conta sem nunca ver os termos.
    const google = login.slice(login.indexOf("async function handleGoogle"), login.indexOf("async function handleGoogle") + 700);
    expect(google).toMatch(/mode === "signup"/);
    expect(google).toMatch(/!aceitou/);
    expect(google).toMatch(/marcarAceitePendente/);
  });

  it("a caixa diz O QUE está sendo aceito, não só 'li e concordo'", () => {
    // Quem clica em "li e concordo" não leu. As três coisas listadas são as que
    // geram briga depois.
    const bloco = login.slice(login.indexOf('type="checkbox"') - 900, login.indexOf('type="checkbox"') + 1400);
    expect(bloco).toMatch(/erram/i);
    expect(bloco).toMatch(/burlar/i);
    expect(bloco).toMatch(/educação e análise/i);
  });
});

describe("o aceite é gravado, e no momento certo", () => {
  it("guarda a VERSÃO junto com a data", () => {
    expect(aceite).toMatch(/termos_versao_aceita/);
    expect(aceite).toMatch(/termos_aceitos_em/);
  });

  it("grava quando a SESSÃO aparece, não no clique", () => {
    // No cadastro por e-mail a sessão só existe depois da confirmação; gravar no
    // clique falharia em silêncio (a RLS recusa) e deixaria o usuário sem o
    // registro que o aceite existe para garantir.
    expect(auth).toMatch(/resolverAceitePendente/);
    expect(auth).toMatch(/SIGNED_IN/);
  });

  it("falhar ao gravar não trava o login", () => {
    // A conta já existe e a pessoa já clicou. A marca fica e tenta de novo.
    expect(aceite).toMatch(/return false/);
    expect(aceite).toMatch(/catch/);
  });
});
