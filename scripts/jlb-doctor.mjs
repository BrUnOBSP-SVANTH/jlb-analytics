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

// ── 3b. Hooks e libs não usados ──────────────────────────────────────────────
// Ponto cego que existia até 29/08/2026: o doctor só auditava COMPONENTES, então
// 428 linhas mortas em 3 hooks (useMarketData, usePositions, useRealtimeQuotes)
// passaram despercebidas por meses. Mesma lógica dos componentes, aplicada a
// client/src/hooks e client/src/lib — onde mora metade da lógica do front.
function checkUnusedHooksAndLibs() {
  section("Hooks e libs não usados");
  const targets = [join(CLIENT_SRC, "hooks"), join(CLIENT_SRC, "lib")]
    .filter((d) => existsSync(d))
    .flatMap((d) => walk(d))
    .filter((f) => (f.endsWith(".ts") || f.endsWith(".tsx")) && !f.includes(".test."));
  const corpus = walk(CLIENT_SRC).filter((f) => !f.includes(".test."));
  let unused = 0;
  for (const f of targets) {
    const name = basename(f).replace(/\.tsx?$/, "");
    const src = read(f);
    // ⚠️ Um arquivo pode exportar símbolos com nome DIFERENTE do arquivo — o
    // useMarketData.ts exportava useRates/useBrQuotes/useIndices/... Checar só o
    // nome do arquivo daria falso-positivo (ou falso-negativo) em massa. Então
    // consideramos "usado" se QUALQUER export dele aparecer em outro arquivo.
    const exported = Array.from(
      src.matchAll(/export\s+(?:async\s+)?(?:function|const|class)\s+([A-Za-z_$][\w$]*)/g),
      (m) => m[1],
    );
    const names = Array.from(new Set([name, ...exported]));
    const re = new RegExp(
      `(from\\s+["'][^"']*/${name}["']|\\b(${names.join("|")})\\s*[(<]|\\b(${names.join("|")})\\b\\s*[,}])`,
    );
    const others = corpus.filter((x) => x !== f).map(read).join("\n");
    if (!re.test(others)) {
      const loc = read(f).split("\n").length;
      line("⚠️", `Sem uso: ${paint(rel(f), c.yellow)}`, `${loc} linhas — código morto`);
      add("warn", "Código morto", `${rel(f)} não é importado (${loc} linhas)`);
      unused++;
    }
  }
  if (unused === 0) { line("✅", "Todos os hooks e libs estão em uso"); add("ok", "Código morto", "Nenhum hook/lib órfão"); }
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

// ── 7b. Acesso real à API da Anthropic ───────────────────────────────────────
// Chave PRESENTE não significa chave FUNCIONANDO: com créditos esgotados a API
// devolve 400 e todo endpoint de IA cai no fallback ("análise IA temporariamente
// indisponível") — sem nenhum alarme. Este probe custa ~5 tokens.
async function checkAnthropic(env) {
  section("Acesso à IA (Anthropic)");
  if (NO_LIVE) { line("⏭️", paint("Pulado (--no-live)", c.dim)); return; }
  const key = env.ANTHROPIC_API_KEY;
  if (!key) { line("⚠️", paint("ANTHROPIC_API_KEY ausente", c.yellow)); return; }
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 5, messages: [{ role: "user", content: "ok" }] }),
      signal: AbortSignal.timeout(15_000),
    });
    const hasFallback = !!env.GEMINI_API_KEY;
    if (r.ok) {
      line("✅", `Anthropic respondendo — ${paint("créditos OK", c.green)}`);
      line(hasFallback ? "✅" : "ℹ️", hasFallback
        ? `fallback Gemini configurado ${paint("(rede de segurança ativa)", c.green)}`
        : paint("sem fallback: GEMINI_API_KEY não configurada", c.dim));
      return;
    }
    const body = await r.json().catch(() => ({}));
    const msg = body?.error?.message ?? `HTTP ${r.status}`;
    const isCredit = /credit balance/i.test(msg);
    // Com fallback configurado o site continua respondendo pelo Gemini — grave,
    // mas não é apagão: vira ⚠️ em vez de 🔴.
    if (hasFallback) {
      line("⚠️", paint(`Anthropic fora (${isCredit ? "sem créditos" : msg.slice(0, 50)})`, c.yellow), "→ site respondendo pelo fallback Gemini");
      add("warn", "IA", `Anthropic indisponível — rodando no fallback Gemini${isCredit ? " (recarregue os créditos)" : ""}`);
    } else if (isCredit) {
      line("🔴", paint("SEM CRÉDITOS e SEM FALLBACK — toda a IA do site está degradada", c.red), "recarregue em console.anthropic.com ou configure GEMINI_API_KEY");
      add("crit", "IA", "Créditos Anthropic esgotados: chat, análises, briefing e sínteses do Cerebro fora do ar");
    } else {
      line("🔴", paint(`API inacessível: ${msg.slice(0, 90)}`, c.red));
      add("crit", "IA", `Anthropic inacessível: ${msg.slice(0, 60)}`);
    }
  } catch (e) {
    line("⚠️", paint(`probe falhou: ${String(e.message).slice(0, 60)}`, c.yellow));
  }
}

// ── 8. Saúde dos dados no Supabase ───────────────────────────────────────────
async function checkSupabase(env) {
  section("Saúde dos dados (Supabase)");
  if (NO_LIVE) { line("⏭️", paint("Pulado (--no-live)", c.dim)); return; }
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_KEY || env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) { line("⚠️", "Credenciais Supabase ausentes — pulando"); return; }
  const h = { apikey: key, Authorization: `Bearer ${key}` };

  // 1 retry + MOTIVO da falha. Antes: uma falha transitória virava "indisponível"
  // sem explicação, e o catch mudo escondia se era rede, permissão ou tabela
  // inexistente. Alarme sem causa ensina a ignorar alarme — e este script existe
  // justamente para ser confiável. (Flagrado em 29/08: o Cérebro apareceu como
  // "indisponível" com 19.893 artigos vivos no banco.)
  let lastReason = "";
  async function count(table, filter = "") {
    lastReason = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await fetch(`${url}/rest/v1/${table}?select=id${filter}`, {
          method: "HEAD",
          headers: { ...h, Prefer: "count=exact", Range: "0-0" },
          signal: AbortSignal.timeout(15_000),
        });
        const cr = r.headers.get("content-range");
        if (cr) return Number(cr.split("/")[1]);
        lastReason = `HTTP ${r.status} sem content-range`;
      } catch (e) {
        lastReason = e instanceof Error ? e.message.slice(0, 60) : "erro desconhecido";
      }
      if (attempt === 0) await new Promise((r) => setTimeout(r, 1200));
    }
    return null;
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
    if (n === null) {
      line("⚠️", `${label}: ${paint("indisponível", c.yellow)}`, `após 2 tentativas — ${lastReason || "sem motivo reportado"}`);
      add("warn", "Dados", `${label}: consulta falhou (${lastReason || "?"})`);
      continue;
    }
    const icon = n >= min ? "✅" : (min > 0 ? "⚠️" : "ℹ️");
    line(icon, `${label}: ${paint(String(n), n >= min ? c.green : c.yellow)}`);
    if (min > 0 && n < min) add("warn", "Dados", `${label} baixo (${n} < ${min})`);
  }

  // Frescor dos snapshots — o cron falhou SILENCIOSAMENTE por 44 dias (jun-jul/2026,
  // env sem fallback VITE_ no market_snapshots.py); este alarme evita a repetição.
  try {
    const r = await fetch(`${url}/rest/v1/market_snapshots?select=snapped_at&order=snapped_at.desc&limit=1`, { headers: h });
    if (r.ok) {
      const [row] = await r.json();
      if (row?.snapped_at) {
        const ageDays = Math.floor((Date.now() - new Date(row.snapped_at).getTime()) / 86_400_000);
        if (ageDays > 3) {
          line("⚠️", `último snapshot há ${paint(ageDays + " dias", c.yellow)} — cron de coleta parado?`);
          add("warn", "Dados", `Snapshots parados há ${ageDays}d — verificar cron market_snapshots.py`);
        } else {
          line("✅", `último snapshot: ${paint(ageDays === 0 ? "hoje" : `${ageDays}d atrás`, c.green)}`);
        }
      }
    }
  } catch { /* silencioso */ }

  // ── Comparador de resultados / track record da IA (MONITOR) ──
  // O sinal-chave: `settled_count` = resoluções pelo RESULTADO OFICIAL da plataforma.
  // É a prova de que o site acumula retorno real sobre os resultados (não chute de
  // preço). Enquanto for 0, o comparador roda mas ainda não colheu nada oficial.
  try {
    const r = await fetch(`${url}/rest/v1/ai_track_record?select=*`, { headers: h });
    if (r.ok) {
      const [t] = await r.json();
      const resolved = Number(t?.resolved_count ?? 0);
      if (t && resolved > 0) {
        const dir = Number(t.directional_count ?? 0), hit = Number(t.hit_count ?? 0);
        const mdir = Number(t.market_directional_count ?? 0), mhit = Number(t.market_hit_count ?? 0);
        const settled = Number(t.settled_count ?? 0);
        const hitRate = dir > 0 ? Math.round((hit / dir) * 100) : null;
        const mHitRate = mdir > 0 ? Math.round((mhit / mdir) * 100) : null;
        const skill = Number(t.market_brier) ? (1 - Number(t.ai_brier) / Number(t.market_brier)) : null;
        line("✅", `Track record IA: ${paint(resolved + " resolvidas", c.green)} de ${t.total_count ?? "?"} registradas`,
          hitRate !== null ? `acerto ${hitRate}%${mHitRate !== null ? ` vs mercado ${mHitRate}%` : ""}` : "");
        line("ℹ️", `Brier IA ${paint(String(t.ai_brier), c.cyan)} vs mercado ${t.market_brier}` +
          (skill !== null ? paint(`  · skill ${skill >= 0 ? "+" : ""}${(skill * 100).toFixed(0)}% vs mercado`, skill > 0 ? c.green : c.gray) : ""));
        // Resoluções pelo resultado OFICIAL — o que estamos monitorando.
        if (settled > 0) {
          line("✅", `${paint(settled + " pelo resultado OFICIAL", c.green)} da plataforma`, `${resolved - settled} por preço/inferência`);
          add("info", "IA", `Comparador: ${settled} resolução(ões) OFICIAL(is) · acerto ${hitRate ?? "?"}%`);
          // Diversidade da prova: N oficiais só valem como prova se forem de TEMAS
          // VARIADOS. O "6× Strait of Hormuz" enviesou o histórico — 9 resoluções que
          // eram ~3 eventos. Alerta quando um tema domina (repetição, não amostra).
          try {
            const sr = await fetch(`${url}/rest/v1/ai_forecasts?resolution_source=eq.settled&select=title&limit=500`, { headers: h });
            if (sr.ok) {
              const rows = await sr.json();
              const STOP = new Set(["will","the","by","in","of","to","a","an","be","next","what","who","when","how","is","are","on","for","and","or","during","before","after","end","at","x","vs","de","da","do","que"]);
              const sig = (title) => ((title || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ")
                .split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w) && !/^\d+$/.test(w))
                .slice(0, 3).join(" ")) || "(sem tema)";
              const themes = {};
              for (const row of rows) { const k = sig(row.title); themes[k] = (themes[k] || 0) + 1; }
              const entries = Object.entries(themes).sort((a, b) => b[1] - a[1]);
              const distinct = entries.length;
              const topShare = rows.length ? entries[0][1] / rows.length : 0;
              if (rows.length >= 6 && (topShare >= 0.4 || distinct <= 3)) {
                line("⚠️", paint(`Prova CONCENTRADA: ${distinct} tema(s), maior = ${Math.round(topShare * 100)}%`, c.yellow),
                  `"${entries[0][0]}" ×${entries[0][1]} — precisa de variedade temática, não repetição`);
                add("warn", "IA", `Track record oficial concentrado (${distinct} temas, top ${Math.round(topShare * 100)}%) — diversifique antes de tratar como prova vendável`);
              } else if (rows.length >= 6) {
                line("✅", paint(`Prova diversa: ${distinct} temas distintos`, c.green), `maior tema ${Math.round(topShare * 100)}%`);
              } else {
                line("ℹ️", paint(`Prova oficial ainda pequena (${rows.length}) — diversidade a medir com mais volume`, c.dim));
              }
            }
          } catch { /* skip */ }
        } else {
          line("⚠️", paint("0 pelo resultado OFICIAL ainda (settled=0)", c.yellow), "aguardando mercados da janela de resolução liquidarem — seed priorizado em 2026-08-12");
          add("warn", "IA", "Comparador sem resolução OFICIAL ainda (settled_count=0) — reveja em alguns dias se os mercados da janela começaram a liquidar");
        }
      } else {
        line("ℹ️", paint(`Track record IA em construção (${t?.total_count ?? 0} análises registradas, 0 resolvidas)`, c.dim));
        add("info", "IA", "Track record vazio — rode análises para popular");
      }
    }
  } catch { /* skip */ }
}

// ── 8a. Fidelidade do catálogo de mercados ───────────────────────────────────
// Por que existe: em 31/08/2026 o site exibia 40 mercados do Kalshi que eram
// REAIS mas MORTOS — "Musk em Marte antes de 2099", 33 dos 40 sem volume nenhum
// em 24h, todos fechando a mais de 2 anos. A causa foi silenciosa: a API do
// Kalshi não aceita ordenação e devolvia os primeiros do catálogo, não os mais
// negociados. Nada quebrou, nada logou — só a vitrine ficou errada.
// Este bloco existe para essa regressão nunca mais passar despercebida. Precisa
// do servidor no ar, porque o que importa não é a API de fora e sim o que a
// NOSSA rota entrega depois de filtrar e ranquear.
async function checkMarketFidelity(env) {
  section("Fidelidade do catálogo (Polymarket · Kalshi)");
  if (NO_LIVE) { line("⏭️", paint("Pulado (--no-live)", c.dim)); return; }

  const bases = [env.PORT ? `http://localhost:${env.PORT}` : null, "http://localhost:3001", env.APP_URL].filter(Boolean);
  let base = null;
  for (const b of bases) {
    try {
      const r = await fetch(`${b}/api/kalshi/markets?limit=1`, { signal: AbortSignal.timeout(8_000) });
      if (r.ok) { base = b; break; }
    } catch { /* tenta o próximo */ }
  }
  if (!base) {
    line("ℹ️", paint("servidor fora do ar — suba com `pnpm dev:server` para auditar o catálogo", c.dim));
    return;
  }

  const agora = Date.now();
  for (const fonte of ["polymarket", "kalshi"]) {
    let mercados = [];
    try {
      const r = await fetch(`${base}/api/${fonte}/markets?limit=300`, { signal: AbortSignal.timeout(30_000) });
      if (!r.ok) {
        line("🔴", paint(`${fonte}: rota devolveu HTTP ${r.status}`, c.red));
        add("crit", "Mercados", `${fonte} indisponível (HTTP ${r.status}) — a tela de mercados fica vazia`);
        continue;
      }
      mercados = (await r.json()).markets ?? [];
    } catch (e) {
      line("⚠️", paint(`${fonte}: ${String(e.message).slice(0, 50)}`, c.yellow));
      continue;
    }

    if (mercados.length === 0) {
      line("🔴", paint(`${fonte}: catálogo VAZIO`, c.red));
      add("crit", "Mercados", `${fonte} não devolveu nenhum mercado`);
      continue;
    }

    const venc = mercados.filter((m) => {
      const t = new Date(m.endDate ?? m.closeTime ?? 0).getTime();
      return Number.isFinite(t) && t > 0 && t < agora;
    }).length;
    const semVol = mercados.filter((m) => !Number(m.volume24h ?? m.volume ?? 0)).length;
    // APARAR ANTES de procurar o buraco: sobra nas bordas é inofensiva, só o vão
    // INTERNO denuncia interpolação vazia ("Will  become President"). Escrevi este
    // check errado na primeira versão e ele acusou "Alaska Governor Election
    // Winner  " — que só tinha espaço no fim. É o mesmo deslize que o teste do
    // tituloLimpo já tinha pegado uma vez.
    const quebrado = mercados.filter((m) => /\s{2,}/.test(String(m.question ?? m.title ?? "").trim())).length;
    const semLink = mercados.filter((m) => !m.externalUrl).length;
    const pctMorto = Math.round((100 * semVol) / mercados.length);

    line("ℹ️", `${paint(fonte, c.bold)}: ${paint(String(mercados.length), c.bold)} mercados`);

    if (venc > 0) {
      line("🔴", paint(`  ${venc} já VENCIDOS sendo exibidos como abertos`, c.red));
      add("crit", "Mercados", `${fonte}: ${venc} mercados vencidos na vitrine`);
    } else line("✅", paint("  nenhum vencido", c.green));

    // A assinatura do bug de 31/08 era 82% sem volume. 30% é folgado o bastante
    // para não gritar em dia parado, e apertado o bastante para pegar a regressão.
    if (pctMorto > 30) {
      line("⚠️", paint(`  ${semVol} sem volume em 24h (${pctMorto}%) — catálogo pode ter voltado a mostrar mercado morto`, c.yellow));
      add("warn", "Mercados", `${fonte}: ${pctMorto}% do catálogo sem volume — conferir a ordenação por volume da rota`);
    } else line("✅", paint(`  ${100 - pctMorto}% com volume negociado`, c.green));

    if (quebrado > 0) {
      line("⚠️", paint(`  ${quebrado} títulos com buraco de interpolação`, c.yellow));
      add("warn", "Mercados", `${fonte}: ${quebrado} títulos quebrados exibidos`);
    }

    // Título repetido = cards que o usuário não consegue diferenciar. Flagrado em
    // 01/09: cinco cards idênticos de "How many launches will SpaceX have in Sep
    // 2026?" marcando 9%, 78%, 23%, 46% e 3% — o rótulo da faixa ("Above 10")
    // existia na API e era descartado. Parece defeito nosso e é inutilizável.
    const porTitulo = new Map();
    for (const m of mercados) {
      const t = String(m.question ?? m.title ?? "").trim();
      porTitulo.set(t, (porTitulo.get(t) ?? 0) + 1);
    }
    const repetidos = [...porTitulo.values()].filter((n) => n > 1).length;
    if (repetidos > 0) {
      const exemplo = [...porTitulo.entries()].find(([, n]) => n > 1)?.[0] ?? "";
      line("⚠️", paint(`  ${repetidos} títulos aparecem em mais de um card`, c.yellow),
        `ex.: "${exemplo.slice(0, 44)}"`);
      add("warn", "Mercados", `${fonte}: ${repetidos} títulos duplicados — o usuário não distingue os cards`);
    }
    if (semLink > 0) {
      line("⚠️", paint(`  ${semLink} sem link externo (levariam a lugar nenhum)`, c.yellow));
      add("warn", "Mercados", `${fonte}: ${semLink} mercados sem link de saída`);
    }
  }

  // Manifold entra separada: é dinheiro FICTÍCIO (mana), então não faz sentido
  // cobrar dela volume em dólar. O que importa é que esteja viva — a integração
  // morreu em silêncio quando a API tirou `sort`/`filter` do /v0/markets: a rota
  // devolvia 502, o cliente engolia no catch, e as 30 vagas reservadas ficavam
  // vazias sem ninguém perceber. Este check é para isso não repetir.
  try {
    const r = await fetch(`${base}/api/manifold/markets?limit=60`, { signal: AbortSignal.timeout(20_000) });
    const n = r.ok ? ((await r.json()).markets ?? []).length : 0;
    if (n > 0) line("✅", paint(`manifold: ${n} mercados`, c.green), "dinheiro fictício — rotulado como tal na tela");
    else {
      line("⚠️", paint(`manifold: vazia (HTTP ${r.status})`, c.yellow));
      add("warn", "Mercados", "Manifold sem mercados — integração pode ter quebrado em silêncio");
    }
  } catch {
    line("⚠️", paint("manifold: não respondeu", c.yellow));
  }

  // Reddit: a fonte de 60 vagas da tela principal. Morreu em silêncio quando o
  // endpoint JSON passou a devolver 403 — a rota dava 502, o cliente engolia no
  // catch e ninguém percebeu. Hoje vem do feed RSS, que funciona mas é MUITO
  // sensível a rate limit; por isso o servidor aquece o cache em segundo plano e
  // esta checagem olha uma amostra, não os 7 subreddits.
  for (const sub of ["sportsbook", "PredictionMarkets"]) {
    try {
      const r = await fetch(`${base}/api/reddit/${sub}?limit=25`, { signal: AbortSignal.timeout(20_000) });
      const j = r.ok ? await r.json() : {};
      const n = (j.posts ?? []).length;
      if (n > 0) line("✅", paint(`reddit r/${sub}: ${n} posts`, c.green), `via ${j.source ?? "?"}`);
      else {
        line("⚠️", paint(`reddit r/${sub}: vazio (HTTP ${r.status})`, c.yellow),
          "o cache aquece em segundo plano — reconfira em alguns minutos");
        add("warn", "Mercados", `Reddit r/${sub} sem posts — conferir o feed RSS e o rate limit`);
      }
    } catch {
      line("⚠️", paint(`reddit r/${sub}: não respondeu`, c.yellow));
    }
  }
}

// ── 8b. Segurança (self-monitoring, grátis) ──────────────────────────────────
// O que mata segurança é REGRESSÃO: um CVE novo, uma tabela nova sem RLS, ou um
// segredo commitado por engano. Este bloco pega os três sozinho a cada `pnpm doctor`.
function checkSecurity() {
  section("Segurança");

  // 1) Segredos no bundle do cliente (JWT service-role / chave secreta Stripe)
  const distDir = join(ROOT, "dist", "public");
  if (existsSync(distDir)) {
    const secretRe = /eyJhbG[A-Za-z0-9_-]{20}|sk_(live|test)_[A-Za-z0-9]{10}/;
    const leaks = walk(distDir, [".js", ".html", ".css"]).filter((f) => secretRe.test(read(f)));
    if (leaks.length > 0) { line("🔴", paint(`SEGREDO no bundle do cliente (${leaks.length} arquivo)`, c.red), "JWT service-role / chave Stripe exposta"); add("crit", "Segurança", `Segredo vazado no bundle: ${leaks.map(rel).join(", ")}`); }
    else line("✅", "Nenhum segredo (JWT service-role / Stripe) no bundle do cliente");
  } else {
    line("ℹ️", paint("dist/public ausente — rode `pnpm build` para checar o bundle", c.dim));
  }

  // 2) CVEs de dependência (pnpm audit)
  if (QUICK) {
    line("⏭️", paint("pnpm audit pulado (--quick)", c.dim));
  } else {
    try {
      execSync("pnpm audit --prod", { cwd: ROOT, stdio: "pipe", timeout: 90000 });
      line("✅", "Dependências sem vulnerabilidades conhecidas (pnpm audit)");
    } catch (e) {
      const out = (e.stdout?.toString() ?? "") + (e.stderr?.toString() ?? "");
      const crit = countMatches(out, /^\s*│?\s*critical/gim);
      const high = countMatches(out, /^\s*│?\s*high/gim);
      const bad = crit + high;
      // Também conta moderada/baixa: sem isso a linha dizia "0 crítica · 0 alta"
      // JUNTO de um aviso, e o leitor não tinha como saber o que foi encontrado —
      // parecia defeito do próprio doctor. O escopo é `--prod` de propósito: as
      // vulnerabilidades de babel/vite são de ferramenta de build e não vão para
      // produção, então contá-las só geraria alarme que ninguém pode agir.
      const mod = countMatches(out, /^\s*│?\s*moderate/gim);
      const low = countMatches(out, /^\s*│?\s*low/gim);
      const resumo = [
        crit > 0 && `${crit} crítica(s)`,
        high > 0 && `${high} alta(s)`,
        mod > 0 && `${mod} moderada(s)`,
        low > 0 && `${low} baixa(s)`,
      ].filter(Boolean).join(" · ") || "severidade não identificada na saída";
      line(bad > 0 ? "🔴" : "⚠️", paint(`Vulnerabilidades em dependências de produção: ${resumo}`, bad > 0 ? c.red : c.yellow), "rode `pnpm audit --prod` para detalhes/fix");
      add(bad > 0 ? "crit" : "warn", "Segurança", `Deps de produção vulneráveis (${resumo}) — pnpm audit --prod`);
    }
  }

  // 3) Cobertura de RLS: TODA tabela criada precisa ativar Row Level Security
  const migDir = join(ROOT, "supabase", "migrations");
  if (existsSync(migDir)) {
    const sql = walk(migDir, [".sql"]).map(read).join("\n");
    const created = new Set([...sql.matchAll(/create table\s+(?:if not exists\s+)?(?:public\.)?([a-z_]+)/gi)].map((m) => m[1].toLowerCase()));
    const rls = new Set([...sql.matchAll(/alter table\s+(?:public\.)?([a-z_]+)\s+enable row level security/gi)].map((m) => m[1].toLowerCase()));
    const missing = [...created].filter((t) => !rls.has(t));
    if (missing.length > 0) { line("🔴", paint(`Tabela(s) SEM RLS: ${missing.join(", ")}`, c.red), "chave anônima é pública → dados expostos"); add("crit", "Segurança", `Tabela sem RLS: ${missing.join(", ")} — ENABLE ROW LEVEL SECURITY`); }
    else line("✅", `RLS ativo em todas as ${created.size} tabelas`);
  }

  // 4) Headers de segurança (helmet) presentes
  const idx = read(join(SERVER, "index.ts"));
  /helmet\(/.test(idx)
    ? line("✅", "helmet ativo (CSP · HSTS · X-Frame-Options · nosniff)")
    : (line("⚠️", paint("helmet NÃO encontrado no server/index.ts", c.yellow)), add("warn", "Segurança", "helmet ausente — headers de segurança HTTP"));

  // 5) Hardening de runtime: rate-limit global + limite de body + Permissions-Policy
  const rl = /RL_MAX/.test(idx), body = /limit:\s*["']\d+kb/.test(idx), pp = /Permissions-Policy/.test(idx);
  (rl && body && pp)
    ? line("✅", "Runtime hardening: rate-limit global por IP · body ≤100kb · Permissions-Policy")
    : (line("⚠️", paint(`Hardening de runtime incompleto (rate-limit:${rl?"ok":"FALTA"} body:${body?"ok":"FALTA"} perm-policy:${pp?"ok":"FALTA"})`, c.yellow)), add("warn", "Segurança", "Runtime hardening incompleto no server/index.ts"));
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
  try { checkUnusedHooksAndLibs(); } catch (e) { add("warn", "Doctor", "checkUnusedHooksAndLibs falhou: " + e.message); }
  try { checkCentralizedFetch(); } catch (e) { add("warn", "Doctor", "checkCentralizedFetch falhou: " + e.message); }
  try { checkCodeSmells(); } catch (e) { add("warn", "Doctor", "checkCodeSmells falhou: " + e.message); }
  try { checkBigFiles(); } catch (e) { add("warn", "Doctor", "checkBigFiles falhou: " + e.message); }
  let env = {};
  try { env = checkEnv(); } catch (e) { add("warn", "Doctor", "checkEnv falhou: " + e.message); }
  try { await checkAnthropic(env); } catch (e) { add("warn", "Doctor", "checkAnthropic falhou: " + e.message); }
  try { await checkSupabase(env); } catch (e) { add("warn", "Doctor", "checkSupabase falhou: " + e.message); }
  try { await checkMarketFidelity(env); } catch (e) { add("warn", "Doctor", "checkMarketFidelity falhou: " + e.message); }
  try { checkSecurity(); } catch (e) { add("warn", "Doctor", "checkSecurity falhou: " + e.message); }
  try { checkInventory(); } catch (e) { add("warn", "Doctor", "checkInventory falhou: " + e.message); }
  const code = report();
  process.exit(code);
})();
