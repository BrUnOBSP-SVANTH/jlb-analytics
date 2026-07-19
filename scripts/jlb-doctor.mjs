#!/usr/bin/env node
/**
 * JLB Doctor — auditoria de saúde do JLB Analytics
 * ------------------------------------------------------------------
 * Consolida numa só análise tudo que normalmente se checa à mão:
 *   • Saúde do TypeScript (client + server)
 *   • Telas órfãs (páginas fora das rotas)
 *   • Componentes não usados
 *   • Fetches de mercado fora do cache compartilhado (escalabilidade)
 *   • Dados hardcoded / mocks / TODOs
 *   • console.log em produção, arquivos gigantes
 *   • Variáveis de ambiente faltando
 *   • Saúde dos dados no Supabase (artigos, previsões, track record da IA)
 *   • Inventário de telas e endpoints
 * Encerra com uma LISTA DE PRIORIDADES ranqueada.
 *
 * Uso:
 *   node scripts/jlb-doctor.mjs            # auditoria completa
 *   node scripts/jlb-doctor.mjs --quick    # pula o tsc (rápido)
 *   node scripts/jlb-doctor.mjs --no-live  # pula checagens de rede (Supabase)
 *   node scripts/jlb-doctor.mjs --json     # saída JSON para CI
 *
 * Exit code: 1 se houver qualquer 🔴 crítico (útil em pré-commit/CI).
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, relative, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

// ── Setup ──────────────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CLIENT = join(ROOT, "client");
const CLIENT_SRC = join(CLIENT, "src");
const PAGES = join(CLIENT_SRC, "pages");
const COMPONENTS = join(CLIENT_SRC, "components");
const SERVER = join(ROOT, "server");
const ROUTES = join(SERVER, "routes");
const APP_TSX = join(CLIENT_SRC, "App.tsx");
const ENV_FILE = join(ROOT, ".env");

const args = process.argv.slice(2);
const QUICK = args.includes("--quick");
const NO_LIVE = args.includes("--no-live");
const JSON_OUT = args.includes("--json");

// ── Cores ──────────────────────────────────────────────────────────────────
const c = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m",
  blue: "\x1b[34m", cyan: "\x1b[36m", gray: "\x1b[90m", gold: "\x1b[33m",
};
const paint = (txt, color) => (JSON_OUT ? txt : `${color}${txt}${c.reset}`);

// ── Coletor de achados ─────────────────────────────────────────────────────
const findings = []; // { level: "crit"|"warn"|"ok"|"info", area, msg, detail? }
const add = (level, area, msg, detail) => findings.push({ level, area, msg, detail });

// ── Helpers ────────────────────────────────────────────────────────────────
function walk(dir, ext = [".ts", ".tsx"]) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) { if (name !== "node_modules") out.push(...walk(full, ext)); }
    else if (ext.some((e) => name.endsWith(e))) out.push(full);
  }
  return out;
}
const read = (f) => { try { return readFileSync(f, "utf8"); } catch { return ""; } };
const countMatches = (text, re) => (text.match(re) ?? []).length;
const rel = (f) => relative(ROOT, f).replace(/\\/g, "/");
const lines = (f) => read(f).split("\n").length;

const section = (title) => { if (!JSON_OUT) console.log(`\n${paint("▸ " + title, c.bold + c.cyan)}`); };
const line = (icon, msg, detail) => {
  if (JSON_OUT) return;
  console.log(`  ${icon} ${msg}${detail ? paint("  " + detail, c.gray) : ""}`);
};

// ── 1. TypeScript health ────────────────────────────────────────────────────
function checkTypeScript() {
  section("TypeScript");
  if (QUICK) { line("⏭️", paint("Pulado (--quick)", c.dim)); return; }
  for (const [name, dir] of [["client", CLIENT], ["server", SERVER]]) {
    try {
      execSync("npx tsc --noEmit", { cwd: dir, stdio: "pipe", timeout: 120000 });
      line("✅", `${name}: sem erros de tipo`);
      add("ok", "TypeScript", `${name} compila limpo`);
    } catch (e) {
      const out = (e.stdout?.toString() ?? "") + (e.stderr?.toString() ?? "");
      const errCount = countMatches(out, /error TS\d+/g);
      line("🔴", paint(`${name}: ${errCount} erro(s) de tipo`, c.red));
      add("crit", "TypeScript", `${name} tem ${errCount} erro(s) de tipo`, out.split("\n").filter((l) => l.includes("error TS")).slice(0, 5).join("; "));
    }
  }
}

// ── 2. Telas órfãs ───────────────────────────────────────────────────────────
function checkOrphanPages() {
  section("Telas órfãs (páginas fora das rotas)");
  const app = read(APP_TSX);
  const pageFiles = walk(PAGES).map((f) => basename(f, ".tsx"));
  const orphans = pageFiles.filter((p) => !app.includes(`pages/${p}`) && !app.includes(`./${p}`));
  if (orphans.length === 0) { line("✅", "Toda página está referenciada no App.tsx"); add("ok", "Telas", "Sem páginas órfãs"); }
  else for (const o of orphans) { line("🔴", `Página órfã: ${paint(o + ".tsx", c.red)}`, "não está em nenhuma rota → código morto"); add("crit", "Telas", `Página órfã: ${o}.tsx`, "deletar ou rotear"); }
  add("info", "Telas", `${pageFiles.length} páginas no total`);
  line("ℹ️", paint(`${pageFiles.length} páginas no total`, c.dim));
}

// ── 3. Componentes não usados ────────────────────────────────────────────────
// Ignora components/ui/ — é o kit shadcn/ui (design system), parcialmente usado por design.
function checkUnusedComponents() {
  section("Componentes próprios não usados");
  const comps = walk(COMPONENTS).filter((f) => f.endsWith(".tsx") && !f.replace(/\\/g, "/").includes("/components/ui/"));
  const corpus = walk(CLIENT_SRC).filter((x) => !x.replace(/\\/g, "/").includes("/components/ui/"));
  let unused = 0;
  for (const f of comps) {
    const name = basename(f, ".tsx");
    if (name === "Layout") continue; // layout raiz
    const re = new RegExp(`(from\\s+["'].*${name}["']|import\\s+${name}\\b|<${name}[\\s/>])`);
    const others = corpus.filter((x) => x !== f).map(read).join("\n");
    if (!re.test(others)) { line("⚠️", `Componente sem uso: ${paint(name + ".tsx", c.yellow)}`); add("warn", "Componentes", `Não usado: ${name}.tsx`); unused++; }
  }
  if (unused === 0) { line("✅", "Todos os componentes próprios estão em uso"); add("ok", "Componentes", "Nenhum órfão"); }
  line("ℹ️", paint(`(kit shadcn/ui ignorado — design system)`, c.dim));
}

// ── 4. Fetches de mercado fora do cache (escalabilidade) ─────────────────────
function checkCentralizedFetch() {
  section("Camada de dados (fetches de mercado centralizados)");
  const files = walk(CLIENT_SRC).filter((f) => !f.endsWith("marketsCache.ts"));
  const offenders = [];
  for (const f of files) {
    const txt = read(f);
    if (/fetch\(\s*["'`]\/api\/(polymarket|kalshi)\/markets/.test(txt)) offenders.push(rel(f));
  }
  if (offenders.length === 0) { line("✅", "Todos os fetches de mercado passam pelo cache compartilhado"); add("ok", "Escalabilidade", "Fetches centralizados"); }
  else for (const o of offenders) { line("⚠️", `Fetch direto de mercado: ${paint(o, c.yellow)}`, "deveria usar getMarkets() do marketsCache"); add("warn", "Escalabilidade", `Fetch direto: ${o}`); }
}

// ── 5. Dados hardcoded / TODOs / mocks ───────────────────────────────────────
function checkCodeSmells() {
  section("Code smells (mocks, TODOs, console.log)");
  const all = [...walk(CLIENT_SRC), ...walk(SERVER)];
  let todos = 0, mocks = 0, logs = 0;
  const logFiles = new Set();
  for (const f of all) {
    const txt = read(f);
    todos += countMatches(txt, /\b(TODO|FIXME|XXX|HACK)\b/g);
    mocks += countMatches(txt, /\b(mock|fake|placeholder|simulação|dummy)\b/gi);
    const l = countMatches(txt, /console\.log\(/g);
    if (l > 0) { logs += l; logFiles.add(rel(f)); }
  }
  todos > 0 ? line("⚠️", `${paint(todos, c.yellow)} marcadores TODO/FIXME/HACK`) : line("✅", "Sem TODOs pendentes");
  if (todos > 0) add("warn", "Code smell", `${todos} TODO/FIXME/HACK`);
  logs > 0
    ? line("⚠️", `${paint(logs, c.yellow)} console.log em ${logFiles.size} arquivo(s)`, [...logFiles].slice(0, 3).join(", "))
    : line("✅", "Sem console.log em produção");
  if (logs > 0) add("warn", "Code smell", `${logs} console.log`, [...logFiles].slice(0, 5).join(", "));
  line("ℹ️", paint(`${mocks} menções a mock/fake/placeholder (revisar se viram dado real)`, c.dim));
}

// ── 6. Arquivos gigantes ──────────────────────────────────────────────────────
function checkBigFiles() {
  section("Arquivos para refatorar (> 700 linhas)");
  const all = [...walk(CLIENT_SRC), ...walk(SERVER)];
  const big = all.map((f) => ({ f, n: lines(f) })).filter((x) => x.n > 700).sort((a, b) => b.n - a.n);
  if (big.length === 0) { line("✅", "Nenhum arquivo monstro"); add("ok", "Manutenção", "Sem arquivos gigantes"); }
  else for (const { f, n } of big.slice(0, 8)) {
    const icon = n > 1500 ? "🔴" : "⚠️";
    line(icon, `${rel(f)} — ${paint(n + " linhas", n > 1500 ? c.red : c.yellow)}`);
    add(n > 1500 ? "warn" : "info", "Manutenção", `${rel(f)}: ${n} linhas`);
  }
}

// ── 7. Variáveis de ambiente ─────────────────────────────────────────────────
function checkEnv() {
  section("Variáveis de ambiente");
  if (!existsSync(ENV_FILE)) { line("🔴", paint(".env não encontrado", c.red)); add("crit", "Env", ".env ausente"); return {}; }
  const env = Object.fromEntries(
    read(ENV_FILE).split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
      .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
  );
  const required = [
    { keys: ["ANTHROPIC_API_KEY"], feature: "IA (análise, previsão, briefing)" },
    { keys: ["NEWS_API_KEY"], feature: "notícias contextuais" },
    { keys: ["SUPABASE_URL", "VITE_SUPABASE_URL"], feature: "Cerebro, auth, track record" },
    { keys: ["SUPABASE_SERVICE_KEY", "VITE_SUPABASE_ANON_KEY"], feature: "escrita no Supabase" },
  ];
  for (const { keys, feature } of required) {
    const has = keys.some((k) => env[k] && env[k].length > 0);
    has ? line("✅", `${keys[0]} configurada`, `→ ${feature}`)
        : (line("⚠️", paint(`${keys.join(" / ")} ausente`, c.yellow), `→ ${feature} degradado`), add("warn", "Env", `${keys[0]} ausente`));
  }
  return env;
}

// ── 8. Saúde dos dados no Supabase ───────────────────────────────────────────
async function checkSupabase(env) {
  section("Saúde dos dados (Supabase)");
  if (NO_LIVE) { line("⏭️", paint("Pulado (--no-live)", c.dim)); return; }
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_KEY || env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) { line("⚠️", "Credenciais Supabase ausentes — pulando"); return; }
  const h = { apikey: key, Authorization: `Bearer ${key}` };

  async function count(table, filter = "") {
    try {
      const r = await fetch(`${url}/rest/v1/${table}?select=id${filter}`, {
        method: "HEAD", headers: { ...h, Prefer: "count=exact", Range: "0-0" },
      });
      const cr = r.headers.get("content-range");
      return cr ? Number(cr.split("/")[1]) : null;
    } catch { return null; }
  }

  const checks = [
    ["cerebro_articles", "&status=eq.active", "artigos ativos no Cerebro", 100],
    ["cerebro_analyses", "&status=eq.active", "sínteses IA ativas", 10],
    ["market_snapshots", "", "snapshots de mercado (backtester)", 50],
    ["predictions", "", "previsões de usuários", 0],
    ["ai_forecasts", "", "previsões da IA registradas", 0],
    ["duels", "", "duelos de previsão (Fase 1)", 0],
  ];
  for (const [table, filter, label, min] of checks) {
    const n = await count(table, filter);
    if (n === null) { line("⚠️", `${label}: ${paint("indisponível", c.yellow)}`); continue; }
    const icon = n >= min ? "✅" : (min > 0 ? "⚠️" : "ℹ️");
    line(icon, `${label}: ${paint(String(n), n >= min ? c.green : c.yellow)}`);
    if (min > 0 && n < min) add("warn", "Dados", `${label} baixo (${n} < ${min})`);
  }

  // Track record da IA
  try {
    const r = await fetch(`${url}/rest/v1/ai_track_record?select=*`, { headers: h });
    if (r.ok) {
      const [t] = await r.json();
      if (t && t.resolved_count > 0) {
        const skill = t.market_brier ? (1 - t.ai_brier / t.market_brier) : null;
        line("✅", `Track record IA: ${paint(t.resolved_count + " resolvidas", c.green)}`, `Brier IA ${t.ai_brier} vs mercado ${t.market_brier}`);
        if (skill !== null) add("info", "IA", `Skill vs mercado: ${(skill * 100).toFixed(0)}%`);
      } else {
        line("ℹ️", paint(`Track record IA em construção (${t?.total_count ?? 0} análises registradas, 0 resolvidas)`, c.dim));
        add("info", "IA", "Track record vazio — rode análises para popular");
      }
    }
  } catch { /* skip */ }
}

// ── 9. Inventário ─────────────────────────────────────────────────────────────
function checkInventory() {
  section("Inventário");
  const app = read(APP_TSX);
  const routes = countMatches(app, /<Route\s+path=/g);
  const endpoints = walk(ROUTES).map(read).join("\n");
  const eps = countMatches(endpoints, /router\.(get|post|put|delete)\s*\(/g);
  const pages = walk(PAGES).length;
  const comps = walk(COMPONENTS).length;
  line("ℹ️", `${paint(pages, c.bold)} páginas · ${paint(routes, c.bold)} rotas · ${paint(comps, c.bold)} componentes · ${paint(eps, c.bold)} endpoints de API`);
  add("info", "Inventário", `${pages} páginas, ${routes} rotas, ${comps} componentes, ${eps} endpoints`);
}

// ── Relatório de prioridades ─────────────────────────────────────────────────
function report() {
  const crit = findings.filter((f) => f.level === "crit");
  const warn = findings.filter((f) => f.level === "warn");

  if (JSON_OUT) {
    console.log(JSON.stringify({ findings, summary: { crit: crit.length, warn: warn.length } }, null, 2));
    return crit.length > 0 ? 1 : 0;
  }

  console.log(`\n${paint("━".repeat(60), c.gray)}`);
  console.log(paint("  PRIORIDADES", c.bold + c.gold));
  console.log(paint("━".repeat(60), c.gray));

  if (crit.length === 0 && warn.length === 0) {
    console.log(paint("\n  🎉 Nenhum problema crítico ou de atenção. Site saudável!\n", c.green));
    return 0;
  }
  let i = 1;
  for (const f of crit) console.log(`  ${paint(`${i++}.`, c.red)} ${paint("🔴 " + f.area, c.red)} — ${f.msg}${f.detail ? paint("\n      " + f.detail, c.gray) : ""}`);
  for (const f of warn) console.log(`  ${paint(`${i++}.`, c.yellow)} ${paint("⚠️  " + f.area, c.yellow)} — ${f.msg}${f.detail ? paint("\n      " + f.detail, c.gray) : ""}`);

  console.log(`\n  ${paint(`${crit.length} crítico(s)`, c.red)} · ${paint(`${warn.length} atenção`, c.yellow)}\n`);
  return crit.length > 0 ? 1 : 0;
}

// ── Run ───────────────────────────────────────────────────────────────────────
(async () => {
  if (!JSON_OUT) {
    console.log(paint("\n╔═══════════════════════════════════════════════╗", c.cyan));
    console.log(paint("║          JLB DOCTOR · auditoria do site       ║", c.bold + c.cyan));
    console.log(paint("╚═══════════════════════════════════════════════╝", c.cyan));
  }
  try { checkTypeScript(); } catch (e) { add("warn", "Doctor", "checkTypeScript falhou: " + e.message); }
  try { checkOrphanPages(); } catch (e) { add("warn", "Doctor", "checkOrphanPages falhou: " + e.message); }
  try { checkUnusedComponents(); } catch (e) { add("warn", "Doctor", "checkUnusedComponents falhou: " + e.message); }
  try { checkCentralizedFetch(); } catch (e) { add("warn", "Doctor", "checkCentralizedFetch falhou: " + e.message); }
  try { checkCodeSmells(); } catch (e) { add("warn", "Doctor", "checkCodeSmells falhou: " + e.message); }
  try { checkBigFiles(); } catch (e) { add("warn", "Doctor", "checkBigFiles falhou: " + e.message); }
  let env = {};
  try { env = checkEnv(); } catch (e) { add("warn", "Doctor", "checkEnv falhou: " + e.message); }
  try { await checkSupabase(env); } catch (e) { add("warn", "Doctor", "checkSupabase falhou: " + e.message); }
  try { checkInventory(); } catch (e) { add("warn", "Doctor", "checkInventory falhou: " + e.message); }
  const code = report();
  process.exit(code);
})();
