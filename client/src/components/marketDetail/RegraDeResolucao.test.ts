import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const componente = readFileSync(join(AQUI, "RegraDeResolucao.tsx"), "utf-8");

/**
 * Sem comentários, para as asserções NEGATIVAS falarem do código.
 * O cabeçalho deste componente explica por que a regra não é traduzida — e a
 * palavra "traduz" no comentário fazia o teste de "não traduz" falhar. Já
 * aconteceu três vezes nesta auditoria; o remédio é sempre este.
 */
const codigo = componente
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
  .replace(/^\s*\/\/.*$/gm, "");
const poly = readFileSync(join(AQUI, "../../../../server/routes/polymarket.ts"), "utf-8");
const kalshi = readFileSync(join(AQUI, "../../../../server/routes/kalshi.ts"), "utf-8");

/**
 * UXP-02 — a tela mostrava preço, prazo, volume, histórico e análise de IA, e
 * não mostrava o que DECIDE o resultado. A regra de resolução é o que separa a
 * aposta que a pessoa acha que está fazendo da que existe.
 */
describe("a regra vem da plataforma e continua sendo da plataforma", () => {
  it("🔴 o texto não passa pelo tradutor", () => {
    // É ele que vale na liquidação. Tradução automática de cláusula é onde um
    // "if" vira "quando" e muda o que a pessoa entende que comprou. Além disso
    // são 600 a 2.000 caracteres por mercado: mandar isso para a cadeia de IA
    // queimaria o teto diário que o SEG-06 acabou de proteger.
    // A asserção olha a CHAMADA, não a palavra: a tela diz em português que
    // não traduz, e prender o texto faria o teste falhar por uma frase correta.
    expect(codigo).not.toMatch(/\/api\/translate|traduzirLote|traducoes/i);
  });

  it("⚠️ o bloco é marcado como texto externo", () => {
    // Não é decoração: o detector de número do TXT-01 (scripts/varredura-telas)
    // pula o que está sob `data-fonte="externa"`. Sem a marca, a primeira regra
    // que citar "$30.5" faria a varredura acusar a própria fonte de escrever
    // número fora do padrão brasileiro.
    expect(componente).toMatch(/data-fonte="externa"/);
  });

  it("sem regra publicada, a seção não existe — não vira caixa vazia", () => {
    expect(componente).toMatch(/if \(!dado\?\.regra\) return null;/);
  });

  it("usa buscarJson, não fetch cru", () => {
    // Regra da casa: `/api` só por `apiFetch`/`buscarJson`.
    expect(componente).toMatch(/buscarJson</);
    expect(codigo).not.toMatch(/[^a-zA-Z]fetch\(/);
  });
});

describe("os endpoints separam 'não tem' de 'não respondeu'", () => {
  const rota = poly.slice(poly.indexOf('router.get("/regra/:id"'), poly.indexOf('router.get("/market/:id"'));

  it("🔴 404 da fonte devolve regra nula, não erro", () => {
    // Mercado que não existe mais é resposta, não falha. Virar 502 encheria o
    // console de erro em toda tela de mercado antigo — e ruído de erro é como
    // erro de verdade deixa de ser visto.
    expect(rota).toMatch(/HTTP 404/);
    expect(rota).toMatch(/res\.json\(\{ regra: regra \|\| null/);
  });

  it("a resposta é cacheada: a regra não muda durante a visita", () => {
    // 900s. Sem cache, cada abertura de mercado vira uma ida à plataforma — e o
    // plano do Render tem 0,1 CPU.
    expect(rota).toMatch(/swr</);
    expect(rota).toMatch(/poly:regra:/);
    expect(kalshi).toMatch(/kalshi:regra:/);
  });

  it("o Kalshi devolve as DUAS metades da regra", () => {
    // A secundária é a que trata de adiamento e cancelamento — justamente a
    // parte que decide o dinheiro quando o mundo não colabora.
    expect(kalshi).toMatch(/rules_primary/);
    expect(kalshi).toMatch(/regraSecundaria/);
    expect(componente).toMatch(/regraSecundaria/);
  });
});
