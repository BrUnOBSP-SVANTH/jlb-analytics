import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");

function telas(dir = SRC, saida: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) { telas(caminho, saida); continue; }
    if (nome.endsWith(".tsx")) saida.push(caminho);
  }
  return saida;
}

const ARQUIVOS = telas().map((f) => ({ caminho: relative(SRC, f), texto: readFileSync(f, "utf-8") }));

/**
 * Lint de copy — o que a auditoria de 09/09/2026 encontrou impresso em produção.
 *
 * "previsãoões", "Configurações do Perfile resolva", "1 posição(ões)",
 * "registe as suas estimativas", "Cerebro" sem acento em quatro telas. Nenhum
 * derruba página, nenhum aparece em `tsc`, nenhum quebra teste — e todos dizem
 * ao visitante brasileiro que o site não foi escrito por alguém que fala a
 * língua dele.
 *
 * A revisão manual tela a tela conserta uma vez; este teste é o que impede a
 * reincidência, que é o problema de verdade num site com 27 telas.
 */
function ocorrencias(padrao: RegExp): string[] {
  const achados: string[] = [];
  for (const { caminho, texto } of ARQUIVOS) {
    for (const linha of texto.split("\n")) {
      if (padrao.test(linha)) achados.push(`${caminho}: ${linha.trim().slice(0, 110)}`);
    }
  }
  return achados;
}

describe("o site escreve em português do Brasil", () => {
  it("nada de português europeu", () => {
    // Vinha da tradução automática e de texto gerado por IA. "registe as suas
    // estimativas" estava no subtítulo de uma tela inteira.
    expect(ocorrencias(/\b(registe|regista|ecrã|utilizador|ficheiro|telemóvel|autocarro|casa de banho)\b/i))
      .toEqual([]);
  });

  it("nada de plural entre parênteses", () => {
    // "1 posição(ões)" é o programador pedindo para o leitor resolver o plural.
    // `plural()` de shared/formato resolve.
    //
    // Só sufixos que são inequivocamente português. Tentei incluir `(s)` e o
    // teste acusou `send(s)`, `Set(s)` e `JSON.parse(s)`: um `s` entre
    // parênteses é indistinguível de um parâmetro de uma letra, e um lint que
    // acusa código é um lint que alguém desliga na semana seguinte.
    expect(ocorrencias(/\p{L}\((ões|ães|éis)\)/u)).toEqual([]);
    // O caso com espaço antes é prosa, não chamada de função.
    expect(ocorrencias(/\p{L}\s\((s|as|es)\)/u)).toEqual([]);
  });

  it("o plural não é montado grudando sufixo em palavra inteira", () => {
    // O caso exato: `previsão{n === 1 ? "" : "ões"}` imprimia "previsãoões".
    // Uma palavra terminada em ~ão seguida de um ternário de sufixo é sempre
    // este erro.
    expect(ocorrencias(/ão\{[^}]*"ões"/)).toEqual([]);
  });

  it("Cérebro é nome de produto e leva acento", () => {
    // `cerebro_articles` (tabela), imports e rotas continuam sem acento — o
    // padrão exige que a palavra esteja solta, como texto de tela.
    expect(ocorrencias(/(?<![A-Za-z_./"'-])Cerebro(?![A-Za-z_./"'-])/)).toEqual([]);
  });

  it("não sobrou vocabulário de casa de apostas", () => {
    // Decisão de posicionamento: a JLB é educação quantitativa. "Jogue com
    // responsabilidade" e a comparação nominal com uma casa de apostas eram o
    // que tornava a mensagem ambígua (NEG-01).
    expect(ocorrencias(/jogue com responsabilidade|\bBetano\b|\bbet365\b/i)).toEqual([]);
  });

  it("nada é 'recomendado' — o site não recomenda posição", () => {
    // "½ KELLY (RECOMENDADO)" colidia frontalmente com o aviso institucional
    // "a JLB Analytics não recomenda posições, apostas ou investimentos" (DET-04).
    expect(ocorrencias(/\(RECOMENDADO\)/)).toEqual([]);
  });
});

describe("o vocabulário de engenharia não vaza para a tela", () => {
  it("não fala em cache, snapshot nem fallback com o usuário", () => {
    // "Cache — atualizado hoje", "snapshot de mercados há 16min",
    // "Gemini (fallback)" (TRV-19). O usuário quer saber de QUANDO é o dado; a
    // palavra que descreve como guardamos é problema nosso.
    //
    // Só o texto visível: `getCache(`, `setCache(`, nomes de variável e
    // comentários seguem livres.
    const suspeitas = ocorrencias(/>[^<>{}]*\b(cache|snapshot|fallback)\b/i);
    expect(suspeitas).toEqual([]);
  });
});
