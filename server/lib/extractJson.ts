import { log } from "./log.ts";
/**
 * extractJson — extração robusta de JSON de respostas do Claude.
 *
 * Lida com 3 realidades das respostas de LLM:
 *  1. Cercas markdown (```json … ```) → removidas.
 *  2. Preâmbulo antes do JSON ("Aqui está: { … }") → acha o 1º `{`.
 *  3. Truncamento por max_tokens (JSON cortado no meio) → salva o que deu,
 *     fechando strings/brackets abertos e descartando o último campo incompleto.
 *
 * O caminho feliz (JSON bem-formado) é idêntico a um JSON.parse direto;
 * o salvamento só roda quando o parse normal falharia.
 */

/**
 * Tenta fechar um fragmento de JSON truncado e parseá-lo.
 * Re-caminha o fragmento para descobrir strings/brackets abertos no ponto de
 * corte, fecha-os e tenta JSON.parse. Retorna null se não parsear.
 */
export function tryCloseAndParse(fragment: string): Record<string, unknown> | null {
  let inString = false, escape = false;
  const stack: string[] = [];
  for (let i = 0; i < fragment.length; i++) {
    const ch = fragment[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\" && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{" || ch === "[") stack.push(ch);
    else if (ch === "}" || ch === "]") stack.pop();
  }
  let s = fragment;
  if (inString) s += '"';            // fecha string aberta
  s = s.replace(/\s+$/, "");
  if (/:\s*$/.test(s)) s += "null";  // chave sem valor → null
  else s = s.replace(/,\s*$/, "");   // vírgula pendente → remove
  for (let i = stack.length - 1; i >= 0; i--) s += stack[i] === "{" ? "}" : "]";
  try { return JSON.parse(s) as Record<string, unknown>; } catch { return null; }
}

export function extractJson(raw: string): Record<string, unknown> {
  // Strip markdown code fences
  const stripped = raw.replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim();
  // Find start of first JSON object
  const start = stripped.indexOf("{");
  if (start === -1) {
    log.error("[extractJson] Claude returned no JSON. Raw (first 300 chars):", stripped.slice(0, 300));
    throw new Error("No JSON found in Claude response");
  }
  // Walk forward com pilha completa de brackets ({ e [) para achar o fechamento correto
  const stack: string[] = [];
  let inString = false;
  let escape = false;
  let end = -1;
  for (let i = start; i < stripped.length; i++) {
    const ch = stripped[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\" && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{" || ch === "[") stack.push(ch);
    else if (ch === "}" || ch === "]") { stack.pop(); if (stack.length === 0) { end = i; break; } }
  }
  // Caminho feliz: JSON bem-formado e completo
  if (end !== -1) return JSON.parse(stripped.slice(start, end + 1)) as Record<string, unknown>;

  // JSON truncado (resposta cortada por max_tokens): salva o que der.
  // Tenta fechar como está; se não parsear, descarta o último campo incompleto e repete.
  let frag = stripped.slice(start);
  for (let attempt = 0; attempt < 8; attempt++) {
    const obj = tryCloseAndParse(frag);
    if (obj && Object.keys(obj).length > 0) {
      log.warn(`[extractJson] JSON truncado recuperado (tentativa ${attempt + 1}, ${Object.keys(obj).length} campos).`);
      return obj;
    }
    const lastComma = frag.lastIndexOf(",");
    if (lastComma === -1) break;
    frag = frag.slice(0, lastComma);
  }
  log.error("[extractJson] Claude returned no JSON. Raw (first 300 chars):", stripped.slice(0, 300));
  throw new Error("No JSON found in Claude response");
}
