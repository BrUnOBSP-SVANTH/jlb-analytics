import { describe, it, expect } from "vitest";
import { emailValido } from "./listaDeEspera.ts";

describe("emailValido — o que entra na lista de espera", () => {
  it("aceita e-mail comum, com espaço em volta", () => {
    expect(emailValido("pessoa@exemplo.com.br")).toBe(true);
    expect(emailValido("  pessoa@exemplo.com  ")).toBe(true);
  });

  it("recusa o que não é endereço", () => {
    for (const v of ["", "pessoa", "pessoa@", "@exemplo.com", "pessoa@exemplo", "a b@c.com", 42, null, undefined]) {
      expect(emailValido(v)).toBe(false);
    }
  });

  it("recusa endereço absurdamente longo (o limite do padrão é 254)", () => {
    expect(emailValido("a".repeat(250) + "@x.com")).toBe(false);
  });
});
