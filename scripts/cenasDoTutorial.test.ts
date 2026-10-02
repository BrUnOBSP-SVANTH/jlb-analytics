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
 *
 * E desde 01/10/2026, a regra do pedido do fundador — "um vídeo mostrando todas
 * as funções e TESTANDO elas": cena que usa uma ferramenta tem de conferir o
 * resultado. Uma cena que digita números e não verifica nada é exatamente o que
 * a versão anterior fazia, e foi assim que a calculadora de Valor Esperado ficou
 * com um campo que não deixava apagar o número sem ninguém ver.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FILMES, todasAsCenas, roteiroEmMarkdown, segundosDaCena, segundosDoFilme } from "./cenasDoTutorial.ts";
import { rotaExiste, destinoDoApelido } from "../shared/rotas.ts";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const CENAS = todasAsCenas();

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
        // Rótulo com `uppercase` no CSS é escrito em caixa normal no código;
        // a comparação ignora maiúsculas pelo mesmo motivo.
        expect(CLIENTE.toLowerCase(), `${cena.id}: "${alvo}" não aparece em nenhuma tela — renomearam?`)
          .toContain(alvo.toLowerCase());
      }
    }
  });

  it("os ids são únicos no roteiro inteiro (o storyboard e o player usam o id)", () => {
    const ids = CENAS.map((c) => c.id);
    const repetidos = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(repetidos).toEqual([]);
    const filmes = FILMES.map((f) => f.id);
    expect(new Set(filmes).size).toBe(filmes.length);
  });

  it("cena que continua na mesma página vem depois de uma cena dessa página", () => {
    for (const filme of FILMES) {
      filme.cenas.forEach((cena, i) => {
        if (!cena.mesmaPagina) return;
        expect(i, `${cena.id}: mesmaPagina na primeira cena — não há página para continuar`).toBeGreaterThan(0);
        expect(filme.cenas[i - 1].rota, `${cena.id}: continua uma página diferente da anterior`).toBe(cena.rota);
      });
    }
  });
});

describe("o vídeo testa o que mostra", () => {
  it("toda cena que USA uma ferramenta confere o resultado", () => {
    const semProva: string[] = [];
    for (const cena of CENAS) {
      const usa = cena.passos.some((p) => p.acao === "digitar" || p.acao === "clicar" || p.acao === "arrastar");
      const confere = cena.passos.some((p) => p.acao === "verificar");
      if (usa && !confere) semProva.push(cena.id);
    }
    expect(semProva, `cenas que mexem em algo e não conferem nada: ${semProva.join(", ")}`).toEqual([]);
  });

  it("o resultado é conferido DEPOIS da ação que o produz", () => {
    // Verificar antes de digitar passaria com o valor padrão da tela — um teste
    // que confere o número que já estava lá não testa a ferramenta.
    for (const cena of CENAS) {
      const ultimaAcao = cena.passos.map((p) => p.acao).lastIndexOf("digitar");
      if (ultimaAcao < 0) continue;
      const verificaDepois = cena.passos.slice(ultimaAcao + 1).some((p) => p.acao === "verificar");
      expect(verificaDepois, `${cena.id}: digita e não confere depois`).toBe(true);
    }
  });

  it("toda verificação é uma regex válida", () => {
    for (const cena of CENAS) {
      for (const p of cena.passos) {
        if (p.acao !== "verificar") continue;
        expect(() => new RegExp(p.texto, "i"), `${cena.id}: /${p.texto}/`).not.toThrow();
      }
    }
  });

  it("o roteiro cobre as áreas principais do site", () => {
    // A versão anterior cobria 6 rotas de 28 telas. Esta lista é o piso: tirar
    // uma destas do roteiro é decisão, não esquecimento.
    const rotas = new Set(CENAS.map((c) => c.rota));
    for (const essencial of ["/", "/mercados", "/calculadoras", "/simulador", "/track-record", "/educacao",
      "/previsao", "/noticias", "/briefing", "/portfolio", "/dashboard", "/duelos"]) {
      expect(rotas.has(essencial), `${essencial} saiu do roteiro`).toBe(true);
    }
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
 * por causa disso. Quem escreve uma legenda às pressas escreve sem acento —
 * justamente a situação em que a frase escapa.
 */
const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "");

const prometeRetorno = (texto: string) => PROMESSAS.some((p) => p.test(semAcento(texto)));

describe("nenhuma narração promete retorno financeiro", () => {
  /**
   * O detector é testado ANTES do conteúdo, com o defeito posto na mão. Sem
   * isto o teste passaria igual se as regex não casassem com nada.
   */
  it("o detector reconhece a frase proibida quando ela aparece", () => {
    for (const frase of [
      "Com esse método você vai ganhar dinheiro todo mês.",
      "É lucro garantido no longo prazo.",
      "Uma renda extra sem sair de casa.",
      "Opere sem risco usando a nossa IA.",
      "Multiplique sua banca em 30 dias.",
      "Ganhe dinheiro prevendo eleições.",
      "Com esse metodo voce vai ganhar dinheiro todo mes.",
      "E dinheiro facil, so seguir a IA.",
    ]) {
      expect(prometeRetorno(frase), `passou batido: "${frase}"`).toBe(true);
    }
  });

  it("e deixa passar a fala honesta, que fala de prejuízo e de limite", () => {
    for (const frase of [
      "se eu repetisse esta mesma posição muitas vezes, sairia no lucro ou no prejuízo?",
      "a curva passa por sequências ruins",
      "nunca como recomendação",
      "É um beta valendo pontos, sem dinheiro de verdade.",
    ]) {
      expect(prometeRetorno(frase), `falso positivo: "${frase}"`).toBe(false);
    }
  });

  it("as cenas de verdade estão limpas", () => {
    for (const cena of CENAS) {
      expect(prometeRetorno(cena.narracao), `${cena.id} promete retorno`).toBe(false);
      expect(prometeRetorno(cena.legenda), `${cena.id} (legenda) promete retorno`).toBe(false);
    }
    for (const filme of FILMES) {
      expect(prometeRetorno(filme.resumo), `${filme.id} (resumo) promete retorno`).toBe(false);
    }
  });
});

/**
 * Uma narração que diz quanto tempo o vídeo leva envelhece sozinha: basta
 * acrescentar duas cenas para a promessa ficar falsa.
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

  it("a duração prometida na narração cabe no filme dela", () => {
    for (const filme of FILMES) {
      const total = segundosDoFilme(filme);
      for (const cena of filme.cenas) {
        const prometido = minutosPrometidos(cena.narracao);
        if (prometido === null) continue;
        expect(total, `${cena.id} promete ${prometido} min, mas o filme tem ${Math.ceil(total / 60)}`)
          .toBeLessThanOrEqual(prometido * 60);
      }
    }
  });

  it("cada vídeo cabe em atenção humana: nenhuma cena passa de 90s e nenhum filme de 5min", () => {
    for (const cena of CENAS) {
      expect(segundosDaCena(cena), `${cena.id} é longa demais para uma cena`).toBeLessThanOrEqual(90);
    }
    for (const filme of FILMES) {
      expect(segundosDoFilme(filme), `${filme.id} longo demais — quebre em dois`).toBeLessThanOrEqual(300);
    }
  });
});

/**
 * O índice do player era uma CÓPIA escrita à mão do roteiro, com a fala
 * duplicada e os tempos chutados. Agora ele é gerado na gravação; estas
 * asserções impedem que alguém volte a editá-lo à mão ou que ele ofereça um
 * filme que saiu do roteiro.
 */
describe("o índice do player é o gerado", () => {
  const indice = readFileSync(join(RAIZ, "shared", "tutorialCenas.ts"), "utf-8");

  it("tem a marca de arquivo gerado", () => {
    expect(indice).toMatch(/GERADO por `pnpm tutorial`/);
    expect(indice).toMatch(/\/\* DADOS \*\//);
  });

  it("todo filme do índice existe no roteiro, com as mesmas cenas", () => {
    const dados = JSON.parse(/\/\* DADOS \*\/([\s\S]*?)\/\* FIM \*\//.exec(indice)?.[1] ?? "[]") as
      Array<{ id: string; capitulos: Array<{ id: string; narracao: string }> }>;
    for (const f of dados) {
      const doRoteiro = FILMES.find((x) => x.id === f.id);
      expect(doRoteiro, `o player oferece "${f.id}", que não está no roteiro`).toBeDefined();
      expect(f.capitulos.map((c) => c.id), `${f.id}: as cenas gravadas não são as do roteiro — regrave`)
        .toEqual(doRoteiro!.cenas.map((c) => c.id));
      // A fala gravada é a do roteiro: mudou a narração e não regravou → reprova.
      for (const cap of f.capitulos) {
        const cena = doRoteiro!.cenas.find((c) => c.id === cap.id)!;
        expect(cap.narracao, `${f.id}/${cap.id}: a narração mudou — regrave o filme`).toBe(cena.narracao);
      }
    }
  });
});
