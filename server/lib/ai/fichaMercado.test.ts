import { describe, it, expect } from "vitest";
import { montarFicha } from "./fichaMercado.ts";

/**
 * A garantia central: a ficha NUNCA sai vazia.
 *
 * Sem Supabase configurado (como aqui), o histórico da categoria não vem — que é
 * exatamente o pior cenário de produção: banco fora do ar, categoria nova, ou
 * mercado obscuro. Mesmo assim tem que sobrar conteúdo verdadeiro, porque é isso
 * que impede a análise de sair em branco.
 */
describe("ficha do mercado — o piso que nunca pode faltar", () => {
  it("só com o preço, já diz algo concreto", async () => {
    const f = await montarFicha({ titulo: "Qualquer", precoPct: 73, categoria: "zzz", plataforma: "Kalshi" });
    expect(f.length).toBeGreaterThan(80);
    expect(f).toMatch(/73%/);
  });

  it("traduz o preço em dinheiro nos DOIS lados", async () => {
    // 25% paga 4× (100 ÷ 0,25); o outro lado, 75%, paga ~1,33×. Mostrar os dois
    // é o que ensina que o lado impopular paga mais.
    const f = await montarFicha({ titulo: "X", precoPct: 25, categoria: "zzz", plataforma: "Polymarket" });
    expect(f).toMatch(/400\.00/);
    expect(f).toMatch(/133\.33/);
  });

  it("o relógio muda o recado conforme o prazo", async () => {
    const base = { titulo: "X", precoPct: 50, categoria: "zzz", plataforma: "Kalshi" };
    const horas = new Date(Date.now() + 20 * 3600_000).toISOString();
    const meses = new Date(Date.now() + 200 * 86_400_000).toISOString();
    expect(await montarFicha({ ...base, fechaEm: horas })).toMatch(/última hora/);
    expect(await montarFicha({ ...base, fechaEm: meses })).toMatch(/prazo longo/);
  });

  it("data de fechamento inválida ou no passado não vira linha torta", async () => {
    const base = { titulo: "X", precoPct: 50, categoria: "zzz", plataforma: "Kalshi" };
    for (const fechaEm of ["data-invalida", new Date(Date.now() - 86_400_000).toISOString(), null]) {
      const f = await montarFicha({ ...base, fechaEm });
      expect(f).not.toMatch(/RELÓGIO/);
      expect(f.length).toBeGreaterThan(80); // e ainda assim não fica vazia
    }
  });

  it("volume alto e baixo recebem leituras opostas", async () => {
    const base = { titulo: "X", precoPct: 50, categoria: "zzz", plataforma: "Kalshi" };
    expect(await montarFicha({ ...base, volume: 2_000_000 })).toMatch(/Volume alto/);
    expect(await montarFicha({ ...base, volume: 900 })).toMatch(/Volume baixo/);
    // Volume zero é ausência de dado, não "volume baixo" — não inventa leitura.
    expect(await montarFicha({ ...base, volume: 0 })).not.toMatch(/LIQUIDEZ/);
  });

  it("a trajetória entra quando existe, e não faz falta quando não existe", async () => {
    const base = { titulo: "X", precoPct: 50, categoria: "zzz", plataforma: "Kalshi" };
    expect(await montarFicha({ ...base, trajetoria: "TRAJETÓRIA: de 30% → 60%" })).toMatch(/30% → 60%/);
    expect(await montarFicha(base)).not.toMatch(/TRAJETÓRIA/);
  });
});
