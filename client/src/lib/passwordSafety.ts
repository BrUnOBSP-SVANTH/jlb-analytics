/**
 * passwordSafety — bloqueia senhas fracas e JÁ VAZADAS no cadastro.
 *
 * Por que existe: o linter do Supabase apontou "Leaked Password Protection
 * disabled". Só que esse recurso é do plano PRO — no plano grátis ele nem
 * aparece no painel. Em vez de deixar o alerta em aberto até virar assinante,
 * implementamos a mesma proteção por conta própria: a API pública do
 * HaveIBeenPwned é gratuita e é exatamente o que o Supabase usa por baixo.
 *
 * PRIVACIDADE (k-anonimato — a senha NUNCA sai do navegador):
 * calculamos o SHA-1 localmente, enviamos apenas os 5 PRIMEIROS caracteres do
 * hash e recebemos de volta todos os sufixos que começam com esse prefixo. A
 * comparação final acontece aqui. O servidor deles não tem como saber qual
 * senha foi testada — nem sequer o hash completo.
 *
 * Falha ABERTA de propósito: se a API estiver fora do ar, o cadastro segue. Uma
 * verificação de conveniência não pode impedir alguém de criar conta.
 */

/** Senha precisa ter ao menos isto. A doc do próprio Supabase desaconselha < 8. */
export const MIN_PASSWORD_LEN = 8;

export interface PasswordVerdict {
  ok: boolean;
  reason?: string;
  /** Quantas vezes a senha apareceu em vazamentos conhecidos (0 = nenhuma). */
  breaches?: number;
}

/** Regras locais: comprimento e variedade. Instantâneo, sem rede. */
export function checkPasswordRules(pwd: string): PasswordVerdict {
  if (pwd.length < MIN_PASSWORD_LEN) {
    return { ok: false, reason: `Use pelo menos ${MIN_PASSWORD_LEN} caracteres.` };
  }
  const hasLetter = /[a-zA-Z]/.test(pwd);
  const hasNumber = /\d/.test(pwd);
  if (!hasLetter || !hasNumber) {
    return { ok: false, reason: "Combine letras e números — só um dos dois é fácil de adivinhar." };
  }
  // Sequências óbvias que passariam nas regras acima (ex.: "abcd1234").
  if (/^(.)\1+$/.test(pwd) || /12345|abcde|qwert|senha|password/i.test(pwd)) {
    return { ok: false, reason: "Essa senha é previsível demais. Evite sequências e palavras óbvias." };
  }
  return { ok: true };
}

/** SHA-1 via WebCrypto (nativo do navegador) → hex maiúsculo. */
async function sha1Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

/**
 * A senha aparece em vazamentos públicos? Devolve a contagem (0 = limpa).
 * `null` = não deu para verificar (rede/API fora) — o chamador deve deixar passar.
 */
export async function countBreaches(pwd: string): Promise<number | null> {
  try {
    const hash = await sha1Hex(pwd);
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      signal: AbortSignal.timeout(6_000),
    });
    if (!res.ok) return null;
    const body = await res.text();
    for (const line of body.split("\n")) {
      const [suf, count] = line.trim().split(":");
      if (suf === suffix) return Number(count) || 0;
    }
    return 0;
  } catch {
    return null; // falha aberta: não trava o cadastro
  }
}

/** Veredito completo: regras locais + checagem de vazamento. */
export async function checkPassword(pwd: string): Promise<PasswordVerdict> {
  const local = checkPasswordRules(pwd);
  if (!local.ok) return local;

  const breaches = await countBreaches(pwd);
  if (breaches === null) return { ok: true }; // API indisponível → segue
  if (breaches > 0) {
    return {
      ok: false,
      breaches,
      reason: `Esta senha já apareceu em ${breaches.toLocaleString("pt-BR")} vazamentos de dados. `
        + "Ela está em listas usadas por invasores — escolha outra.",
    };
  }
  return { ok: true, breaches: 0 };
}
