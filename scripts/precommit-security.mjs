#!/usr/bin/env node
/**
 * Pre-commit de segurança — barra segredo/.env ANTES de entrar no histórico.
 * Rápido: analisa só o que está no stage (diff --cached), sem rede.
 * Ativado por .githooks/pre-commit (o script `prepare` aponta core.hooksPath p/ .githooks).
 */
import { execSync } from "node:child_process";

// service-role JWT (eyJhbG…) · chave secreta Stripe (sk_live/test) · Anthropic (sk-ant)
const SECRET_RE = /eyJhbG[A-Za-z0-9_-]{20}|sk_(live|test)_[A-Za-z0-9]{12}|sk-ant-[A-Za-z0-9_-]{12}/;

const sh = (cmd) => { try { return execSync(cmd, { encoding: "utf8" }); } catch { return ""; } };

const staged = sh("git diff --cached --name-only --diff-filter=ACM").split("\n").filter(Boolean);

// 1) Nunca commitar um arquivo .env (exceto .env.example)
const envFiles = staged.filter((f) => /(^|\/)\.env(\.|$)/.test(f) && !/\.example$/.test(f));

// 2) Padrão de segredo nas linhas ADICIONADAS
const added = sh("git diff --cached --unified=0 --diff-filter=ACM")
  .split("\n")
  .filter((l) => l.startsWith("+") && !l.startsWith("+++"));
const badLines = added.filter((l) => SECRET_RE.test(l)).length;

if (envFiles.length || badLines) {
  console.error("\n\x1b[31m\x1b[1m✖ COMMIT BLOQUEADO — possível segredo detectado\x1b[0m");
  if (envFiles.length) console.error("  • Arquivo .env no stage: " + envFiles.join(", ") + "  (nunca commite .env)");
  if (badLines) console.error(`  • ${badLines} linha(s) com padrão de segredo (JWT service-role / Stripe / Anthropic).`);
  console.error("  Remova o segredo (use variável de ambiente) e tente de novo.");
  console.error("  Falso positivo? git commit --no-verify (use com cuidado).\n");
  process.exit(1);
}
