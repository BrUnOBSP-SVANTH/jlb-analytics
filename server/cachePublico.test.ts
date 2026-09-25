import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const index = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "index.ts"), "utf-8");

/**
 * DES-01 — nenhum GET do site mandava `Cache-Control`. Medido em 24/09:
 * /api/polymarket/markets (237 KB), /api/kalshi/markets (168 KB),
 * /api/ai/divergences e /api/health/data, todos sem o cabeçalho. Cada visita e
 * cada F5 atravessava até o Node para devolver a mesma resposta, num plano com
 * 0,1 CPU.
 *
 * 🔴 O RISCO DO CONSERTO É MAIOR QUE O PROBLEMA. `public` autoriza qualquer
 * cache no caminho — navegador, CDN, proxy — a guardar a resposta e reentregá-la
 * a OUTRA pessoa. Numa rota que varia por usuário, isso é vazamento de dado
 * entre contas: a cota de IA de alguém, os duelos de alguém, a conta de alguém.
 *
 * Este teste existe para que a lista nunca cresça para o lado errado.
 */
function listaPublica(): RegExp[] {
  const bloco = index.slice(index.indexOf("const GET_PUBLICO = ["), index.indexOf("];", index.indexOf("const GET_PUBLICO = [")));
  const fontes = Array.from(bloco.matchAll(/\/\^([^,]+?)\/,/g), (m) => m[1]);
  expect(fontes.length, "não achei os padrões da lista").toBeGreaterThan(3);
  return fontes.map((f) => new RegExp("^" + f));
}

describe("cache público só para o que é igual para todo mundo", () => {
  const publicas = listaPublica();
  const casa = (caminho: string) => publicas.some((r) => r.test(caminho));

  it("🔴 nenhuma rota que depende de QUEM pergunta entra na lista", () => {
    const privadas = [
      "/api/ai/credits",
      "/api/ai/chat",
      "/api/ai/chat/stream",
      "/api/ai/chat/feedback",
      "/api/ai/analyze",
      "/api/ai/user-calibration-history",
      "/api/ai/weekly-digest",
      "/api/conta/minha-conta",
      "/api/conta/senha-vazada",
      "/api/duels/open",
      "/api/duels/ranking",
      "/api/settlements/resolver",
      "/api/stripe/checkout",
      "/api/stripe/portal",
      "/api/push/subscribe",
      "/api/engine/forecast",
      "/api/track",
      "/api/lista-de-espera",
    ];
    const vazando = privadas.filter(casa);
    expect(vazando).toEqual([]);
  });

  it("o catálogo e o que o alimenta continuam cacheados", () => {
    // Se a lista encolher sem querer, o ganho some sem ninguém notar — o
    // sintoma seria só "o site ficou lento de novo".
    for (const rota of [
      "/api/polymarket/markets",
      "/api/kalshi/markets",
      "/api/manifold/markets",
      "/api/mercados/destaques",
      "/api/ai/divergences",
      "/api/health/data",
      "/api/snapshots/history/polymarket/123",
      "/api/polymarket/regra/3919953",
    ]) {
      expect(casa(rota), rota).toBe(true);
    }
  });

  it("⚠️ o cabeçalho serve dado velho enquanto atualiza", () => {
    // `stale-while-revalidate` é o que transforma cache em velocidade sem
    // transformar em dado parado: 30s de frescor e mais 120s em que a resposta
    // velha sai na hora enquanto a nova é buscada atrás.
    expect(index).toMatch(/public, max-age=30, stale-while-revalidate=120/);
  });
});
