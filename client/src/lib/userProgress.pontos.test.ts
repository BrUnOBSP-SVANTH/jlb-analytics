import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { comoGanharPontos } from "./userProgress.ts";

const AQUI = dirname(fileURLToPath(import.meta.url));

/**
 * APR-01 — a tabela "Como ganhar pontos" do Perfil era uma lista fixa no JSX,
 * escrita à mão ao lado da regra. As duas divergiram, como duas listas para a
 * mesma verdade sempre divergem:
 *
 *  · prometia "+10 por visitar um novo nível" quando a regra dá +2 — e o toast
 *    na tela mostrava "+2 pts" logo depois da promessa;
 *  · omitia "resolver um exercício", que vale 10 e é justamente a atividade que
 *    o site mais quer que aconteça;
 *  · omitia a vitória em duelo.
 */
describe("a tabela de pontos é a regra, não uma cópia dela", () => {
  it("🔴 visitar nível vale o que a regra diz — 2, não 10", () => {
    const visitar = comoGanharPontos().find((a) => a.tipo === "level_visited");
    expect(visitar?.pontos).toBe(2);
  });

  it("🔴 resolver exercício aparece na lista", () => {
    const exercicio = comoGanharPontos().find((a) => a.tipo === "exercise_done");
    expect(exercicio).toBeDefined();
    expect(exercicio?.pontos).toBe(10);
  });

  it("nenhuma atividade fica de fora", () => {
    // O ponto da fonte única: atividade nova entra na tela sozinha.
    const tipos = comoGanharPontos().map((a) => a.tipo);
    expect(tipos).toContain("duel_won");
    expect(new Set(tipos).size).toBe(tipos.length);
    expect(tipos.length).toBeGreaterThanOrEqual(8);
  });

  it("toda atividade tem rótulo e limite escritos em português", () => {
    for (const a of comoGanharPontos()) {
      expect(a.rotulo.length, a.tipo).toBeGreaterThan(3);
      expect(a.limite, a.tipo).toMatch(/máx \d+\/dia|uma vez|sem limite/);
    }
  });

  it("⚠️ o Perfil não escreve mais número de ponto à mão", () => {
    const perfil = readFileSync(join(AQUI, "../pages/Perfil.tsx"), "utf-8");
    const tabela = perfil.slice(perfil.indexOf("Como ganhar pontos"), perfil.indexOf("Como ganhar pontos") + 1800);
    expect(tabela).toContain("comoGanharPontos()");
    // A forma antiga: `pts: "+10"` escrito no JSX.
    expect(tabela).not.toMatch(/pts:\s*"\+\d+"/);
  });
});

describe("os cinco níveis estão abertos, e a home diz isso", () => {
  it("🔴 a home não promete trava que não existe", () => {
    // Ela dizia "conclua 3 níveis" no Nível 4 e "conclua 4 níveis" no Nível 5,
    // com borda tracejada — e o link abria o nível assim mesmo. /educacao diz o
    // contrário na mesma visita: "os cinco estão abertos desde o começo".
    const home = readFileSync(join(AQUI, "../pages/Home.tsx"), "utf-8");
    const bloco = home.slice(home.indexOf("const LEVELS = NIVEIS.map"), home.indexOf("const HOW_IT_WORKS"));
    expect(bloco).not.toMatch(/conclua \$\{/);
    expect(bloco).not.toMatch(/aberto:/);
  });
});
