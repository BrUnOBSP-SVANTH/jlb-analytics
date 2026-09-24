import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { nomeDaSerie, formatVolume } from "./utils.ts";

const AQUI = dirname(fileURLToPath(import.meta.url));

describe("o gráfico diz de quem é a linha", () => {
  /**
   * UXP-02. O tooltip era a string fixa "Prob SIM". Num mercado de 12 desfechos
   * ("Democratic Presidential Nominee 2028") a série de reserva vem de
   * `clobTokenIds[0]` — o PRIMEIRO desfecho. A tela desenhava a linha de um
   * candidato e a chamava de "SIM", o que faz o leitor entender que o mercado
   * inteiro está naquele número.
   */
  it("🔴 mercado de vários desfechos não tem 'SIM' — tem nome", () => {
    expect(nomeDaSerie([{ label: "Alexandria Ocasio-Cortez" }, { label: "Jon Ossoff" }]))
      .toBe("Alexandria Ocasio-Cortez");
  });

  it("mercado binário continua sendo SIM", () => {
    expect(nomeDaSerie([{ label: "Yes" }])).toBe("SIM");
    expect(nomeDaSerie(undefined)).toBe("SIM");
    expect(nomeDaSerie(null)).toBe("SIM");
    expect(nomeDaSerie([])).toBe("SIM");
  });

  it("rótulo vazio não vira linha sem nome", () => {
    expect(nomeDaSerie([{ label: "   " }, { label: "Outro" }])).toBe("Desfecho");
  });
});

describe("volume sai na unidade da fonte", () => {
  it("🔴 Kalshi conta contrato, Polymarket conta dólar", () => {
    // O detalhe do UXP-02 que mais engana: `volume_fp` do Kalshi é contagem de
    // contratos, e nós escrevíamos "US$" na frente.
    expect(formatVolume(1_497, "kalshi")).toBe("1,5 mil contratos");
    expect(formatVolume(1_497, "polymarket")).toBe("US$ 1,5 mil");
  });
});

describe("o eixo do tempo é tempo, não fila de rótulos", () => {
  /**
   * UXP-02. O eixo usava a data JÁ FORMATADA como categoria, então todo
   * intervalo virava um passo do mesmo tamanho. Medido em 24/09, com a série de
   * teste que reproduz o pior buraco do arquivo de produção (60 dias sem
   * coleta): no eixo antigo, "30 de jun → 30 de ago" ocupava 102px — o MESMO
   * que "25 de jun → 26 de jun". A falha de coleta era desenhada como um dia
   * comum, e a linha mostrava uma escalada onde houve silêncio.
   *
   * Não é caso de laboratório: das 5.236 séries longas o bastante para serem
   * desenhadas, 557 têm buraco maior que 3 dias e 360 maior que 10.
   */
  const pagina = readFileSync(join(AQUI, "../../pages/MarketDetail.tsx"), "utf-8");
  const eixo = pagina.slice(pagina.indexOf("<XAxis"), pagina.indexOf("<YAxis"));

  it("🔴 o eixo X é numérico e em escala de tempo", () => {
    expect(eixo).toMatch(/dataKey="t"/);
    expect(eixo).toMatch(/type="number"/);
    expect(eixo).toMatch(/scale="time"/);
    expect(eixo).toMatch(/domain=\{\["dataMin", "dataMax"\]\}/);
    // A data formatada volta como RÓTULO do tick, não como chave do dado.
    expect(eixo).toMatch(/tickFormatter/);
  });

  it("o ponto do gráfico carrega o instante, não o texto da data", () => {
    const hook = readFileSync(join(AQUI, "../../hooks/useMarketDetail.ts"), "utf-8");
    const monta = hook.slice(hook.indexOf("const chartData ="), hook.indexOf("const nomeDaLinha"));
    expect(monta).toMatch(/t:\s*pt\.t \* 1000/);
    expect(monta).not.toMatch(/toLocaleDateString/);
  });
});
