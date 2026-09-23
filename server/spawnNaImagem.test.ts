import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Todo arquivo que o servidor SPAWNA precisa existir DENTRO da imagem.
 *
 * O QUE ACONTECEU (Auditoria 21/09, INF-01). `server/index.ts` roda
 * `scripts/sports-forecast.mjs` duas vezes por dia. O Dockerfile copiava
 * `dist`, `python` e `prerendered` para o estágio de runtime — mas não
 * `scripts`. Em produção o spawn morria com "Cannot find module", duas vezes
 * por dia, desde sempre: a previsão esportiva prospectiva, que é a prova que o
 * pivô para apostas depende, NUNCA rodou no ar.
 *
 * E era invisível: o `child.on("error")` registra um aviso e o servidor segue.
 * Nada quebra. Só não acontece — que é o pior tipo de defeito, porque não
 * aparece em nenhuma tela nem em nenhum alarme.
 *
 * Este teste lê os dois arquivos e confronta um com o outro.
 */
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const indexTs = readFileSync(join(RAIZ, "server", "index.ts"), "utf-8");
const dockerfile = readFileSync(join(RAIZ, "Dockerfile"), "utf-8");

/** As pastas que o `index.ts` usa como base de spawn (PYTHON_DIR, SCRIPTS_DIR). */
function pastasDeSpawn(): Array<{ constante: string; pasta: string }> {
  const achados: Array<{ constante: string; pasta: string }> = [];
  for (const m of indexTs.matchAll(/const\s+([A-Z_]+_DIR)\s*=\s*path\.resolve\(__dirname,\s*"\.\.",\s*"([a-z]+)"\)/g)) {
    achados.push({ constante: m[1], pasta: m[2] });
  }
  return achados;
}

/** Os arquivos nomeados em `spawn(..., [path.join(X_DIR, "arquivo")])`. */
function arquivosSpawnados(): Array<{ pasta: string; arquivo: string }> {
  const pastas = new Map(pastasDeSpawn().map((p) => [p.constante, p.pasta]));
  const achados: Array<{ pasta: string; arquivo: string }> = [];
  for (const m of indexTs.matchAll(/path\.join\((([A-Z_]+_DIR)),\s*"([^"]+)"\)/g)) {
    const pasta = pastas.get(m[2]);
    if (pasta) achados.push({ pasta, arquivo: m[3] });
  }
  // O `runPythonScript` recebe o nome por parâmetro: pega as chamadas dele também.
  for (const m of indexTs.matchAll(/runPythonScript\("([^"]+)"/g)) {
    achados.push({ pasta: "python", arquivo: m[1] });
  }
  return achados;
}

describe("INF-01 — o que o servidor spawna existe na imagem", () => {
  it("o `index.ts` spawna pelo menos um script (senão este teste não prova nada)", () => {
    // Sem esta âncora, uma mudança de sintaxe faria os regex acharem zero e o
    // teste passaria feliz sem verificar coisa nenhuma.
    expect(arquivosSpawnados().length).toBeGreaterThan(0);
  });

  it("🔴 cada script spawnado é copiado pelo Dockerfile", () => {
    const faltando = arquivosSpawnados().filter(({ pasta, arquivo }) => {
      // Copiar a pasta inteira (COPY python ./python) cobre tudo dentro dela.
      const pastaInteira = new RegExp(`^COPY ${pasta} \\./${pasta}\\s*$`, "m").test(dockerfile);
      const arquivoSolto = dockerfile.includes(`COPY ${pasta}/${arquivo}`);
      return !pastaInteira && !arquivoSolto;
    });

    expect(
      faltando,
      "script que o servidor spawna e o Dockerfile NÃO copia — em produção morre com "
      + "'Cannot find module', em silêncio:\n"
      + faltando.map((f) => `  ${f.pasta}/${f.arquivo}`).join("\n"),
    ).toEqual([]);
  });

  it("cada script spawnado existe mesmo no repositório", () => {
    const inexistentes = arquivosSpawnados()
      .filter(({ pasta, arquivo }) => !existsSync(join(RAIZ, pasta, arquivo)));
    expect(inexistentes, `caminho spawnado que não existe: ${JSON.stringify(inexistentes)}`).toEqual([]);
  });

  it("a pasta que o script de esportes importa também vai para a imagem", () => {
    // `sports-forecast.mjs` importa `./lib/sports-models.mjs`: copiar só o
    // arquivo de cima deixaria o import quebrado, com o mesmo sintoma mudo.
    expect(dockerfile).toMatch(/COPY scripts\/lib \.\/scripts\/lib/);
  });
});
