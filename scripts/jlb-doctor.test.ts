import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { urlDoEventoPoly, urlDoEventoKalshi } from "../shared/linksDeMercado.ts";

const AQUI = dirname(fileURLToPath(import.meta.url));
const doctor = readFileSync(join(AQUI, "jlb-doctor.mjs"), "utf-8");

/**
 * O DOCTOR SÓ VALE SE A PESSOA ACREDITAR NELE.
 *
 * Em 27/09/2026 ele apontava QUATRO críticos e três eram falsos:
 *
 *  · duas "páginas órfãs" chamadas `Previsao.test.ts.tsx` e `niveis.test.ts.tsx`
 *    — arquivos de teste ao lado do arquivo, que é o padrão da casa;
 *  · "12/12 links do Polymarket quebrados", pela SEGUNDA vez, medindo um
 *    servidor de dev aberto antes do conserto.
 *
 * Alarme falso é pior que alarme nenhum: ensina a passar o olho pela lista de
 * prioridades sem ler, e o dia em que houver um crítico de verdade ele vai
 * estar no meio do ruído. Estes testes são sobre isso, não sobre os dois bugs.
 */
describe("telas órfãs não contam arquivos de teste", () => {
  it("o filtro de `.test`/`.spec` está lá, e só olha .tsx", () => {
    const bloco = doctor.slice(doctor.indexOf("function checkOrphanPages"), doctor.indexOf("function checkOrphanPages") + 1400);
    expect(bloco).toMatch(/walk\(PAGES, \[".tsx"\]\)/);
    expect(bloco).toMatch(/test\|spec/);
  });

  it("a conta que estava errada: basename de um .ts não corta nada", () => {
    // É isto que produzia o nome absurdo no relatório. Guardado como caso para
    // que ninguém "simplifique" o filtro de volta.
    expect(basename("Previsao.test.ts", ".tsx")).toBe("Previsao.test.ts");
    expect(basename("Previsao.tsx", ".tsx")).toBe("Previsao");
  });
});

describe("o doctor percebe quando audita um servidor desatualizado", () => {
  it("compara o formato recebido com o que o código gera hoje", () => {
    const bloco = doctor.slice(doctor.indexOf("async function checkLinksExternos"));
    expect(bloco).toMatch(/formatoAtual/);
    expect(bloco).toMatch(/rodando código anterior/);
    // Avisa, e não acusa: instância velha não é defeito do produto.
    expect(bloco).toMatch(/add\("warn", "Links"/);
  });

  /**
   * ⚠️ O formato está escrito à mão no doctor (ele é um `.mjs` que fala HTTP,
   * não importa o módulo). Este teste é a costura: se `linksDeMercado.ts`
   * mudar o endereço, o doctor passa a comparar contra um formato que não
   * existe mais e volta a dar alarme falso — exatamente o que ele deveria
   * detectar.
   */
  it("o formato escrito no doctor é o mesmo que shared/linksDeMercado produz", () => {
    const poly = urlDoEventoPoly("um-evento-qualquer");
    const kalshi = urlDoEventoKalshi("SERIE", "EVENTO");
    expect(doctor).toContain(`polymarket: "${poly!.slice(0, poly!.lastIndexOf("/") + 1)}"`);
    expect(doctor).toContain(`kalshi: "${kalshi!.slice(0, kalshi!.indexOf("/markets/") + 9)}"`);
  });
});
