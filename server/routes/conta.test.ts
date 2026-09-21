/**
 * /api/conta/dominio-temporario — o aviso do cadastro. Sobe o router num
 * Express efêmero (mesmo padrão de levels.test.ts).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import type { Server } from "node:http";
import contaRouter from "./conta.ts";

let server: Server;
let base = "";

beforeAll(async () => {
  const app = express();
  app.use("/api/conta", contaRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address();
      base = `http://localhost:${typeof addr === "object" && addr ? addr.port : 0}`;
      resolve();
    });
  });
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

async function perguntar(dominio: string) {
  const r = await fetch(`${base}/api/conta/dominio-temporario?dominio=${encodeURIComponent(dominio)}`);
  return { status: r.status, corpo: (await r.json()) as { temporario?: boolean } };
}

describe("dominio-temporario — aviso ANTES do cadastro", () => {
  it("serviço de e-mail temporário: avisa", async () => {
    expect(await perguntar("mailinator.com")).toEqual({ status: 200, corpo: { temporario: true } });
  });

  it("provedor de verdade: não avisa", async () => {
    expect(await perguntar("gmail.com")).toEqual({ status: 200, corpo: { temporario: false } });
    expect(await perguntar("uol.com.br")).toEqual({ status: 200, corpo: { temporario: false } });
  });

  it("recusa e-mail inteiro — a rota só aceita o domínio, para o endereço não parar em log", async () => {
    expect((await perguntar("ana@gmail.com")).status).toBe(400);
  });

  it("lixo não é domínio", async () => {
    expect((await perguntar("")).status).toBe(400);
    expect((await perguntar("sem-ponto")).status).toBe(400);
  });
});
