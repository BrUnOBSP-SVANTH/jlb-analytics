import { describe, it, expect } from "vitest";
import TutorialModal from "./TutorialModal";
import { CAPITULOS_TUTORIAL } from "@shared/tutorialCenas";

describe("TutorialModal", () => {
  it("exporta o componente padrão TutorialModal", () => {
    expect(TutorialModal).toBeDefined();
    expect(typeof TutorialModal).toBe("function");
  });

  it("possui 8 capítulos cadastrados e prontos para navegação", () => {
    expect(CAPITULOS_TUTORIAL).toHaveLength(8);
    expect(CAPITULOS_TUTORIAL.map((c) => c.id)).toEqual([
      "abertura",
      "mercados",
      "mercado-detalhe",
      "analise-ia",
      "calculadoras",
      "simulador",
      "banca",
      "fecho",
    ]);
  });
});

