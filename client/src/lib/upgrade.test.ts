// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { maybeUpgrade, openUpgrade, type UpgradeDetail } from "./upgrade.ts";

// Response dublê: maybeUpgrade só usa res.status e res.clone().json().
function fakeRes(status: number, body: unknown, opts: { nonJson?: boolean } = {}): Response {
  return {
    status,
    clone: () => ({
      json: async () => {
        if (opts.nonJson) throw new Error("corpo não-JSON");
        return body;
      },
    }),
  } as unknown as Response;
}

let captured: UpgradeDetail[] = [];
const handler = (e: Event) => { captured.push((e as CustomEvent<UpgradeDetail>).detail); };

beforeEach(() => { captured = []; window.addEventListener("jlb:upgrade", handler); });
afterEach(() => { window.removeEventListener("jlb:upgrade", handler); });

describe("maybeUpgrade — distingue cota esgotada de rate-limit puro", () => {
  it("resposta não-429 → false e nenhum paywall", async () => {
    expect(await maybeUpgrade(fakeRes(200, {}))).toBe(false);
    expect(captured).toHaveLength(0);
  });

  it("429 credits_exhausted → true e abre o paywall com used/limit", async () => {
    const opened = await maybeUpgrade(fakeRes(429, { error: "credits_exhausted", used: 30, limit: 30 }));
    expect(opened).toBe(true);
    expect(captured).toEqual([{ reason: "credits", used: 30, limit: 30 }]);
  });

  it("429 de rajada (rate_limited) → false e NÃO abre paywall", async () => {
    expect(await maybeUpgrade(fakeRes(429, { error: "rate_limited" }))).toBe(false);
    expect(captured).toHaveLength(0);
  });

  it("429 com corpo não-JSON → false (trata como rate-limit, não quebra)", async () => {
    expect(await maybeUpgrade(fakeRes(429, null, { nonJson: true }))).toBe(false);
    expect(captured).toHaveLength(0);
  });
});

describe("openUpgrade — gatilho manual do paywall", () => {
  it("dispara jlb:upgrade com o detalhe informado", () => {
    openUpgrade({ reason: "manual" });
    expect(captured).toEqual([{ reason: "manual" }]);
  });

  it("sem argumento, o detalhe padrão é 'manual'", () => {
    openUpgrade();
    expect(captured).toEqual([{ reason: "manual" }]);
  });
});
