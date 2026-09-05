/**
 * cerebro-limpeza.mjs — conta (ou remove) a notícia velha demais para servir.
 *
 * Uso:
 *   pnpm cerebro:limpeza            # só CONTA — não apaga nada
 *   pnpm cerebro:limpeza --aplicar  # apaga de verdade
 *   pnpm cerebro:limpeza --dias 120 # muda a régua
 *
 * O padrão é contar porque apagar é irreversível: ver o número antes é o mínimo.
 */
import { readFileSync } from "node:fs";

const env = Object.fromEntries(readFileSync(".env", "utf8").split("\n")
  .filter((l) => l.trim() && !l.startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
for (const k of Object.keys(env)) process.env[k] = env[k];

const aplicar = process.argv.includes("--aplicar");
const iDias = process.argv.indexOf("--dias");
const dias = iDias > -1 ? Number(process.argv[iDias + 1]) : 90;

const { limparArtigosAntigos, RETENCAO_DIAS } = await import("../server/lib/cerebroLimpeza.ts");

console.log(`\n  régua: artigos com mais de ${dias} dias (padrão ${RETENCAO_DIAS})`);
console.log(`  modo:  ${aplicar ? "APLICAR — vai apagar" : "só contagem (use --aplicar para apagar)"}\n`);

const r = await limparArtigosAntigos({ aplicar, dias });
if (r.erro) { console.log(`  ❌ ${r.erro}`); process.exit(1); }

console.log(`  candidatos ao descarte: ${r.candidatos.toLocaleString("pt-BR")} artigos`);
console.log(`  espaço estimado ......: ~${r.espacoLiberadoMb} MB`);
console.log(r.apagados > 0
  ? `\n  ✅ ${r.apagados.toLocaleString("pt-BR")} artigos removidos.`
  : aplicar ? `\n  nada a remover.` : `\n  nada foi apagado. Rode com --aplicar para efetivar.`);
