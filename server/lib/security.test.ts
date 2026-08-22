import { describe, it, expect } from "vitest";
import { pruneEvents, breakdown, recordSecurityEvent, securitySummary, type StampedEvent } from "./security.ts";

describe("pruneEvents — janela deslizante", () => {
  it("descarta eventos fora da janela de 10min", () => {
    const now = 1_000_000_000;
    const events: StampedEvent[] = [
      { t: now - 5_000, type: "rate_limit" },        // dentro
      { t: now - 20 * 60_000, type: "auth_fail" },   // fora (20min)
    ];
    expect(pruneEvents(events, now)).toHaveLength(1);
    expect(pruneEvents(events, now)[0].type).toBe("rate_limit");
  });
});

describe("breakdown — contagem por tipo", () => {
  it("agrupa por tipo de evento", () => {
    const events: StampedEvent[] = [
      { t: 1, type: "rate_limit" }, { t: 2, type: "rate_limit" }, { t: 3, type: "auth_fail" },
    ];
    expect(breakdown(events)).toEqual({ rate_limit: 2, auth_fail: 1 });
  });
});

describe("recordSecurityEvent + securitySummary — detecção de abuso", () => {
  it("IP abaixo do limiar NÃO é sinalizado", () => {
    for (let i = 0; i < 5; i++) recordSecurityEvent("rate_limit", "10.0.0.1");
    expect(securitySummary().suspicious.find((s) => s.ip === "10.0.0.1")).toBeUndefined();
  });
  it("IP acima do limiar (20 eventos/10min) vira SUSPEITO, com breakdown", () => {
    for (let i = 0; i < 22; i++) recordSecurityEvent("auth_fail", "203.0.113.7");
    const s = securitySummary().suspicious.find((x) => x.ip === "203.0.113.7");
    expect(s).toBeDefined();
    expect(s!.count).toBeGreaterThanOrEqual(20);
    expect(s!.types.auth_fail).toBeGreaterThanOrEqual(20);
  });
});
