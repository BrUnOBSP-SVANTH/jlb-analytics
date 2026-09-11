/**
 * O que este teste protege, e por que ele existe.
 *
 * A página `/planos` faz duas promessas comerciais — quantas análises a conta
 * grátis dá, e quanto custa o Premium. As duas já quebraram, ou quase:
 *
 *   1. A COTA existia em dois lugares. O comentário no middleware registra o
 *      estrago: a interface anunciou 30 análises enquanto o servidor bloqueava
 *      em 4. Agora a constante é uma só, em `shared/planos.ts`, e este teste
 *      prende os dois lados a ela.
 *
 *   2. O PREÇO não está definido. Enquanto não estiver, a página não pode ter
 *      número nenhum escrito no código — ela lê `VITE_PREMIUM_PRECO_BRL` e, sem
 *      a variável, diz que o preço não está fechado. Num site cuja tese é não
 *      publicar número que não fecha, um preço de exemplo esquecido na página
 *      de preços seria a contradição mais cara que existe.
 *
 * ⚠️ Tira os comentários antes de casar padrão. Este arquivo e a própria página
 * CITAM o texto do defeito para explicá-lo; sem remover comentário, a
 * documentação da correção faz o lint acusar a si mesmo. Já mordeu quatro vezes
 * nesta base.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { COTA_GRATIS_MENSAL, CONSOME_COTA } from "./planos.ts";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");

const semComentarios = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

const ler = (rel: string) => semComentarios(readFileSync(join(RAIZ, rel), "utf-8"));

const PAGINA = ler("client/src/pages/Planos.tsx");
const MIDDLEWARE = ler("server/middleware/aiCredits.ts");

describe("cota do plano grátis", () => {
  it("é um número positivo e inteiro", () => {
    expect(Number.isInteger(COTA_GRATIS_MENSAL)).toBe(true);
    expect(COTA_GRATIS_MENSAL).toBeGreaterThan(0);
  });

  it("o servidor cobra a constante compartilhada, não um literal próprio", () => {
    expect(MIDDLEWARE).toMatch(/COTA_GRATIS_MENSAL\s+as\s+FREE_LIMIT/);
    expect(MIDDLEWARE).not.toMatch(/const\s+FREE_LIMIT\s*=\s*\d/);
  });

  it("a página anuncia a constante compartilhada, não um literal próprio", () => {
    expect(PAGINA).toMatch(/COTA_GRATIS_MENSAL/);
    expect(PAGINA).not.toMatch(/const\s+COTA_GRATIS\s*=\s*\d/);
  });

  it("a lista do que consome a cota não está vazia", () => {
    // Quem descobre o limite no meio de um fluxo achou que ele valia só para a
    // análise de mercado. A página precisa nomear tudo que gasta.
    expect(CONSOME_COTA.length).toBeGreaterThan(0);
  });
});

describe("preço do Premium", () => {
  it("vem de variável de ambiente, e não do código", () => {
    expect(PAGINA).toMatch(/VITE_PREMIUM_PRECO_BRL/);
  });

  it("não tem nenhum valor em reais escrito na página", () => {
    // Pega "R$ 29", "R$29,90" e "29,90" solto — as três formas de um preço de
    // exemplo sobreviver a um commit apressado.
    expect(PAGINA).not.toMatch(/R\$\s*\d/);
    expect(PAGINA).not.toMatch(/\d+,\d{2}\b/);
  });

  it("sem preço definido, a página diz isso em vez de inventar", () => {
    expect(PAGINA).toMatch(/não está fechado/);
  });
});
