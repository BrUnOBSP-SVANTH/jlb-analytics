import { describe, it, expect } from "vitest";
import {
  normalizeCategory,
  computeCategoryBiases,
  applyCategoryCalibration,
  type ResolvedForecast,
} from "./calibration.ts";

describe("normalizeCategory — taxonomia canônica", () => {
  it("agrupa variações de crypto", () => {
    expect(normalizeCategory("Bitcoin")).toBe("crypto");
    expect(normalizeCategory("ethereum")).toBe("crypto");
    expect(normalizeCategory("XRP")).toBe("crypto");
  });

  it("unifica política (casing + geopolítica)", () => {
    expect(normalizeCategory("Politics")).toBe("politics");
    expect(normalizeCategory("politics")).toBe("politics");
    expect(normalizeCategory("Macro Geopolitics")).toBe("politics");
    expect(normalizeCategory("United States")).toBe("politics");
  });

  it("unifica esportes sem engolir esports nem tennis", () => {
    expect(normalizeCategory("Soccer")).toBe("sports");
    expect(normalizeCategory("football")).toBe("sports");
    expect(normalizeCategory("Formula 1")).toBe("sports");
    expect(normalizeCategory("Esports")).toBe("esports"); // NÃO cai em "sports"
    expect(normalizeCategory("tennis")).toBe("tennis");
  });

  it("evita falsos-positivos de substring", () => {
    expect(normalizeCategory("Awards")).toBe("culture"); // contém "war" mas não é política
    expect(normalizeCategory("Ethiopia")).toBe("other"); // contém "eth" mas não é crypto
  });

  it("desconhecida ou nula → other", () => {
    expect(normalizeCategory(null)).toBe("other");
    expect(normalizeCategory("")).toBe("other");
    expect(normalizeCategory("quantum widget")).toBe("other");
  });
});

describe("computeCategoryBiases — aprende só onde vale", () => {
  const rows: ResolvedForecast[] = [
    // crypto: IA disse 85 e aconteceu (deveria ser mais alto) → viés −15, n=20 → INCLUI
    ...Array.from({ length: 20 }, () => ({ fairValue: 85, outcome: true, category: "bitcoin" })),
    // politics: IA disse 30 e NÃO aconteceu → viés +30, n=16 → INCLUI
    ...Array.from({ length: 16 }, () => ({ fairValue: 30, outcome: false, category: "Politics" })),
    // tennis: viés grande mas n=10 < 15 → EXCLUI
    ...Array.from({ length: 10 }, () => ({ fairValue: 30, outcome: false, category: "tennis" })),
    // other: n=20 mas viés +5 < 10 → EXCLUI (ruído)
    ...Array.from({ length: 20 }, () => ({ fairValue: 5, outcome: false, category: "quantum widget" })),
  ];

  it("inclui buckets com amostra e viés relevante, com o sinal certo", () => {
    const map = computeCategoryBiases(rows);
    expect(map.crypto).toEqual({ biasPp: -15, n: 20 });
    expect(map.politics).toEqual({ biasPp: 30, n: 16 });
  });

  it("exclui bucket com amostra pequena (gating por n)", () => {
    const map = computeCategoryBiases(rows);
    expect(map.tennis).toBeUndefined();
  });

  it("exclui bucket com viés pequeno (gating por magnitude)", () => {
    const map = computeCategoryBiases(rows);
    expect(map.other).toBeUndefined();
  });

  it("respeita thresholds customizados", () => {
    const map = computeCategoryBiases(rows, { minN: 5, minBiasPp: 4 });
    expect(map.tennis).toBeDefined();  // agora n=10 >= 5 e |30| >= 4
    expect(map.other).toBeDefined();   // |5| >= 4
  });

  it("ignora linhas inválidas", () => {
    const dirty: ResolvedForecast[] = [
      ...Array.from({ length: 15 }, () => ({ fairValue: 80, outcome: true, category: "bitcoin" })),
      { fairValue: Number.NaN, outcome: true, category: "bitcoin" } as unknown as ResolvedForecast,
    ];
    const map = computeCategoryBiases(dirty);
    expect(map.crypto?.n).toBe(15);
  });
});

describe("applyCategoryCalibration — no-op honesto quando não há viés", () => {
  const map = { crypto: { biasPp: -15, n: 20 }, politics: { biasPp: 40, n: 20 } };

  it("subtrai o viés (crypto subestimado sobe)", () => {
    const r = applyCategoryCalibration(60, "bitcoin", map);
    expect(r).toEqual({ fairValue: 75, applied: true, bucket: "crypto", biasPp: -15 });
  });

  it("não mexe onde não há viés no mapa", () => {
    const r = applyCategoryCalibration(60, "tennis", map);
    expect(r).toEqual({ fairValue: 60, applied: false, bucket: "tennis", biasPp: null });
  });

  it("limita ao teto 95", () => {
    expect(applyCategoryCalibration(90, "bitcoin", map).fairValue).toBe(95); // 90+15=105 → 95
  });

  it("limita ao piso 5", () => {
    expect(applyCategoryCalibration(20, "Politics", map).fairValue).toBe(5); // 20-40=-20 → 5
  });
});
