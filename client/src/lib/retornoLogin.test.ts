import { describe, it, expect } from "vitest";
import { destinoAposLoginSocial } from "./retornoLogin";

describe("destinoAposLoginSocial — terminar o caminho de quem voltou do Google", () => {
  it("o caso de 16/09: token na raiz leva ao dashboard", () => {
    expect(destinoAposLoginSocial("#access_token=eyJ.abc&expires_in=3600&token_type=bearer", "/")).toBe("/dashboard");
    expect(destinoAposLoginSocial("#expires_in=3600&access_token=eyJ.abc", "/")).toBe("/dashboard");
  });

  it("se a volta já caiu no lugar certo, não mexe", () => {
    expect(destinoAposLoginSocial("#access_token=eyJ.abc", "/dashboard")).toBeNull();
    expect(destinoAposLoginSocial("#access_token=eyJ.abc", "/mercados")).toBeNull();
  });

  it("recuperação de senha tem tela própria", () => {
    expect(destinoAposLoginSocial("#access_token=eyJ.abc&type=recovery", "/")).toBeNull();
  });

  it("sem token de login no endereço, nada acontece", () => {
    expect(destinoAposLoginSocial("", "/")).toBeNull();
    expect(destinoAposLoginSocial("#secao-precos", "/")).toBeNull();
    expect(destinoAposLoginSocial("#not_access_token=x", "/")).toBeNull();
  });
});
