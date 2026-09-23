import { describe, it, expect } from "vitest";
import { passouODoIntervalo, estaAtrasada } from "./tarefas.ts";

const AGORA = new Date("2026-09-23T12:00:00Z").getTime();
const horasAtras = (h: number) => new Date(AGORA - h * 3600_000).toISOString();
const SEIS_HORAS = 6 * 3600_000;

describe("passouODoIntervalo — o deploy não pode redisparar tudo", () => {
  it("🔴 tarefa de 6h que rodou há 1h NÃO roda de novo no boot", () => {
    // O defeito do INF-03: os crons são `setTimeout` a partir do BOOT, e o boot
    // acontece a cada deploy e a cada vez que o plano grátis acorda. A coleta do
    // Cérebro disparava 30s depois de cada subida — e levava 429 do Reddit.
    expect(passouODoIntervalo(horasAtras(1), SEIS_HORAS, AGORA)).toBe(false);
  });

  it("passado o intervalo, roda", () => {
    expect(passouODoIntervalo(horasAtras(6), SEIS_HORAS, AGORA)).toBe(true);
    expect(passouODoIntervalo(horasAtras(7), SEIS_HORAS, AGORA)).toBe(true);
  });

  it("tarefa que nunca rodou roda na hora", () => {
    expect(passouODoIntervalo(null, SEIS_HORAS, AGORA)).toBe(true);
  });

  it("⚠️ data ilegível faz RODAR, não pular", () => {
    // Falha aberta de propósito: pular por engano custa uma rodada; parar de
    // rodar custa o produto, e o sintoma seria só a ausência de dado novo.
    expect(passouODoIntervalo("não é data", SEIS_HORAS, AGORA)).toBe(true);
    expect(passouODoIntervalo("", SEIS_HORAS, AGORA)).toBe(true);
  });
});

describe("estaAtrasada — alarme com folga, para não virar ruído", () => {
  it("6h01 numa tarefa de 6h não é alarme", () => {
    // O plano grátis dorme, o relógio escorrega. Alarme que dispara à toa ensina
    // a ignorar alarme — e aí o de verdade passa batido.
    expect(estaAtrasada(horasAtras(6.1), SEIS_HORAS, AGORA)).toBe(false);
    expect(estaAtrasada(horasAtras(8.9), SEIS_HORAS, AGORA)).toBe(false);
  });

  it("passou de uma vez e meia o intervalo, aí sim", () => {
    expect(estaAtrasada(horasAtras(9.1), SEIS_HORAS, AGORA)).toBe(true);
    expect(estaAtrasada(horasAtras(48), SEIS_HORAS, AGORA)).toBe(true);
  });

  it("tarefa que nunca rodou não é 'atrasada' — é nova", () => {
    expect(estaAtrasada(null, SEIS_HORAS, AGORA)).toBe(false);
  });
});

describe("INF-03 — todo agendamento passa pelo registro", () => {
  it("nenhum `setTimeout`/`setInterval` de tarefa escapa do `agendar`", async () => {
    const fs = await import("node:fs");
    const fonte = fs.readFileSync(new URL("../index.ts", import.meta.url), "utf-8");
    // Pega agendamento que chama direto uma função de tarefa conhecida.
    const escapou = [...fonte.matchAll(/set(?:Timeout|Interval)\(\(\) => \{ void (\w+)\(/g)]
      .map((m) => m[1])
      .filter((nome) => nome !== "agendar" && nome !== "broadcastQuotes" && nome !== "broadcastMarketAlerts");
    expect(escapou, `tarefa agendada fora do controle de intervalo: ${escapou.join(", ")}`).toEqual([]);
  });

  it("cada tarefa agendada declara o próprio intervalo", async () => {
    const fs = await import("node:fs");
    const fonte = fs.readFileSync(new URL("../index.ts", import.meta.url), "utf-8");
    const agendadas = new Set([...fonte.matchAll(/agendar\("([a-z-]+)"/g)].map((m) => m[1]));
    const tabela = fonte.slice(fonte.indexOf("INTERVALO_DA_TAREFA"), fonte.indexOf("function agendar"));
    const semIntervalo = [...agendadas].filter((nome) => !tabela.includes(`"${nome}"`));
    expect(semIntervalo, `sem intervalo declarado: ${semIntervalo.join(", ")}`).toEqual([]);
    expect(agendadas.size).toBeGreaterThan(5);   // âncora: o regex achou mesmo as tarefas
  });
});
