import { describe, it, expect } from "vitest";
import { pruneEvents, breakdown, recordSecurityEvent, securitySummary, isBanned, type StampedEvent } from "./security.ts";

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

describe("auto-ban (resposta) — bloqueio automático", () => {
  it("IP desconhecido não está bloqueado", () => {
    expect(isBanned("8.8.8.8")).toBe(false);
  });
  it("cruzar o limiar de ban (40 eventos) BLOQUEIA o IP", () => {
    const ip = "198.51.100.5";
    for (let i = 0; i < 45; i++) recordSecurityEvent("rate_limit", ip);
    expect(isBanned(ip)).toBe(true);
    expect(securitySummary().bannedIps).toBeGreaterThanOrEqual(1);
  });
  it("o bloqueio AUTO-EXPIRA após a janela (15min)", () => {
    const ip = "198.51.100.6";
    for (let i = 0; i < 45; i++) recordSecurityEvent("auth_fail", ip);
    expect(isBanned(ip)).toBe(true);
    expect(isBanned(ip, Date.now() + 20 * 60_000)).toBe(false); // 20min depois → liberado
  });
});
