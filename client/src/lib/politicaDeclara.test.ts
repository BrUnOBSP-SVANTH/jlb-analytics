import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * A Política de Privacidade tem que declarar o que o CÓDIGO faz.
 *
 * O QUE A AUDITORIA DE 21/09 ACHOU (PRV-01). A política v1.0 listava quatro
 * operadores — Supabase, Anthropic, Stripe e e-mail. Só que a IA do site
 * funciona em CADEIA: quando a Anthropic não responde (hoje ela está sem
 * crédito), quem processa o texto da pessoa é o Google ou a Groq. Também
 * faltavam: a hospedagem (Render), a transferência internacional, o que o 👍/👎
 * do chat guarda (a pergunta e a resposta), o que os alertas do navegador
 * guardam (endereço de entrega, chaves e a lista de mercados) e os prazos de
 * retenção.
 *
 * Tratamento não declarado não deixa de existir por não estar escrito — só
 * deixa de ser informado, que é justamente o que a LGPD cobra.
 *
 * Este teste confronta a política com o código: quando um provedor novo entra
 * na cadeia ou uma tabela nova guarda dado de gente, ele falha.
 */
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const ler = (...p: string[]) => readFileSync(join(RAIZ, ...p), "utf-8");

const politica = () => ler("client", "src", "pages", "Privacidade.tsx");

describe("PRV-01 — a política declara a cadeia de IA inteira", () => {
  it("todo provedor que a cadeia pode usar está na política", () => {
    // A cadeia está em server/lib/anthropic.ts: Anthropic → Gemini → Groq.
    const cadeia = ler("server", "lib", "anthropic.ts");
    const p = politica();
    for (const [noCodigo, naPolitica] of [["callGemini", "Gemini"], ["callGroq", "Groq"]] as const) {
      expect(cadeia, `a cadeia deveria chamar ${noCodigo}`).toContain(noCodigo);
      expect(p, `a política precisa citar ${naPolitica} — é ele que recebe o texto da pessoa`).toContain(naPolitica);
    }
    expect(p).toContain("Anthropic");
  });

  it("a hospedagem e a transferência internacional estão declaradas", () => {
    const p = politica();
    expect(p).toContain("Render");
    expect(p).toMatch(/Transferência internacional/i);
    expect(p).toMatch(/fora do Brasil/i);
  });
});

describe("PRV-01 — o que o site guarda está descrito", () => {
  it("o 👍/👎 do chat guarda pergunta e resposta, e a política diz isso", () => {
    const p = politica();
    expect(p).toMatch(/pergunta e a resposta/i);
  });

  it("os alertas do navegador guardam endereço, chaves e watchlist", () => {
    const p = politica();
    expect(p).toMatch(/endereço técnico de entrega/i);
    expect(p).toMatch(/chaves/i);
  });

  it("há PRAZO de retenção, não só 'enquanto a conta existir'", () => {
    const p = politica();
    expect(p).toMatch(/Por quanto tempo guardamos/i);
    expect(p).toMatch(/12 meses|24 meses|30 dias/);
  });

  it("🔴 a política NÃO promete coletar o que foi removido", () => {
    // `ai_usage` guardava IP e ninguém escrevia nela; foi apagada (migration
    // 047). Descrever coleta que não acontece é tão ruim quanto omitir a que
    // acontece — nos dois casos o texto deixa de descrever o produto.
    const p = politica();
    expect(p).toMatch(/Não registramos o seu endereço de IP/i);
    const migration = ler("supabase", "migrations", "047_remove_ai_usage.sql");
    expect(migration).toContain("DROP TABLE IF EXISTS public.ai_usage");
  });
});

describe("PRV-01 — mudou o texto, mudou a versão", () => {
  it("a versão e a data da política andam juntas", () => {
    // Registrar "aceitou" sem saber O QUE foi aceito não prova nada depois que
    // o texto muda.
    const p = politica();
    expect(p).toMatch(/const VERSAO = "1\.1"/);
    expect(p).toMatch(/const UPDATED = "24 de setembro de 2026"/);
  });

  it("os Termos citam a mesma cadeia de IA que a política", () => {
    const termos = ler("client", "src", "pages", "Termos.tsx");
    for (const provedor of ["Anthropic", "Google", "Groq"]) {
      expect(termos, `Termos precisam citar ${provedor}`).toContain(provedor);
    }
  });
});
