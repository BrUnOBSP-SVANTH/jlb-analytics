import { describe, it, expect } from "vitest";
import { parseBody, portfolioBodySchema } from "./schemas.ts";

const validPos = { title: "BTC 100k", source: "polymarket", position: "yes", entryProb: 0.4, betSize: 100, pnl: 12 };

describe("portfolioBodySchema — via parseBody", () => {
  it("aceita um body válido", () => {
    expect(parseBody(portfolioBodySchema, { positions: [validPos] }).ok).toBe(true);
  });

  it("aceita opcionais ausentes (source, currentProb, pnl)", () => {
    const r = parseBody(portfolioBodySchema, { positions: [{ title: "X", position: "no", entryProb: 0.5, betSize: 10 }] });
    expect(r.ok).toBe(true);
  });

  it("rejeita array de posições vazio", () => {
    expect(parseBody(portfolioBodySchema, { positions: [] }).ok).toBe(false);
  });

  it("rejeita posição sem título (o que quebrava .slice em runtime)", () => {
    const r = parseBody(portfolioBodySchema, { positions: [{ ...validPos, title: undefined }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("title");
  });

  it("rejeita betSize não-numérico (o que quebrava .toFixed em runtime)", () => {
    expect(parseBody(portfolioBodySchema, { positions: [{ ...validPos, betSize: "100" }] }).ok).toBe(false);
  });

  it("rejeita body sem positions / nulo", () => {
    expect(parseBody(portfolioBodySchema, {}).ok).toBe(false);
    expect(parseBody(portfolioBodySchema, null).ok).toBe(false);
  });
});
