/**
 * ai-bakeoff.mjs — qual modelo GRÁTIS prevê melhor? Medido, não chutado.
 *
 * Contexto: com a Anthropic sem crédito, o primário virou o Gemini Flash LITE —
 * escolhido por causa de COTA, não de qualidade. Enquanto isso o Groq (gpt-oss-120b)
 * está como 3º reserva. Pode ser que o melhor modelo disponível esteja no banco.
 *
 * Este script resolve a dúvida com dado: pega mercados JÁ RESOLVIDOS pelo
 * settlement oficial, pede a cada modelo o fair value com o MESMO prompt do seed,
 * e compara o Brier de cada um contra o resultado real — tendo o próprio mercado
 * como baseline.
 *
 * ⚠️ VIÉS CONHECIDO (não escondido): são eventos passados; um modelo pode
 * "lembrar" do desfecho, o que deixa o Brier absoluto otimista. Como TODOS os
 * modelos enfrentam o mesmo viés, a COMPARAÇÃO entre eles continua útil — é para
 * isso que serve. O número final honesto virá do track record ao vivo.
 *
 * Uso: node scripts/ai-bakeoff.mjs [--n 30]
 */
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const N = Number(arg("n", "30"));

const env = Object.fromEntries(
  readFileSync(".env", "utf8").split("\n")
    .filter((l) => l.trim() && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const SUPABASE_URL = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_SERVICE_KEY;
const GEMINI_KEY = env.GEMINI_API_KEY;
const GROQ_KEY = env.GROQ_API_KEY;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Provedores sob teste ─────────────────────────────────────────────────────

async function askGemini(model, system, prompt) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        system_instruction: { parts: [{ text: system }] },
        generationConfig: { maxOutputTokens: 1024, thinkingConfig: { thinkingLevel: "low" } },
      }),
      signal: AbortSignal.timeout(40_000),
    },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const d = await res.json();
  return (d.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
}

async function askGroq(model, system, prompt) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${GROQ_KEY}` },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: system }, { role: "user", content: prompt }],
      max_tokens: 1024, temperature: 0.3,
    }),
    signal: AbortSignal.timeout(40_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const d = await res.json();
  return d.choices?.[0]?.message?.content ?? "";
}

const PROVIDERS = [
  { id: "gemini-flash-lite (ATUAL)", ask: (s, p) => askGemini("gemini-flash-lite-latest", s, p), pause: 4000 },
  { id: "gemini-flash",              ask: (s, p) => askGemini("gemini-flash-latest", s, p),      pause: 4000 },
  { id: "groq gpt-oss-120b",         ask: (s, p) => askGroq("openai/gpt-oss-120b", s, p),        pause: 800 },
  { id: "groq gpt-oss-20b",          ask: (s, p) => askGroq("openai/gpt-oss-20b", s, p),         pause: 800 },
  { id: "groq qwen3.8-27b",          ask: (s, p) => askGroq("qwen/qwen3.8-27b", s, p),           pause: 800 },
];

// ── Amostra: mercados resolvidos pelo settlement OFICIAL ─────────────────────

async function loadSample() {
  const url = `${SUPABASE_URL}/rest/v1/ai_forecasts`
    + `?resolved=eq.true&outcome=not.is.null&resolution_source=eq.settled`
    + `&select=market_id,title,category,market_prob,outcome&order=resolved_at.desc&limit=400`;
  const r = await fetch(url, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } });
  const rows = await r.json();
  // 1 por mercado + descarta quase-resolvidos (preço já colado em 0/100 não testa nada)
  const seen = new Set();
  const pool = rows.filter((x) => {
    if (seen.has(x.market_id)) return false;
    seen.add(x.market_id);
    const p = Number(x.market_prob);
    return p >= 10 && p <= 90;
  });
  // Espalha na lista para não pegar só um tema
  const step = Math.max(1, Math.floor(pool.length / N));
  return pool.filter((_, i) => i % step === 0).slice(0, N);
}

const SYSTEM = "Você é um analista quantitativo. Responda APENAS JSON, sem markdown.";
const promptFor = (m) => `Mercado preditivo: "${m.title}"
Categoria: ${m.category ?? "other"}
Preço atual do mercado: ${Math.round(Number(m.market_prob))}%

Dê SUA melhor estimativa honesta da probabilidade real de SIM (5-95).
Pode divergir do preço — é assim que se encontra valor.
JSON apenas: {"fairValue": <inteiro 5-95>, "confidence": "baixa|media|alta"}`;

/**
 * Extração robusta. A 1ª rodada teve 11–18 falhas por modelo, o que estilhaçou a
 * amostra e INVALIDOU a comparação (cada um respondeu um subconjunto diferente).
 * Agora: aceita cerca de markdown, pega o ÚLTIMO objeto JSON (modelos que "pensam"
 * em voz alta emitem JSON no fim) e cai para um número solto como último recurso.
 */
function parseFv(text) {
  if (!text) return null;
  const clean = text.replace(/```json?/gi, "").replace(/```/g, "");
  const objs = clean.match(/\{[^{}]*\}/g) ?? [];
  for (const o of objs.reverse()) {
    try {
      const v = Math.round(Number(JSON.parse(o).fairValue));
      if (Number.isFinite(v) && v >= 1 && v <= 99) return v;
    } catch { /* tenta o próximo */ }
  }
  const loose = clean.match(/"?fairValue"?\s*[:=]\s*(\d{1,2})/i);
  if (loose) {
    const v = Number(loose[1]);
    if (v >= 1 && v <= 99) return v;
  }
  return null;
}

// clampFairValue do site (guardrails.ts) — testamos o modelo COMO ELE RODA em produção
function clamp(raw, market, maxDev = 15, min = 5, max = 95) {
  const dev = Math.min(maxDev, Math.max(5, Math.min(market, 100 - market)));
  return Math.max(min, Math.min(max, Math.max(market - dev, Math.min(market + dev, raw))));
}

(async () => {
  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║  BAKE-OFF DE MODELOS GRÁTIS — qual prevê melhor?           ║");
  console.log("╚════════════════════════════════════════════════════════════╝");

  const sample = await loadSample();
  console.log(`  amostra: ${sample.length} mercados resolvidos pelo settlement OFICIAL`);
  console.log(`  (preço entre 10% e 90% — quase-resolvidos não testam nada)\n`);
  if (sample.length < 10) { console.log("  amostra insuficiente."); process.exit(0); }

  const results = {};
  for (const p of PROVIDERS) {
    const preds = [];
    let fails = 0;
    process.stdout.write(`  ${p.id.padEnd(28)} `);
    for (const m of sample) {
      let raw = null;
      // 1 retry: falha transitória não pode custar o mercado inteiro (foi o que
      // estilhaçou a amostra na 1ª rodada e inviabilizou a comparação).
      for (let attempt = 0; attempt < 2 && raw === null; attempt++) {
        try { raw = parseFv(await p.ask(SYSTEM, promptFor(m))); }
        catch { if (attempt === 0) await sleep(p.pause); }
      }
      if (raw === null) { fails++; preds.push(null); }
      else preds.push(clamp(raw, Math.round(Number(m.market_prob))));
      process.stdout.write(raw === null ? "x" : ".");
      await sleep(p.pause);
    }
    results[p.id] = { preds, fails };
    process.stdout.write(` ok (${fails} falhas)\n`);
  }

  // ── Placar — SÓ no subconjunto COMUM ──
  // Sem isto a comparação é inválida: na 1ª rodada cada modelo respondeu um
  // conjunto diferente e o "vencedor" era só quem pegou as perguntas fáceis (dava
  // para ver pela baseline do mercado variando de 0.12 a 0.22 entre as linhas).
  const commonIdx = sample
    .map((_, i) => i)
    .filter((i) => Object.values(results).every((r) => r.preds[i] !== null));
  console.log(`\n  Subconjunto COMUM (todos responderam): ${commonIdx.length} de ${sample.length} mercados`);
  if (commonIdx.length < 10) {
    console.log("  ⚠️  Comum pequeno demais para comparar com honestidade. Aumente --n ou revise falhas.\n");
  }

  const brier = (p, y) => (p / 100 - y) ** 2;
  const rows = [];
  for (const [id, { preds, fails }] of Object.entries(results)) {
    const pairs = commonIdx.map((i) => ({ fv: preds[i], m: sample[i] }));
    if (pairs.length === 0) { rows.push({ id, n: 0 }); continue; }
    const ai = pairs.reduce((a, x) => a + brier(x.fv, x.m.outcome ? 1 : 0), 0) / pairs.length;
    const mkt = pairs.reduce((a, x) => a + brier(Number(x.m.market_prob), x.m.outcome ? 1 : 0), 0) / pairs.length;
    const hits = pairs.filter((x) => x.fv !== 50 && (x.fv > 50) === !!x.m.outcome).length;
    const sided = pairs.filter((x) => x.fv !== 50).length;
    rows.push({ id, n: pairs.length, fails, ai, mkt, skill: 1 - ai / mkt, acc: sided ? (hits / sided) * 100 : 0 });
  }

  console.log("\n  ┌──────────────────────────────┬─────┬────────┬────────┬──────────┬─────────┐");
  console.log("  │ Modelo                       │   n │  Brier │ Mercado│ vs merc. │ Acerto  │");
  console.log("  ├──────────────────────────────┼─────┼────────┼────────┼──────────┼─────────┤");
  for (const r of rows.sort((a, b) => (a.ai ?? 9) - (b.ai ?? 9))) {
    if (!r.n) { console.log(`  │ ${r.id.padEnd(28)} │  —  │ sem resposta válida                    │`); continue; }
    const sk = `${r.skill >= 0 ? "+" : ""}${(r.skill * 100).toFixed(1)}%`;
    console.log(`  │ ${r.id.padEnd(28)} │ ${String(r.n).padStart(3)} │ ${r.ai.toFixed(4)} │ ${r.mkt.toFixed(4)} │ ${sk.padStart(8)} │ ${r.acc.toFixed(1).padStart(6)}% │`);
  }
  console.log("  └──────────────────────────────┴─────┴────────┴────────┴──────────┴─────────┘");
  console.log("\n  Brier menor = melhor. 'vs merc.' positivo = bateu o próprio mercado.");
  console.log("  ⚠️ Eventos passados: o modelo pode lembrar do desfecho, então o Brier");
  console.log("     absoluto é otimista. Todos enfrentam o mesmo viés — a COMPARAÇÃO vale.\n");
})();
