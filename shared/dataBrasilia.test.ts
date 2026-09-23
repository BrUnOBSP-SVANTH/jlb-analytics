import { describe, it, expect } from "vitest";
import { hojeEmBrasilia, segundosAteVirarODia } from "./dataBrasilia.ts";

describe("hojeEmBrasilia — o dia do produto é o dia daqui", () => {
  it("🔴 às 21h de Brasília ainda é HOJE, não amanhã", () => {
    // O defeito do SEG-02: a chave do briefing usava a data UTC. Às 21h em
    // Brasília já é o dia seguinte em Londres, então o "briefing de hoje"
    // virava outro no meio da noite — e gastava IA de novo.
    const vinteEUmaEmBrasilia = new Date("2026-09-22T23:59:00Z"); // 20h59 em Brasília
    expect(hojeEmBrasilia(vinteEUmaEmBrasilia)).toBe("2026-09-22");
    expect(vinteEUmaEmBrasilia.toISOString().slice(0, 10)).toBe("2026-09-22");

    const jaEhOutroDiaEmLondres = new Date("2026-09-23T02:00:00Z"); // 23h em Brasília
    expect(hojeEmBrasilia(jaEhOutroDiaEmLondres)).toBe("2026-09-22");  // aqui ainda é dia 22
    expect(jaEhOutroDiaEmLondres.toISOString().slice(0, 10)).toBe("2026-09-23");
  });

  it("vira à meia-noite de Brasília, não antes", () => {
    expect(hojeEmBrasilia(new Date("2026-09-23T02:59:59Z"))).toBe("2026-09-22");
    expect(hojeEmBrasilia(new Date("2026-09-23T03:00:00Z"))).toBe("2026-09-23");
  });

  it("de manhã os dois calendários concordam", () => {
    expect(hojeEmBrasilia(new Date("2026-09-22T12:00:00Z"))).toBe("2026-09-22");
  });
});

describe("segundosAteVirarODia — quanto o cache ainda vale", () => {
  it("logo depois da virada, vale quase o dia inteiro", () => {
    const s = segundosAteVirarODia(new Date("2026-09-22T03:00:00Z")); // 00h de Brasília
    expect(s).toBeGreaterThan(86_000);
    expect(s).toBeLessThanOrEqual(86_400);
  });

  it("perto da virada, vale pouco — mas nunca zero", () => {
    // Piso de 60s: sem ele, o briefing seria regerado a cada requisição no
    // último minuto do dia, que é exatamente quando ele menos importa.
    expect(segundosAteVirarODia(new Date("2026-09-23T02:59:59Z"))).toBe(60);
    expect(segundosAteVirarODia(new Date("2026-09-23T02:30:00Z"))).toBe(1800);
  });
});
