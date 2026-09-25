import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const ler = (nome: string) => readFileSync(join(AQUI, nome), "utf-8");
const semComentarios = (t: string) => t
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
  .replace(/^\s*\/\/.*$/gm, "");

/**
 * APR-03 — o conteúdo da trilha.
 */
describe("a trilha ensina matéria, não funcionalidade", () => {
  it("🔴 o Nível 5 não lista o que o SISTEMA faz como se fosse aprendizado", () => {
    // Dois dos quatro tópicos descreviam comportamento do produto — "nota
    // educacional obrigatória em todo output", "filtro de output por nível de
    // usuário" — e um terceiro era detalhe da nossa implementação de ensemble.
    // Quem lê a trilha está decidindo se vale a pena; precisa ver o que vai
    // estudar, não o que vai acontecer com ele.
    const educacao = semComentarios(ler("Educacao.tsx"));
    for (const interno of ["Nota educacional obrigatória", "Filtro de output", "SS ≤ 0 são excluídos"]) {
      expect(educacao, interno).not.toContain(interno);
    }
  });

  it("⚠️ nenhum número da trilha sai com ponto decimal", () => {
    // TXT-01 na página que ENSINA a ler número. "λ=2.25" e "2.25× mais"
    // passaram porque o detector da varredura só olha número seguido de % ou pp.
    // Só o TEXTO do JSX — entre `>` e `<`, e dentro das props que viram frase.
    // `half * 1.6` é conta, não número na tela; prender código aqui só ensinaria
    // a desligar o teste.
    const PONTO = /\d{1,3}\.\d{1,2}\s*(×|x\b|%|pp|vezes)/;
    for (const arq of ["Educacao.tsx", "Nivel1.tsx", "Nivel2.tsx", "Nivel3.tsx", "Nivel4.tsx", "Nivel5.tsx"]) {
      const fonte = semComentarios(ler(arq));
      const textos = [
        ...Array.from(fonte.matchAll(/>([^<>{}]{4,})</g), (m) => m[1]),
        ...Array.from(fonte.matchAll(/(?:title|subtitle|desc|outcome|label)[:=]\s*"([^"]{6,})"/g), (m) => m[1]),
      ];
      for (const t of textos) {
        const achado = t.match(PONTO);
        expect(achado?.[0], `${arq}: "${t.slice(0, 60)}"`).toBeUndefined();
      }
    }
  });
});

describe("o EV também é ensinado na forma do mercado de previsão", () => {
  const nivel1 = ler("Nivel1.tsx");

  it("🔴 existe a forma p ÷ preço − 1, além da tabela de cenários", () => {
    // A trilha ensinava EV só na linguagem de casa de apostas: montar cenários
    // e inventar a linha de perda. O produto inteiro é mercado de previsão,
    // onde o contrato paga R$ 1 e o preço JÁ é a probabilidade. Quem aprende só
    // a primeira forma sai da trilha sem saber ler a tela principal do site.
    expect(nivel1).toMatch(/p ÷ preço − 1/);
    expect(nivel1).toMatch(/EVDeMercadoPrevisao/);
  });

  it("⚠️ a conta vem de lib/edge, não é uma segunda implementação", () => {
    // É o número que a plataforma mais publica. Duas fontes divergem.
    expect(nivel1).toMatch(/import \{ calcularVantagem, precoCalculavel \} from "@\/lib\/edge"/);
    const bloco = nivel1.slice(nivel1.indexOf("function EVDeMercadoPrevisao"), nivel1.indexOf("// ─── Calculadora de Valor Esperado"));
    expect(bloco).toMatch(/calcularVantagem\(q, p\)/);
    // Sem reimplementar a divisão à mão em outro lugar do bloco.
    expect(semComentarios(bloco)).not.toMatch(/q\s*\/\s*p\s*-\s*1/);
  });
});

describe("campo de calculadora tem nome para quem não enxerga", () => {
  it("🔴 todo input dos níveis tem <label> associado ou aria-label", () => {
    // Os títulos das colunas eram `<span>`: pareciam rótulo e, no leitor de
    // tela, os campos eram "caixa de edição" sem nome — numa página que ensina
    // a calcular, saber qual campo é qual É a tarefa.
    const semNome: string[] = [];
    const rotuloSolto: string[] = [];
    for (const arq of ["Nivel1.tsx", "Nivel2.tsx", "Nivel3.tsx", "Nivel4.tsx", "Nivel5.tsx"]) {
      const fonte = ler(arq);

      // Campo ENVOLVIDO por um `<label>` já está associado — é a outra forma
      // válida, e é a que o checkbox do Nível 3 usa. Marco esses trechos para
      // não cobrar deles um `id` que não faz falta.
      const dentroDeLabel: Array<[number, number]> = Array.from(
        fonte.matchAll(/<label\b[\s\S]*?<\/label>/g),
        (m) => [m.index ?? 0, (m.index ?? 0) + m[0].length] as [number, number],
      );

      // Todo campo precisa de `id` (para o rótulo apontar) ou de `aria-label`.
      for (const m of fonte.matchAll(/<(input|textarea)\b[\s\S]{0,500}?\/>/g)) {
        const tag = m[0];
        const pos = m.index ?? 0;
        if (/aria-label|\bid=/.test(tag)) continue;
        if (dentroDeLabel.some(([a, b]) => pos > a && pos < b)) continue;
        semNome.push(`${arq}: ${tag.slice(0, 64).replace(/\s+/g, " ")}`);
      }

      // E todo `<label>` precisa apontar para alguém — exceto o que ENVOLVE o
      // próprio campo, que é a outra forma válida de associação (o checkbox do
      // Nível 3 usa essa).
      for (const m of fonte.matchAll(/<label\b[^>]*>([\s\S]{0,300}?)<\/label>/g)) {
        const [tag, dentro] = [m[0], m[1]];
        if (/htmlFor=/.test(tag)) continue;
        if (/<input|<textarea|<select/.test(dentro)) continue;
        rotuloSolto.push(`${arq}: ${tag.slice(0, 64).replace(/\s+/g, " ")}`);
      }
    }
    expect(semNome).toEqual([]);
    expect(rotuloSolto).toEqual([]);
  });
});
