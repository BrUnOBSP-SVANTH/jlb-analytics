#!/usr/bin/env node
/**
 * Pre-commit de segurança — barra segredo/.env ANTES de entrar no histórico.
 * Rápido: analisa só o que está no stage (diff --cached), sem rede.
 * Ativado por .githooks/pre-commit (o script `prepare` aponta core.hooksPath p/ .githooks).
 */
import { execSync } from "node:child_process";

// service-role JWT (eyJhbG…) · chave secreta Stripe (sk_live/test) · Anthropic (sk-ant)
export const SECRET_RE = /eyJhbG[A-Za-z0-9_-]{20}|sk_(live|test)_[A-Za-z0-9]{12}|sk-ant-[A-Za-z0-9_-]{12}/;

/**
 * 🔴 SENHA EM TEXTO PURO — a forma que passou por aqui em 30/09/2026.
 *
 * O gravador do tutorial tinha, com valor padrão para "funcionar sem
 * configurar":
 *
 *     const senha = process.env.TUTORIAL_SENHA?.trim() || "<a senha da conta>";
 *
 * A conta existia, estava confirmada e tinha login recente. Foi para o GitHub
 * PÚBLICO e ninguém barrou, porque as três regras acima procuram FORMATO de
 * chave de API — e uma senha escolhida por uma pessoa não tem formato nenhum.
 *
 * O que dá para reconhecer não é a senha: é o CONTEXTO. Um identificador que
 * contém "senha", "password", "passwd", "pwd" ou "secret", um `=` ou `:`, e um
 * literal de texto na MESMA linha.
 *
 * ⚠️ A primeira versão exigia a aspa logo depois do `=` — e deixou passar
 * exatamente a linha que a motivou, porque a senha vinha depois de um `||`:
 *
 *     const senha = process.env.TUTORIAL_SENHA?.trim() || "<a senha da conta>";
 *
 * Um detector que não pega o próprio caso que o originou é pior que nenhum: dá
 * a sensação de proteção. Agora ele varre até o fim da linha.
 *
 * ⚠️ E o literal não pode ter ESPAÇO. É o que separa uma senha de uma frase —
 * `"configure TUTORIAL_SENHA no ambiente"` e `"muito forte"` são texto de
 * interface, não credencial. Sem essa regra o hook reclamaria do jeito certo de
 * escrever, e hook que reclama à toa é hook que as pessoas contornam com
 * `--no-verify`.
 */
/*
 * ⚠️ `(?<=[\s=:(,[|?])` antes da aspa: ela só abre um literal se estiver em
 * POSIÇÃO DE EXPRESSÃO — depois de espaço, `=`, `:`, `(`, `,`, `[`, `||` ou `??`.
 *
 * Sem isso o detector casava a aspa de FECHAMENTO de uma string com a de
 * ABERTURA da seguinte. Em `["Abc", "26!"].join("")` ele leu `"].join("` como
 * um literal de 7 caracteres — e barrou o próprio teste do hook. Código real
 * cai nisso com a mesma facilidade: qualquer linha com duas strings e um
 * `.metodo(` no meio.
 */
export const SENHA_LITERAL_RE =
  /(senha|password|passwd|pwd|secret(?!ar))[A-Za-z_]*\s*[:=][^\n]*?(?<=[\s=:(,[|?])(["'`])[^"'`\s\n]{6,}\2/i;

/**
 * Os dois falsos positivos que a varredura do repositório inteiro achou antes
 * de o hook entrar — e que teriam bloqueado a próxima pessoa a mexer nas duas
 * linhas mais editadas do projeto:
 *
 *  · `const ResetPassword = lazy(() => import("./pages/ResetPassword"))` em
 *    App.tsx. O literal é caminho de MÓDULO. Linha de import não carrega
 *    credencial;
 *  · `secretario: ["secretary"]` em shared/vocabulario.ts. Em português
 *    "secretário" começa com "secret" — daí o `secret(?!ar)` acima.
 */
export const ehImport = (l) => /\bimport\s*\(|\bfrom\s+["'`]|\brequire\s*\(/.test(l);
export const temSenhaLiteral = (l) => SENHA_LITERAL_RE.test(l) && !ehImport(l);

// Só executa quando chamado como programa (pelo hook). Importado pelo teste,
// ele entrega as regras sem rodar git nem chamar process.exit.
const ehPrograma = process.argv[1] && import.meta.url.endsWith(
  process.argv[1].replace(/\\/g, "/").split("/").pop());

if (ehPrograma) {
  const sh = (cmd) => { try { return execSync(cmd, { encoding: "utf8" }); } catch { return ""; } };

  const staged = sh("git diff --cached --name-only --diff-filter=ACM").split("\n").filter(Boolean);

  // 1) Nunca commitar um arquivo .env (exceto .env.example)
  const envFiles = staged.filter((f) => /(^|\/)\.env(\.|$)/.test(f) && !/\.example$/.test(f));

  // 2) Padrão de segredo nas linhas ADICIONADAS
  const added = sh("git diff --cached --unified=0 --diff-filter=ACM")
    .split("\n")
    .filter((l) => l.startsWith("+") && !l.startsWith("+++"));
  const badLines = added.filter((l) => SECRET_RE.test(l)).length;
  const senhas = added.filter(temSenhaLiteral);

  if (envFiles.length || badLines || senhas.length) {
    console.error("\n\x1b[31m\x1b[1m✖ COMMIT BLOQUEADO — possível segredo detectado\x1b[0m");
    if (envFiles.length) console.error("  • Arquivo .env no stage: " + envFiles.join(", ") + "  (nunca commite .env)");
    if (badLines) console.error(`  • ${badLines} linha(s) com padrão de segredo (JWT service-role / Stripe / Anthropic).`);
    if (senhas.length) {
      console.error(`  • ${senhas.length} linha(s) com SENHA em texto puro:`);
      // Mostra a linha, com o valor mascarado — imprimir a senha no terminal para
      // avisar que ela não pode ficar visível seria o mesmo erro, uma casa adiante.
      for (const l of senhas.slice(0, 3)) {
        console.error("      " + l.replace(SENHA_LITERAL_RE, (m) => m.replace(/(["'`])[^"'`]+\1/, "$1••••••$1")).trim().slice(0, 100));
      }
      console.error("      Use variável de ambiente SEM valor padrão — o padrão é o que obriga");
      console.error("      a senha a morar no código.");
    }
    console.error("  Remova o segredo (use variável de ambiente) e tente de novo.");
    console.error("  Falso positivo? git commit --no-verify (use com cuidado).\n");
    process.exit(1);
  }
}
