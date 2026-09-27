import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { COR_DA_PROBABILIDADE, BARRA_DA_PROBABILIDADE, corDoMovimento } from "./corDeProbabilidade";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("cor da probabilidade", () => {
  it("nível não é julgamento: nenhuma faixa vira verde ou vermelho", () => {
    // 5%, 30%, 50%, 70% e 95% pintam todos igual. É o ponto inteiro do módulo.
    expect(COR_DA_PROBABILIDADE).toBe("text-dado");
    expect(BARRA_DA_PROBABILIDADE).toBe("bg-dado");
  });

  it("movimento continua com direção — é aí que verde e vermelho significam algo", () => {
    expect(corDoMovimento("up")).toBe("text-positive");
    expect(corDoMovimento("down")).toBe("text-negative");
    expect(corDoMovimento(null)).toBe(COR_DA_PROBABILIDADE);
    expect(corDoMovimento(undefined)).toBe(COR_DA_PROBABILIDADE);
  });
});

/**
 * A guarda que importa: a regra voltar escrita à mão em algum card.
 *
 * Ela nasceu copiada oito vezes, e código copiado volta por cópia. Um teste que
 * só chamasse a função acima ficaria verde para sempre enquanto um componente
 * novo trouxesse de volta o `pct >= 70 ? "text-positive"`.
 */
describe("a regra não volta escrita à mão", () => {
  const arquivos = [
    "components/mercados/cards.tsx",
    "components/mercados/ComparePanel.tsx",
    "components/mercados/TrendingCard.tsx",
    "components/noticias/MarketCard.tsx",
    "components/dashboard/WatchlistSection.tsx",
    "pages/Briefing.tsx",
  ];

  for (const rel of arquivos) {
    it(`${rel} não colore probabilidade por faixa`, () => {
      // Sem comentários: o comentário que EXPLICA o defeito cita a regra, e
      // é a sexta vez nesta base que uma asserção negativa acusa a própria
      // documentação.
      const fonte = readFileSync(join(raiz, rel), "utf-8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      // A distinção que este teste precisa fazer é entre NÍVEL e DIREÇÃO, e ela
      // está no que a linha compara:
      //
      //   `edge > 3`, `delta > 0`, `weekPriceChange > 0`  → direção. Correto:
      //       cruzam o ZERO, e aí verde e vermelho dizem para que lado foi;
      //   `pct >= 70`, `leaderPct >= 50`                  → nível. Errado:
      //       cortam a escala 0–100 num ponto arbitrário e chamam um pedaço de
      //       bom e outro de ruim.
      //
      // Por isso a busca é por VARIÁVEL de probabilidade comparada a um limiar,
      // e não por qualquer comparação. A primeira versão procurava só `>= 70` e
      // `<= 30` — os dois cortes que eu já tinha visto — e ficou verde enquanto
      // a captura de tela mostrava números ainda verdes, porque
      // `MultiOutcomePills` usava um terceiro corte, `leaderPct >= 50`.
      const suspeitas = fonte
        .split(/\r?\n/)
        .filter((l) => /\b\w*(pct|Pct|prob|Prob)\w*\s*[<>]=?\s*\d/.test(l) && /(positive|negative)/.test(l));
      expect(suspeitas, `linhas: ${suspeitas.join(" | ")}`).toEqual([]);
    });
  }
});
