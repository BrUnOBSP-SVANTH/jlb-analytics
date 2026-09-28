/**
 * O que este arquivo impede.
 *
 * Um tutorial erra de um jeito silencioso: ninguém reassiste o próprio vídeo.
 * O roteiro manda clicar em "Valor Esperado", a aba passa a se chamar outra
 * coisa, e o vídeo segue no ar ensinando um caminho que não existe — até um
 * visitante desistir e não contar para ninguém.
 *
 * Então as cenas ficam presas ao código de verdade: a rota tem que existir na
 * tabela de `shared/rotas.ts`, e todo alvo de clique, de digitação e de arraste
 * tem que aparecer no `client/src`. Renomeou o botão? `pnpm test` reprova antes
 * de você gastar uma tarde gravando narração para um vídeo errado.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CENAS, roteiroEmMarkdown, segundosDaCena, type Cena } from "./cenasDoTutorial.ts";
import { rotaExiste, destinoDoApelido } from "../shared/rotas.ts";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Todo o código do cliente concatenado — onde os rótulos de tela moram. */
function fonteDoCliente(): string {
  const partes: string[] = [];
  const andar = (dir: string) => {
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      const caminho = join(dir, item.name);
      if (item.isDirectory()) andar(caminho);
      else if (/\.tsx?$/.test(item.name) && !item.name.includes(".test.")) {
        partes.push(readFileSync(caminho, "utf-8"));
      }
    }
  };
  andar(join(RAIZ, "client", "src"));
  return partes.join("\n");
}

const CLIENTE = fonteDoCliente();

describe("as cenas apontam para o site que existe", () => {
  it("toda rota da cena é rota de verdade, e nenhuma é apelido que redireciona", () => {
    for (const cena of CENAS) {
      expect(rotaExiste(cena.rota), `${cena.id}: rota ${cena.rota} não existe`).toBe(true);
      expect(destinoDoApelido(cena.rota), `${cena.id}: ${cena.rota} só redireciona`).toBeNull();
    }
  });

  it("todo alvo de clique, digitação e arraste tem esse texto no client/src", () => {
    for (const cena of CENAS) {
      for (const passo of cena.passos) {
        const alvo =
          passo.acao === "clicar" ? passo.nome :
          passo.acao === "digitar" || passo.acao === "arrastar" ? passo.campo :
          null;
        if (alvo === null) continue;
        expect(CLIENTE, `${cena.id}: "${alvo}" não aparece em nenhuma tela — renomearam?`).toContain(alvo);
      }
    }
  });

  it("os ids são únicos (o storyboard grava um PNG por id)", () => {
    const ids = CENAS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

/**
 * A regra vem do CLAUDE.md: qualquer coisa que chegue ao usuário final como
 * promessa de retorno financeiro é decisão humana, não minha. Um vídeo de ajuda
 * é o lugar mais fácil do mundo para essa frase escapar — quem grava está
 * empolgado explicando o produto que construiu.
 */
const PROMESSAS = [
  /\blucro\s+(garantid|cert|assegurad)/i,
  /\bretorno\s+(garantid|cert|assegurad)/i,
  /\bganho\s+(garantid|cert)/i,
  /\bganhe\s+(dinheiro|muito|grana)/i,
  /\bvoce\s+vai\s+(lucrar|ganhar\s+dinheiro|enriquecer)/i,
  /\bdinheiro\s+facil\b/i,
  /\bfiqu[ee]\s+ric[oa]\b/i,
  /\brenda\s+(extra|garantida|passiva)\b/i,
  /\bmultiplique\s+(seu|sua)\b/i,
  // A borda de palavra aqui não é zelo: sem ela, "sem arriscar nada" — que é a
  // fala HONESTA da banca simulada — casaria com "sem risco". Casar token por
  // substring já mordeu este repositório quatro vezes.
  /\bsem\s+riscos?\b/i,
];

/**
 * Tira o acento antes de comparar — e as regras acima são escritas SEM acento
 * por causa disso.
 *
 * Não é preciosismo: a primeira versão deste detector exigia "você" com acento,
 * e "voce vai ganhar dinheiro" passava batido. Quem escreve uma legenda às
 * pressas, ou digita no celular, escreve sem acento — justamente a situação em
 * que a frase escapa.
 */
const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "");

const prometeRetorno = (texto: string) => PROMESSAS.some((p) => p.test(semAcento(texto)));

describe("nenhuma narração promete retorno financeiro", () => {
  /**
   * O detector é testado ANTES do conteúdo, com o defeito posto na mão. Sem
   * isto o teste passaria igual se as regex não casassem com nada — foi
   * exatamente assim que um teste de cor ficou verde à toa, medindo só os casos
   * que já se sabia que estavam certos.
   */
  it("o detector reconhece a frase proibida quando ela aparece", () => {
    for (const frase of [
      "Com esse método você vai ganhar dinheiro todo mês.",
      "É lucro garantido no longo prazo.",
      "Uma renda extra sem sair de casa.",
      "Opere sem risco usando a nossa IA.",
      "Multiplique sua banca em 30 dias.",
      "Ganhe dinheiro prevendo eleições.",
      // Sem acento: a forma que escapava da primeira versão do detector.
      "Com esse metodo voce vai ganhar dinheiro todo mes.",
      "E dinheiro facil, so seguir a IA.",
    ]) {
      expect(prometeRetorno(frase), `passou batido: "${frase}"`).toBe(true);
    }
  });

  it("e deixa passar a fala honesta, que fala de prejuízo e de limite", () => {
    for (const frase of [
      "se eu repetisse esta decisão mil vezes, eu sairia no lucro ou no prejuízo?",
      "você vai passar por sequências ruins",
      "nunca como recomendação de compra",
      "onde você descobre, sem arriscar nada, se o seu método está funcionando",
    ]) {
      expect(prometeRetorno(frase), `falso positivo: "${frase}"`).toBe(false);
    }
  });

  it("as cenas de verdade estão limpas", () => {
    for (const cena of CENAS) {
      expect(prometeRetorno(cena.narracao), `${cena.id} promete retorno`).toBe(false);
      expect(prometeRetorno(cena.legenda), `${cena.id} (legenda) promete retorno`).toBe(false);
    }
  });
});

/**
 * A abertura diz de viva voz quanto tempo o vídeo leva. Essa frase envelhece
 * sozinha: basta alguém acrescentar duas cenas para a promessa ficar falsa, e
 * quem assiste percebe na hora — é a primeira coisa que você disse a ele.
 */
const MINUTOS_POR_EXTENSO: Record<string, number> = {
  um: 1, dois: 2, três: 3, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8,
};

function minutosPrometidos(texto: string): number | null {
  const m = /em\s+(?:menos\s+de\s+)?(\d+|um|dois|tr[êe]s|quatro|cinco|seis|sete|oito)\s+minutos?/i.exec(texto);
  if (!m) return null;
  const bruto = m[1].toLowerCase();
  return /^\d+$/.test(bruto) ? Number(bruto) : MINUTOS_POR_EXTENSO[bruto] ?? null;
}

describe("o roteiro e o filme não divergem", () => {
  it("TUTORIAL.md é o gerado pelas cenas (rode `pnpm tutorial`)", () => {
    const disco = readFileSync(join(RAIZ, "TUTORIAL.md"), "utf-8").replace(/\r\n/g, "\n");
    expect(disco).toBe(roteiroEmMarkdown());
  });

  it("toda cena tem fala, legenda e pelo menos um passo", () => {
    for (const cena of CENAS) {
      expect(cena.narracao.length, `${cena.id}: fala curta demais`).toBeGreaterThan(40);
      expect(cena.legenda.length, `${cena.id}: sem legenda`).toBeGreaterThan(3);
      expect(cena.passos.length, `${cena.id}: sem passo nenhum`).toBeGreaterThan(0);
    }
  });

  it("o detector de duração entende a frase que ele vigia", () => {
    expect(minutosPrometidos("te mostro em cinco minutos")).toBe(5);
    expect(minutosPrometidos("em menos de quatro minutos.")).toBe(4);
    expect(minutosPrometidos("em 3 minutos")).toBe(3);
    expect(minutosPrometidos("não falo de duração nenhuma")).toBeNull();
  });

  it("a duração prometida na narração cabe no roteiro de verdade", () => {
    const total = CENAS.reduce((s: number, c: Cena) => s + segundosDaCena(c), 0);
    for (const cena of CENAS) {
      const prometido = minutosPrometidos(cena.narracao);
      if (prometido === null) continue;
      expect(
        total,
        `${cena.id} promete ${prometido} min, mas o roteiro tem ${Math.ceil(total / 60)} min`,
      ).toBeLessThanOrEqual(prometido * 60);
    }
  });

  it("o vídeo cabe em atenção humana: nenhuma cena passa de 90s e o total fica sob 8min", () => {
    const total = CENAS.reduce((s: number, c: Cena) => s + segundosDaCena(c), 0);
    for (const cena of CENAS) {
      expect(segundosDaCena(cena), `${cena.id} é longa demais para uma cena`).toBeLessThanOrEqual(90);
    }
    expect(total, "tutorial longo demais — quebre em dois vídeos").toBeLessThanOrEqual(480);
  });
});
