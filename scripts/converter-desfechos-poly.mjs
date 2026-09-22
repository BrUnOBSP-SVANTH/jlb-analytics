#!/usr/bin/env node
/**
 * Converte as previsões de desfecho do Polymarket que estão presas.
 *
 * O QUE ACONTECEU (Auditoria 21/09, DAD-03). Ao registrar uma previsão sobre um
 * desfecho — "Democratic Presidential Nominee 2028 — Alexandria Ocasio-Cortez" —
 * a tela guardava em `outcome_id` o TOKEN CLOB daquele desfecho. Token é
 * identificador de negociação: não é um mercado, não tem resultado oficial e não
 * pode ser consultado em lugar nenhum. `idDeLiquidacao` devolvia `null`, o job
 * das 6h pulava a linha, e a previsão ficava `resolved=false` para sempre.
 *
 * Cada desfecho de um evento negRisk É um mercado binário, com id próprio. O
 * gamma sabe fazer a ponte: `markets?clob_token_ids=<token>` devolve o mercado
 * dono daquele token. Este script faz essa tradução nas linhas já gravadas.
 *
 * Uso:
 *   node scripts/converter-desfechos-poly.mjs            # só mostra o que faria
 *   node scripts/converter-desfechos-poly.mjs --aplicar  # grava
 *
 * Não inventa nada: token que o gamma não reconhecer fica como está, e a linha
 * segue pendente — melhor pendente do que liquidada contra o mercado errado.
 */
import { readFileSync } from "node:fs";

// .env é lido à mão para o script rodar sem depender do bootstrap do servidor.
for (const linha of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
  const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const URL_SUPA = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const CHAVE = process.env.SUPABASE_SERVICE_KEY ?? "";
if (!URL_SUPA || !CHAVE) {
  console.error("Faltam SUPABASE_URL e SUPABASE_SERVICE_KEY — sem elas não dá para ler nem gravar.");
  process.exit(1);
}

const APLICAR = process.argv.includes("--aplicar");
const cab = { apikey: CHAVE, Authorization: `Bearer ${CHAVE}`, "Content-Type": "application/json" };

/** Token CLOB: uint256, sempre com muito mais dígitos que um id de mercado. */
const EH_TOKEN = (s) => /^\d{15,}$/.test(String(s ?? ""));

/** O mercado dono de um token, pelo gamma. `null` quando ele não reconhece. */
async function mercadoDoToken(token) {
  try {
    const r = await fetch(`https://gamma-api.polymarket.com/markets?clob_token_ids=${encodeURIComponent(token)}`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) return null;
    const lista = await r.json();
    const id = Array.isArray(lista) && lista[0]?.id ? String(lista[0].id) : "";
    return id || null;
  } catch { return null; }
}

async function tabela(nome, colunas) {
  const r = await fetch(`${URL_SUPA}/rest/v1/${nome}?select=${colunas}&outcome_id=not.is.null&limit=1000`, { headers: cab });
  if (!r.ok) { console.error(`  ⚠️  não consegui ler ${nome}: HTTP ${r.status}`); return []; }
  return r.json();
}

async function gravar(nome, id, idDoMercado) {
  const r = await fetch(`${URL_SUPA}/rest/v1/${nome}?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH", headers: { ...cab, Prefer: "return=minimal" },
    body: JSON.stringify({ outcome_id: idDoMercado }),
  });
  return r.ok;
}

console.log(APLICAR ? "Convertendo (GRAVANDO)…\n" : "Simulação — nada será gravado. Use --aplicar para valer.\n");

let presas = 0, convertidas = 0, semResposta = 0;

// Só `predictions`. A banca simulada (`paper_bets`) é SIM/NÃO sobre o mercado —
// não tem coluna de desfecho, então nada ali ficou preso por este defeito.
for (const [nome, colunas] of [["predictions", "id,market_id,market_question,outcome_id"]]) {
  const linhas = await tabela(nome, colunas);
  const alvo = linhas.filter((l) => String(l.market_id ?? "").startsWith("poly-") && EH_TOKEN(l.outcome_id));
  if (linhas.length === 0 && alvo.length === 0) { console.log(`${nome}: nada a fazer`); continue; }
  console.log(`${nome}: ${alvo.length} de ${linhas.length} com token CLOB no lugar do mercado`);

  for (const l of alvo) {
    presas++;
    const idDoMercado = await mercadoDoToken(l.outcome_id);
    const titulo = String(l.market_question ?? "").slice(0, 55);
    if (!idDoMercado) {
      semResposta++;
      console.log(`  ⚠️  ${titulo} — o gamma não reconheceu o token; fica como está`);
      continue;
    }
    if (APLICAR) {
      const ok = await gravar(nome, l.id, idDoMercado);
      console.log(`  ${ok ? "✅" : "❌"} ${titulo} → outcome_id = ${idDoMercado}`);
      if (ok) convertidas++;
    } else {
      console.log(`  → ${titulo}: ${String(l.outcome_id).slice(0, 12)}… vira ${idDoMercado}`);
      convertidas++;
    }
  }
}

console.log(`\n${presas} previsões presas · ${convertidas} ${APLICAR ? "convertidas" : "conversíveis"} · ${semResposta} sem resposta do gamma`);
if (!APLICAR && convertidas > 0) console.log("Rode de novo com --aplicar para gravar.");
