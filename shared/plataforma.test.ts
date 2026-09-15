import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { nomeDaPlataforma, verNaPlataforma, volumeNaMoeda, negociaDinheiroReal } from "./plataforma.ts";

describe("plataforma — a origem é dita, não deduzida por exclusão", () => {
  it("Manifold é Manifold, não Polymarket", () => {
    expect(nomeDaPlataforma("manifold")).toBe("Manifold");
    expect(verNaPlataforma("manifold")).toBe("Ver no Manifold");
    expect(verNaPlataforma("kalshi")).toBe("Ver no Kalshi");
    expect(verNaPlataforma("reddit")).toBe("Ver no Reddit");
  });

  it("fonte desconhecida não vira Polymarket", () => {
    expect(nomeDaPlataforma("metaculus")).toBeNull();
    expect(nomeDaPlataforma(undefined)).toBeNull();
    expect(nomeDaPlataforma("toString")).toBeNull(); // chave herdada de Object não é plataforma
    expect(verNaPlataforma("metaculus")).toBe("Ver na fonte");
  });

  it("volume do Manifold é mana, nunca dólar", () => {
    expect(volumeNaMoeda(898_000, "manifold")).toBe("898 mil mana");
    expect(volumeNaMoeda(898_000, "manifold")).not.toMatch(/US\$/);
    expect(volumeNaMoeda(898_000, "polymarket")).toMatch(/^US\$ /);
    expect(volumeNaMoeda(undefined, "manifold")).toBe("—");
  });

  it("só Polymarket e Kalshi negociam dinheiro real", () => {
    expect(negociaDinheiroReal("polymarket")).toBe(true);
    expect(negociaDinheiroReal("kalshi")).toBe(true);
    expect(negociaDinheiroReal("manifold")).toBe(false);
    expect(negociaDinheiroReal("reddit")).toBe(false);
  });
});

describe("ninguém volta a deduzir Polymarket por exclusão", () => {
  const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
  const semComentarios = (t: string) =>
    t.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
  function fontes(dir: string, saida: string[] = []): string[] {
    for (const nome of readdirSync(dir)) {
      if (nome === "node_modules" || nome.startsWith(".")) continue;
      const caminho = join(dir, nome);
      if (statSync(caminho).isDirectory()) { fontes(caminho, saida); continue; }
      if (/\.tsx?$/.test(nome) && !/\.test\.tsx?$/.test(nome)) saida.push(caminho);
    }
    return saida;
  }

  it("não existe `=== \"kalshi\" ? \"Kalshi\" : \"Polymarket\"` no código", () => {
    const achados: string[] = [];
    for (const dir of ["server", "client/src", "shared"]) {
      for (const f of fontes(join(RAIZ, dir))) {
        const texto = semComentarios(readFileSync(f, "utf-8"));
        if (/===\s*"kalshi"\s*\?\s*"Kalshi"\s*:\s*"Polymarket"/.test(texto)) achados.push(relative(RAIZ, f));
      }
    }
    expect(achados).toEqual([]);
  });
});
