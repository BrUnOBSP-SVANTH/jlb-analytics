#!/usr/bin/env node
/**
 * Tenta forjar o ranking — e exige que o banco recuse.
 *
 * POR QUE EXISTE (Auditoria 21/09, SEG-01). O teste de `supabase/migrations.test.ts`
 * lê o FONTE da migration: ele garante que a regra está escrita. Só que o banco
 * de produção pode estar diferente do arquivo — a migration pode não ter sido
 * aplicada, alguém pode ter mexido no painel, um GRANT pode ter voltado. A
 * única prova de que o buraco está fechado é tentar entrar por ele.
 *
 * O roteiro é o do atacante descrito no achado:
 *   1. inserir uma previsão JÁ RESOLVIDA e certeira;
 *   2. alterar o resultado de uma previsão existente;
 *   3. apagar uma previsão resolvida (sumir com o erro);
 *   4. inserir uma aposta da banca já paga.
 * Cada uma dessas coisas fabrica um `avg_brier_score` perfeito, que é o que o
 * Leaderboard publica.
 *
 * Usa uma conta descartável, criada e APAGADA aqui mesmo. Nada toca a conta de
 * ninguém real.
 *
 * Uso: node scripts/provar-travas.mjs
 */
import { readFileSync } from "node:fs";

for (const linha of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
  const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const URL_SUPA = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const SERVICO = process.env.SUPABASE_SERVICE_KEY ?? "";
const ANON = process.env.VITE_SUPABASE_ANON_KEY ?? "";
if (!URL_SUPA || !SERVICO || !ANON) {
  console.error("Faltam SUPABASE_URL, SUPABASE_SERVICE_KEY e VITE_SUPABASE_ANON_KEY.");
  process.exit(1);
}

const cabServico = { apikey: SERVICO, Authorization: `Bearer ${SERVICO}`, "Content-Type": "application/json" };
const EMAIL = `trava-${Date.now()}@jlb-teste.invalid`;
const SENHA = `Tr4v4-${Math.random().toString(36).slice(2, 12)}!`;

let falhas = 0;
const marcar = (ok, titulo, detalhe = "") => {
  if (!ok) falhas++;
  console.log(`  ${ok ? "✅" : "🔴"} ${titulo}${detalhe ? ` — ${detalhe}` : ""}`);
};

// ── conta descartável ────────────────────────────────────────────────────────

async function criarUsuario() {
  const r = await fetch(`${URL_SUPA}/auth/v1/admin/users`, {
    method: "POST", headers: cabServico,
    body: JSON.stringify({ email: EMAIL, password: SENHA, email_confirm: true }),
  });
  if (!r.ok) throw new Error(`não consegui criar a conta de teste: ${r.status} ${await r.text()}`);
  return (await r.json()).id;
}

async function entrar() {
  const r = await fetch(`${URL_SUPA}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: SENHA }),
  });
  if (!r.ok) throw new Error(`não consegui entrar: ${r.status} ${await r.text()}`);
  return (await r.json()).access_token;
}

async function apagarUsuario(id) {
  await fetch(`${URL_SUPA}/auth/v1/admin/users/${id}`, { method: "DELETE", headers: cabServico });
}

// ── o roteiro do atacante ────────────────────────────────────────────────────

const ID_PREVISAO = crypto.randomUUID();

async function comoUsuario(jwt, caminho, init = {}) {
  return fetch(`${URL_SUPA}/rest/v1/${caminho}`, {
    ...init,
    headers: { apikey: ANON, Authorization: `Bearer ${jwt}`, "Content-Type": "application/json", Prefer: "return=representation", ...(init.headers ?? {}) },
  });
}

const usuarioId = await criarUsuario();
console.log(`Conta descartável criada (${EMAIL}).\n`);

try {
  const jwt = await entrar();

  // 1. Inserir uma previsão já resolvida e certeira.
  const r1 = await comoUsuario(jwt, "predictions", {
    method: "POST",
    body: JSON.stringify({
      id: ID_PREVISAO, user_id: usuarioId,
      market_id: "poly-forjada", market_question: "Previsão forjada pelo teste de travas",
      market_prob: 50, user_prob: 99,
      resolved: true, outcome: true, resolution_source: "settled",
      resolved_at: new Date().toISOString(), created_at: "2020-01-01T00:00:00Z",
    }),
  });
  const linha = r1.ok ? (await r1.json())[0] : null;
  if (!linha) {
    marcar(false, "INSERT recusado por completo", `HTTP ${r1.status} — o teste não consegue seguir`);
  } else {
    marcar(linha.resolved === false && linha.outcome === null,
      "previsão nasce PENDENTE, mesmo pedindo resolvida",
      `banco gravou resolved=${linha.resolved} outcome=${linha.outcome}`);
    marcar(new Date(linha.created_at).getFullYear() >= 2026,
      "a data é a do servidor, não a que o cliente mandou",
      `created_at=${linha.created_at}`);
  }

  // 2. Alterar o resultado de uma previsão existente.
  const r2 = await comoUsuario(jwt, `predictions?id=eq.${ID_PREVISAO}`, {
    method: "PATCH", body: JSON.stringify({ resolved: true, outcome: true, user_prob: 99 }),
  });
  const mudou = r2.ok ? (await r2.json()).length > 0 : false;
  marcar(!mudou, "UPDATE do resultado é recusado", `HTTP ${r2.status}`);

  // 3. Apagar uma previsão RESOLVIDA (sumir com o erro).
  //    Resolve pela chave de serviço, como o job das 6h faria, e então tenta.
  //
  //    ⚠️ O resultado do preparo é CONFERIDO. Sem isso, um preparo que falhasse
  //    em silêncio deixaria a linha pendente — e o teste acusaria um buraco que
  //    não existe, que é a pior coisa que um teste de segurança pode fazer.
  const prep = await fetch(`${URL_SUPA}/rest/v1/predictions?id=eq.${ID_PREVISAO}`, {
    method: "PATCH", headers: { ...cabServico, Prefer: "return=representation" },
    body: JSON.stringify({ resolved: true, outcome: false, resolution_source: "settled" }),
  });
  const corpoPrep = await prep.text();
  const preparada = prep.ok ? (JSON.parse(corpoPrep)[0] ?? null) : null;
  if (!preparada || preparada.resolved !== true) {
    marcar(false, "PREPARO do teste falhou: não consegui resolver a previsão pela chave de serviço",
      `HTTP ${prep.status} ${corpoPrep.slice(0, 220)}`);
  } else {
    const r3 = await comoUsuario(jwt, `predictions?id=eq.${ID_PREVISAO}`, { method: "DELETE" });
    // O PostgREST responde 200 mesmo quando a RLS não deixa NENHUMA linha ser
    // apagada — quem conta a verdade é o número de linhas devolvidas.
    const apagadas = r3.ok ? (await r3.json()).length : 0;
    marcar(apagadas === 0, "apagar previsão RESOLVIDA é recusado", `${apagadas} linha(s) apagada(s)`);
  }

  // 3b. …mas apagar o que está EM ABERTO continua funcionando (mudar de ideia é legítimo).
  const idAberta = crypto.randomUUID();
  await comoUsuario(jwt, "predictions", {
    method: "POST",
    body: JSON.stringify({ id: idAberta, user_id: usuarioId, market_id: "poly-1", market_question: "Em aberto", market_prob: 50, user_prob: 60 }),
  });
  const r3b = await comoUsuario(jwt, `predictions?id=eq.${idAberta}`, { method: "DELETE" });
  marcar(r3b.ok && (await r3b.json()).length > 0, "apagar previsão EM ABERTO continua permitido");

  // 4. Inserir uma aposta da banca já paga.
  const r4 = await comoUsuario(jwt, "paper_bets", {
    method: "POST",
    body: JSON.stringify({
      user_id: usuarioId, market_id: "poly-forjada", market_question: "Aposta forjada",
      source: "polymarket", side: "sim", entry_price: 0.01, stake: 100,
      resolved: true, outcome: true, payout: 10_000, settled_at: new Date().toISOString(),
    }),
  });
  const aposta = r4.ok ? (await r4.json())[0] : null;
  if (!aposta) marcar(false, "INSERT em paper_bets recusado por completo", `HTTP ${r4.status}`);
  else marcar(aposta.resolved === false && aposta.payout === null,
    "aposta nasce EM ABERTO, sem prêmio escolhido pelo cliente",
    `banco gravou resolved=${aposta.resolved} payout=${aposta.payout}`);

} finally {
  // A conta leva junto as linhas dela (FK em cascata); a limpeza é pela chave
  // de serviço, que é a única que pode apagar previsão resolvida.
  await fetch(`${URL_SUPA}/rest/v1/predictions?user_id=eq.${usuarioId}`, { method: "DELETE", headers: cabServico });
  await fetch(`${URL_SUPA}/rest/v1/paper_bets?user_id=eq.${usuarioId}`, { method: "DELETE", headers: cabServico });
  await apagarUsuario(usuarioId);
  console.log("\nConta descartável apagada.");
}

console.log(falhas === 0
  ? "\n✅ O banco recusou todas as tentativas de forjar o ranking."
  : `\n🔴 ${falhas} tentativa(s) PASSARAM — o ranking pode ser forjado.`);
process.exit(falhas === 0 ? 0 : 1);
