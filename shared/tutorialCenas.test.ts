import { describe, it, expect } from "vitest";
import { FILMES_TUTORIAL, formatarTempo, capituloPorSegundo, urlDoVideo, VIDEO_BASE } from "./tutorialCenas";
import { rotaExiste, destinoDoApelido } from "./rotas";

/**
 * O índice é GERADO na gravação (scripts/indiceDoTutorial.mjs). Até 01/10/2026
 * este teste prendia a cópia à mão — "tem 8 capítulos", "termina em 215s" —, e
 * era isso que mantinha os tempos chutados no lugar. Os invariantes que importam
 * continuam, agora para cada filme gravado.
 */
describe("o índice dos vídeos de ajuda", () => {
  it("cada filme gravado cobre a própria duração de forma contínua", () => {
    for (const f of FILMES_TUTORIAL) {
      expect(f.capitulos.length, `${f.id}: sem capítulos`).toBeGreaterThan(0);
      expect(f.capitulos[0].inicioSegundos, `${f.id}: o 1º capítulo não começa no início`).toBeLessThan(1);
      // O último termina no fim do vídeo: é o que deixa a barra de progresso
      // chegar ao fim (antes ela parava em 215s num vídeo de outro tamanho).
      expect(f.capitulos[f.capitulos.length - 1].fimSegundos).toBeCloseTo(f.duracaoSegundos, 0);
      for (let i = 0; i < f.capitulos.length - 1; i++) {
        expect(f.capitulos[i].fimSegundos, `${f.id}/${f.capitulos[i].id} deve terminar onde o próximo começa`)
          .toBe(f.capitulos[i + 1].inicioSegundos);
        expect(f.capitulos[i].fimSegundos, `${f.id}/${f.capitulos[i].id} tem duração zero ou negativa`)
          .toBeGreaterThan(f.capitulos[i].inicioSegundos);
      }
    }
  });

  it("toda rota de capítulo existe e não é apelido que só redireciona", () => {
    for (const f of FILMES_TUTORIAL) {
      for (const cap of f.capitulos) {
        expect(rotaExiste(cap.rota), `${f.id}/${cap.id}: rota ${cap.rota}`).toBe(true);
        expect(destinoDoApelido(cap.rota), `${f.id}/${cap.id}: ${cap.rota} só redireciona`).toBeNull();
      }
    }
  });

  it("a data de gravação é uma data", () => {
    for (const f of FILMES_TUTORIAL) {
      expect(f.gravadoEm, f.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("a URL do vídeo é a do filme", () => {
    for (const f of FILMES_TUTORIAL) {
      expect(urlDoVideo(f, "mp4")).toBe(`${VIDEO_BASE}/${f.id}.mp4`);
    }
  });

  it("formata minutos e segundos", () => {
    expect(formatarTempo(0)).toBe("00:00");
    expect(formatarTempo(22)).toBe("00:22");
    expect(formatarTempo(69.9)).toBe("01:09");
    expect(formatarTempo(215)).toBe("03:35");
    expect(formatarTempo(-3)).toBe("00:00");
  });

  it("localiza o capítulo de um segundo do vídeo — inclusive além do fim", () => {
    const f = {
      id: "x", titulo: "", resumo: "", precisaConta: false, duracaoSegundos: 30, comAudio: false, gravadoEm: "2026-10-01",
      capitulos: [
        { id: "a", titulo: "", rota: "/", inicioSegundos: 0, fimSegundos: 10, narracao: "" },
        { id: "b", titulo: "", rota: "/", inicioSegundos: 10, fimSegundos: 30, narracao: "" },
      ],
    };
    expect(capituloPorSegundo(f, 0).id).toBe("a");
    expect(capituloPorSegundo(f, 9.9).id).toBe("a");
    expect(capituloPorSegundo(f, 10).id).toBe("b");
    // O <video> pode reportar um tempo um pouco além da duração gravada.
    expect(capituloPorSegundo(f, 31).id).toBe("b");
  });
});
