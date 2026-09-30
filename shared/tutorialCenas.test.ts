import { describe, it, expect } from "vitest";
import {
  CAPITULOS_TUTORIAL,
  DURACAO_TOTAL_SEGUNDOS,
  formatarTempo,
  capituloPorSegundo,
} from "./tutorialCenas";
import { rotaExiste, destinoDoApelido } from "./rotas";

describe("shared/tutorialCenas", () => {
  it("tem 8 capítulos cobrindo a duração total de forma contínua", () => {
    expect(CAPITULOS_TUTORIAL).toHaveLength(8);
    expect(CAPITULOS_TUTORIAL[0].inicioSegundos).toBe(0);
    expect(CAPITULOS_TUTORIAL[CAPITULOS_TUTORIAL.length - 1].fimSegundos).toBe(DURACAO_TOTAL_SEGUNDOS);

    for (let i = 0; i < CAPITULOS_TUTORIAL.length - 1; i++) {
      expect(
        CAPITULOS_TUTORIAL[i].fimSegundos,
        `Capítulo ${CAPITULOS_TUTORIAL[i].id} deve terminar onde o próximo começa`
      ).toBe(CAPITULOS_TUTORIAL[i + 1].inicioSegundos);
    }
  });

  it("todas as rotas dos capítulos existem e não são apelidos mortos", () => {
    for (const cap of CAPITULOS_TUTORIAL) {
      expect(rotaExiste(cap.rota), `Rota ${cap.rota} deve existir`).toBe(true);
      expect(destinoDoApelido(cap.rota), `Rota ${cap.rota} não pode ser redirecionamento`).toBeNull();
    }
  });

  it("formata minutos e segundos corretamente", () => {
    expect(formatarTempo(0)).toBe("00:00");
    expect(formatarTempo(22)).toBe("00:22");
    expect(formatarTempo(69)).toBe("01:09");
    expect(formatarTempo(215)).toBe("03:35");
  });

  it("localiza o capítulo ativo a partir de um segundo do vídeo", () => {
    expect(capituloPorSegundo(10).id).toBe("abertura");
    expect(capituloPorSegundo(22).id).toBe("mercados");
    expect(capituloPorSegundo(50).id).toBe("mercado-detalhe");
    expect(capituloPorSegundo(100).id).toBe("analise-ia");
    expect(capituloPorSegundo(120).id).toBe("calculadoras");
    expect(capituloPorSegundo(150).id).toBe("simulador");
    expect(capituloPorSegundo(180).id).toBe("banca");
    expect(capituloPorSegundo(200).id).toBe("fecho");
  });
});

