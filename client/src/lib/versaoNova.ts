/**
 * Saiu uma versão nova do site enquanto a aba estava aberta.
 *
 * O QUE ACONTECIA (telemetria de produção, 05/09 a 16/09/2026). Três dos
 * erros de navegador registrados eram o MESMO: "Failed to fetch dynamically
 * imported module: /assets/Login-DhpfCmto.js". Cada tela é um arquivo com hash
 * no nome; quem abriu o site antes de uma publicação continua com a lista de
 * arquivos antiga, e ao clicar numa tela que ainda não tinha baixado pede um
 * arquivo que já não existe no servidor. O visitante via "Ocorreu um erro
 * inesperado" com o stack trace cru. Com 53 visitantes no mês, três casos é
 * muita gente.
 *
 * O remédio é recarregar a página — o HTML novo traz a lista nova. Mas UMA vez
 * só: se o arquivo faltar por outro motivo, recarregar em laço travaria a aba.
 */

const CHAVE = "jlb_recarga_versao";

/** Janela em que uma segunda falha NÃO recarrega de novo (evita laço). */
export const JANELA_SEM_NOVA_RECARGA_MS = 30_000;

/**
 * A mensagem é de arquivo de versão antiga que sumiu? Cada navegador escreve a
 * sua; as três abaixo são as de Chrome, Firefox e Safari.
 */
export function ehErroDeVersaoAntiga(mensagem: unknown): boolean {
  const m = String(mensagem ?? "");
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS/i.test(m);
}

type Armazenamento = Pick<Storage, "getItem" | "setItem">;

/**
 * Decide se pode recarregar agora, e marca que recarregou. Pura no que
 * importa: recebe o relógio e o armazenamento, para o teste não depender do
 * navegador. Sem armazenamento disponível (aba privada, storage bloqueado)
 * NÃO recarrega — sem a marca não há como garantir que não vira laço.
 */
export function podeRecarregar(agora: number, armazenamento: Armazenamento | null): boolean {
  if (!armazenamento) return false;
  try {
    const ultima = Number(armazenamento.getItem(CHAVE) ?? 0);
    if (Number.isFinite(ultima) && agora - ultima < JANELA_SEM_NOVA_RECARGA_MS) return false;
    armazenamento.setItem(CHAVE, String(agora));
    return true;
  } catch {
    return false;
  }
}

function sessao(): Armazenamento | null {
  try { return window.sessionStorage; } catch { return null; }
}

/** Recarrega UMA vez para buscar a versão nova. Devolve se recarregou. */
export function recarregarParaVersaoNova(): boolean {
  if (!podeRecarregar(Date.now(), sessao())) return false;
  window.location.reload();
  return true;
}

/**
 * O Vite avisa por este evento quando um arquivo de tela não carrega.
 *
 * ⚠️ SEM `preventDefault`. Com ele, o Vite engole o erro e o `import()`
 * devolve `undefined` — o React.lazy então explode com OUTRA mensagem
 * ("Expected the result of a dynamic import() call"), que o ErrorBoundary não
 * reconhece e mostra como erro genérico, com stack trace, até a recarga
 * terminar. Deixando o erro seguir, ele chega ao ErrorBoundary com a mensagem
 * original, que vira a tela "saiu uma versão nova" durante a recarga.
 */
export function ouvirVersaoNova(): void {
  window.addEventListener("vite:preloadError", () => {
    recarregarParaVersaoNova();
  });
}
