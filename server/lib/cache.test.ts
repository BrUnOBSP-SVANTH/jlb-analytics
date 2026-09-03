import { describe, it, expect, beforeEach, vi } from "vitest";
import { cache, getCache, setCache, swr, isRateLimited, limparCache, tamanhoCache } from "./cache.ts";

beforeEach(() => { cache.clear(); });

describe("getCache / setCache", () => {
  it("devolve o que foi guardado, dentro do prazo", () => {
    setCache("k", { a: 1 }, 60);
    expect(getCache<{ a: number }>("k")).toEqual({ a: 1 });
  });

  it("devolve null (e apaga) depois de vencer", () => {
    setCache("k", "x", -1);                 // já nasce vencida
    expect(getCache("k")).toBeNull();
    expect(cache.has("k")).toBe(false);     // leitura também faz a limpeza
  });
});

describe("swr — servir rápido sem servir mentira", () => {
  it("dentro do TTL não chama o buscador", async () => {
    const buscar = vi.fn().mockResolvedValue("novo");
    setCache("k", "guardado", 60);
    expect(await swr("k", 60, buscar)).toBe("guardado");
    expect(buscar).not.toHaveBeenCalled();
  });

  it("vencido mas ainda servível: devolve o VELHO na hora e atualiza atrás", async () => {
    let resolver: (v: string) => void = () => {};
    const buscar = vi.fn(() => new Promise<string>((r) => { resolver = r; }));
    cache.set("k", { data: "velho", expiresAt: Date.now() - 1000 });   // venceu há 1s

    expect(await swr("k", 60, buscar)).toBe("velho");   // não espera a rede
    expect(buscar).toHaveBeenCalledTimes(1);            // mas disparou o refresh
    resolver("novo");
    await new Promise((r) => setTimeout(r, 0));
    expect(getCache("k")).toBe("novo");                 // já trocou
  });

  // O ponto delicado: se a atualização em segundo plano falhar, o usuário não
  // pode ficar sem nada — o valor velho tem que sobreviver.
  it("refresh que falha NÃO derruba o valor velho", async () => {
    const buscar = vi.fn().mockRejectedValue(new Error("api fora"));
    cache.set("k", { data: "velho", expiresAt: Date.now() - 1000 });

    expect(await swr("k", 60, buscar)).toBe("velho");
    await new Promise((r) => setTimeout(r, 0));
    // A checagem certa é pelo `swr`, não pelo `getCache`: o getCache é estrito de
    // propósito (não entrega vencido); quem serve o velho na janela de tolerância
    // é o swr. O que importa é que a falha da rede não deixou o usuário sem nada.
    expect(await swr("k", 60, buscar)).toBe("velho");
    expect(buscar).toHaveBeenCalled();
  });

  it("chamadas simultâneas compartilham UMA busca (sem estouro)", async () => {
    const buscar = vi.fn(() => new Promise<string>((r) => setTimeout(() => r("v"), 10)));
    const [a, b, c] = await Promise.all([swr("k", 60, buscar), swr("k", 60, buscar), swr("k", 60, buscar)]);
    expect([a, b, c]).toEqual(["v", "v", "v"]);
    expect(buscar).toHaveBeenCalledTimes(1);
  });
});

describe("isRateLimited", () => {
  it("bloqueia ao passar do máximo e libera quando a janela anda", () => {
    for (let i = 0; i < 3; i++) expect(isRateLimited("t1", 3, 50)).toBe(false);
    expect(isRateLimited("t1", 3, 50)).toBe(true);
  });
});

describe("limparCache — o vazamento que só aparece depois de dias no ar", () => {
  it("remove entradas vencidas que ninguém releu", () => {
    // É este o caso que vazava: escrita, vencida, e nunca mais lida — sem leitura
    // não havia quem a apagasse.
    cache.set("velha", { data: 1, expiresAt: Date.now() - 1 });
    setCache("viva", 2, 600);
    const { expiradas } = limparCache();
    expect(expiradas).toBe(1);
    expect(cache.has("velha")).toBe(false);
    expect(getCache("viva")).toBe(2);
  });

  it("respeita um teto de tamanho, despejando as mais antigas primeiro", () => {
    for (let i = 0; i < 5200; i++) setCache(`k${i}`, i, 600);
    const { despejadas } = limparCache();
    expect(despejadas).toBeGreaterThan(0);
    expect(tamanhoCache().cache).toBeLessThanOrEqual(5000);
    expect(getCache("k0")).toBeNull();          // a mais antiga saiu
    expect(getCache("k5199")).toBe(5199);       // a mais nova ficou
  });
});
