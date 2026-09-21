import { describe, it, expect } from "vitest";
import { emailCanonico, identidadeDaCota, ehEmailDescartavel } from "./identidadeCota.ts";

describe("emailCanonico — a caixa que de fato recebe", () => {
  it("Gmail: pontos e +etiqueta caem na MESMA caixa", () => {
    const a = emailCanonico("joao.silva+teste1@gmail.com");
    expect(a).toBe("joaosilva@gmail.com");
    expect(emailCanonico("J.O.A.O.SILVA+2@Gmail.com")).toBe(a);
    expect(emailCanonico("joaosilva@googlemail.com")).toBe(a);
  });

  it("outros provedores: +etiqueta sai, ponto FICA (lá ele muda a caixa)", () => {
    expect(emailCanonico("maria.souza+jlb@outlook.com")).toBe("maria.souza@outlook.com");
    expect(emailCanonico("maria.souza@outlook.com")).not.toBe(emailCanonico("mariasouza@outlook.com"));
  });

  it("o que não é e-mail vira null", () => {
    expect(emailCanonico("")).toBeNull();
    expect(emailCanonico("sem-arroba")).toBeNull();
    expect(emailCanonico("@gmail.com")).toBeNull();
    expect(emailCanonico("+tag@gmail.com")).toBeNull();
    expect(emailCanonico(undefined)).toBeNull();
  });
});

describe("identidadeDaCota — hash, nunca o e-mail", () => {
  it("apelidos da mesma caixa dão a MESMA identidade", () => {
    expect(identidadeDaCota("ana+1@gmail.com")).toBe(identidadeDaCota("a.n.a@gmail.com"));
  });

  it("caixas diferentes, identidades diferentes", () => {
    expect(identidadeDaCota("ana@gmail.com")).not.toBe(identidadeDaCota("ana@outlook.com"));
  });

  it("o que vai para o banco não contém o e-mail", () => {
    const id = identidadeDaCota("ana@gmail.com")!;
    expect(id).toMatch(/^[0-9a-f]{64}$/);
    expect(id).not.toContain("ana");
  });
});

describe("ehEmailDescartavel — e-mail de 10 minutos não usa a IA", () => {
  it("serviços temporários conhecidos", () => {
    expect(ehEmailDescartavel("x@mailinator.com")).toBe(true);
    expect(ehEmailDescartavel("x@10minutemail.com")).toBe(true);
    expect(ehEmailDescartavel("x@guerrillamail.com")).toBe(true);
  });

  it("subdomínio de serviço temporário também", () => {
    expect(ehEmailDescartavel("x@qualquer.mailinator.com")).toBe(true);
  });

  it("os provedores de verdade do Brasil passam", () => {
    for (const d of ["gmail.com", "outlook.com", "hotmail.com", "yahoo.com.br", "uol.com.br", "bol.com.br", "icloud.com", "terra.com.br"]) {
      expect(ehEmailDescartavel(`pessoa@${d}`), d).toBe(false);
    }
  });
});
