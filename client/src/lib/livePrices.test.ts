import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const CLIENTE = join(AQUI, "..");
const SERVIDOR = join(AQUI, "../../../server");

function arquivos(dir: string, saida: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) arquivos(p, saida);
    else if (/\.tsx?$/.test(e) && !/\.test\.tsx?$/.test(e)) saida.push(p);
  }
  return saida;
}

/**
 * UXP-04 — o site abria mais de uma conexão ao vivo para o MESMO endereço.
 *
 * `lib/livePrices.ts` abria a sua para os preços dos cards e `useMarketAlerts`
 * abria outra para os alertas do sino. Como o sino mora na barra e a barra está
 * em toda tela, as duas ficavam abertas em qualquer página com cards — e a
 * página de mercados, que usa o hook de novo, chegava a QUATRO.
 *
 * Medido em 24/09 em /mercados, contando os sockets que o navegador abriu:
 * antes 4, depois 1.
 *
 * Custa dobrado em três lugares: sockets vivos no plano de 0,1 CPU do Render,
 * cada transmissão enviada várias vezes para a mesma pessoa, e `wsClients.size`
 * contando gente que não existe — num site cuja audiência cabe em duas dezenas,
 * esse número é usado para decidir coisas.
 */
describe("uma conexão ao vivo por navegador", () => {
  it("🔴 só um módulo abre WebSocket no cliente", () => {
    const donos = arquivos(CLIENTE)
      .filter((f) => /new WebSocket\(/.test(readFileSync(f, "utf-8")))
      .map((f) => relative(CLIENTE, f).replace(/\\/g, "/"));
    expect(donos).toEqual(["lib/livePrices.ts"]);
  });

  it("quem precisa de mensagem assina por tipo", () => {
    const fonte = readFileSync(join(CLIENTE, "lib/livePrices.ts"), "utf-8");
    expect(fonte).toMatch(/export function assinarAoVivo/);
    // Cancelar a assinatura tem que devolver a contagem: sem isso a conexão
    // nunca fecha e o "uma só" vira "uma para sempre".
    expect(fonte).toMatch(/refCount--/);
    const hook = readFileSync(join(CLIENTE, "hooks/useMarketAlerts.ts"), "utf-8");
    expect(hook).toMatch(/assinarAoVivo\("market_alerts"/);
  });
});

/**
 * UXP-04 — a frase que explicava o movimento era paga e jogada fora.
 *
 * `generateAlertContext` era chamada sem `await`, e o `broadcast` logo abaixo é
 * síncrono: a frase era escrita num objeto já serializado e enviado. O único
 * caminho para ela chegar era um segundo alerta do MESMO mercado na MESMA
 * probabilidade arredondada dentro de 5 minutos — com ciclo de 90s e gatilho de
 * 3 pp, praticamente nunca.
 *
 * Num projeto em que o teto diário de IA é a restrição mais apertada que existe,
 * o desperdício que não aparece é o pior tipo.
 */
describe("o contexto do alerta chega junto com o alerta", () => {
  const index = readFileSync(join(SERVIDOR, "index.ts"), "utf-8");
  const trecho = index.slice(index.indexOf("const contextCacheKey"), index.indexOf('type: "market_alerts"'));

  it("🔴 a frase é esperada ANTES da transmissão", () => {
    expect(trecho).toMatch(/await generateAlertContext\(/);
    expect(trecho).not.toMatch(/generateAlertContext\([^)]*\)\.then\(/);
  });

  it("⚠️ passa pela cadeia de IA, não direto na Anthropic", () => {
    // A chave da Anthropic está sem crédito: o `fetch` cru falhava em toda
    // tentativa, silenciosamente. `callClaude` cai para Gemini e Groq.
    const funcao = index.slice(index.indexOf("async function generateAlertContext"), index.indexOf("async function broadcastMarketAlerts"));
    expect(funcao).toMatch(/callClaude\(/);
    expect(funcao).not.toMatch(/api\.anthropic\.com/);
  });
});
