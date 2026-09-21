/**
 * De QUEM é a cota grátis: da pessoa, não da conta.
 *
 * O QUE ISTO FECHA (decidido pelo fundador em 21/09/2026: "temos que resolver
 * isso o quanto antes"). A cota era por conta, e conta nova custava só um
 * e-mail. O cadastro exige confirmar o e-mail (mailer_autoconfirm = false),
 * então o caminho barato para somar cotas era um só: uma caixa de e-mail que
 * recebe por vários endereços.
 *
 *  · Gmail ignora pontos e tudo depois do "+": joao+1@gmail.com,
 *    joao+2@gmail.com e j.o.a.o@gmail.com chegam na MESMA caixa. Uma pessoa,
 *    contas infinitas.
 *  · E-mail temporário (10 minutos, mailinator...) dá uma caixa nova por clique.
 *
 * A regra aqui: o e-mail é NORMALIZADO antes de virar identidade, e todas as
 * contas que caem na mesma caixa dividem as mesmas análises do mês. E-mail
 * temporário não usa a IA. Quem entra pelo Google já chega com uma conta que
 * custa telefone para criar — por isso é a saída que a tela oferece.
 *
 * PRIVACIDADE: a identidade é um HASH do e-mail normalizado. O banco da cota
 * nunca guarda o e-mail — só a impressão digital que permite dizer "é a mesma
 * caixa", e nada além disso.
 */
import { createHash } from "node:crypto";
import { createRequire } from "node:module";

// ⚠️ NÃO trocar por `import lista from "disposable-email-domains"`. O pacote
// aponta para um index.json, e o servidor de produção é um bundle ESM: o Node
// recusa importar JSON sem `with { type: "json" }` e o site NÃO SOBE
// (ERR_IMPORT_ATTRIBUTE_MISSING — visto em 21/09/2026 ao rodar dist/index.js;
// testes e tsc passavam, porque o Vitest transforma o import). O `require` do
// CommonJS lê JSON sempre, e só roda na primeira consulta.
const requerer = createRequire(import.meta.url);

/** Provedores onde o ponto no nome não muda a caixa (só o Google faz isso). */
const IGNORA_PONTO = new Set(["gmail.com"]);
const APELIDO_DE_DOMINIO: Record<string, string> = { "googlemail.com": "gmail.com" };

/**
 * O endereço que de fato recebe a mensagem. Tira o "+etiqueta" (Gmail,
 * Outlook, iCloud, Proton e outros entregam na mesma caixa) e, no Gmail, os
 * pontos. Devolve `null` para o que não é e-mail.
 */
export function emailCanonico(email: string | null | undefined): string | null {
  const e = String(email ?? "").trim().toLowerCase();
  const arroba = e.lastIndexOf("@");
  if (arroba <= 0 || arroba === e.length - 1) return null;
  let local = e.slice(0, arroba);
  let dominio = e.slice(arroba + 1);
  dominio = APELIDO_DE_DOMINIO[dominio] ?? dominio;
  local = local.split("+")[0];
  if (IGNORA_PONTO.has(dominio)) local = local.replace(/\./g, "");
  if (!local) return null;
  return `${local}@${dominio}`;
}

/** A impressão digital que o banco guarda no lugar do e-mail. */
export function identidadeDaCota(email: string | null | undefined): string | null {
  const c = emailCanonico(email);
  return c ? createHash("sha256").update(c).digest("hex") : null;
}

let descartaveis: Set<string> | null = null;

/**
 * O e-mail é de serviço temporário? Confere o domínio e os domínios-pai
 * ("x.mailinator.com" é mailinator). A lista (121 mil domínios) só é montada
 * na primeira consulta — servidor que ninguém usa não paga a memória.
 */
export function ehEmailDescartavel(email: string | null | undefined): boolean {
  const c = emailCanonico(email);
  if (!c) return false;
  if (!descartaveis) descartaveis = new Set(requerer("disposable-email-domains") as string[]);
  const partes = c.slice(c.indexOf("@") + 1).split(".");
  for (let i = 0; i < partes.length - 1; i++) {
    if (descartaveis.has(partes.slice(i).join("."))) return true;
  }
  return false;
}
