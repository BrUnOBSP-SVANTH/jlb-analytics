// ── Humanização de citações da IA ────────────────────────────────────────────
// Os prompts pedem que a IA cite as fontes por número — [1] para notícias,
// [C1] para itens do Cerebro. Isso é ótimo para a IA ancorar a análise, mas
// péssimo para o leitor: ver "[1]" no meio do texto não diz NADA. Esta função
// troca cada marcador pelo NOME real da fonte, no próprio texto.
//
// - [1]        → " (Reuters)"
// - [1][5][8]  → " (Reuters, CNN, BBC)"   (colapsa a sequência, sem repetir)
// - [C2]       → " (Cerebro · Bloomberg)" (contexto proprietário)
// - marcador que aponta para índice inexistente → removido (não deixa lixo)
//
// newsSources[i] é a fonte da citação [i+1]; cerebroSources[i], a de [C(i+1)].

export function humanizeCitations(
  text: string,
  newsSources: string[],
  cerebroSources: string[] = [],
): string {
  if (!text) return text;
  // Captura runs de um ou mais colchetes adjacentes, cada um com um ou mais
  // "C?número" separados por vírgula: [1] · [C2] · [1,5] · [1][5][8] · [C1][3]
  const runRe = /\s*(?:\[\s*C?\d+(?:\s*,\s*C?\d+)*\s*\])+/g;
  return text.replace(runRe, (run) => {
    const names: string[] = [];
    for (const tok of Array.from(run.matchAll(/(C?)(\d+)/g))) {
      const isCerebro = tok[1] === "C";
      const idx = parseInt(tok[2], 10) - 1; // marcadores são 1-indexed
      const name = isCerebro ? cerebroSources[idx] : newsSources[idx];
      if (name && !names.includes(name)) names.push(name);
    }
    return names.length ? ` (${names.join(", ")})` : "";
  });
}
