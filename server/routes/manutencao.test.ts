/**
 * As portas de manutenção ficam FECHADAS para quem não tem a chave de serviço.
 *
 * Quatro rotas gastam recurso do site quando chamadas: gravam no banco ou
 * consomem a cota de IA. Todas já foram públicas em algum momento — a de
 * snapshots até 16/09, as duas de IA até 19/09 (`embed-cerebro` deixava
 * qualquer IP gastar 1.200 embeddings por minuto contra um teto de 1.000 por
 * dia). Este teste sobe os routers de verdade e bate em cada porta sem a chave.
 *
 * Só o caminho FECHADO é testado: o aberto chamaria Gemini e Polymarket.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import type { Server } from "node:http";

let server: Server;
let base = "";
const CHAVE_ANTES = process.env.SUPABASE_SERVICE_KEY;

beforeAll(async () => {
  process.env.SUPABASE_SERVICE_KEY = "chave-de-teste-123";
  const { default: aiRouter } = await import("./ai.ts");
  const { default: snapshotsRouter } = await import("./snapshots.ts");
  const app = express();
  app.use(express.json());
  app.use("/api/ai", aiRouter);
  app.use("/api/snapshots", snapshotsRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address();
      base = `http://localhost:${typeof addr === "object" && addr ? addr.port : 0}`;
      resolve();
    });
  });
});

afterAll(() => new Promise<void>((resolve) => {
  if (CHAVE_ANTES === undefined) delete process.env.SUPABASE_SERVICE_KEY;
  else process.env.SUPABASE_SERVICE_KEY = CHAVE_ANTES;
  server.close(() => resolve());
}));

const PORTAS = [
  "/api/ai/embed-cerebro",
  "/api/ai/seed-forecasts",
  "/api/snapshots/seed",
  "/api/snapshots/trigger",
];

async function post(caminho: string, autorizacao?: string) {
  const r = await fetch(`${base}${caminho}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(autorizacao ? { Authorization: autorizacao } : {}) },
    body: "{}",
  });
  return r.status;
}

describe("portas de manutenção — sem a chave de serviço, nada acontece", () => {
  for (const porta of PORTAS) {
    it(`${porta} recusa quem não se identifica`, async () => {
      expect(await post(porta)).toBe(401);
    });

    it(`${porta} recusa chave errada`, async () => {
      expect(await post(porta, "Bearer chave-de-teste-124")).toBe(401);
    });
  }
});
