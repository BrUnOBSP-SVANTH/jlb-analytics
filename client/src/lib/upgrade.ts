/**
 * Paywall no momento de valor. Quando o usuário grátis ESTOURA a cota mensal de IA
 * (HTTP 429 com `error: "credits_exhausted"`), em vez de um erro seco abrimos um
 * convite ao Premium — é ali, no pico de intenção, que a conversão acontece.
 *
 * Um evento global (`jlb:upgrade`) desacopla as dezenas de pontos de chamada de IA
 * da UI do modal: quem chama a IA só precisa de uma linha (`maybeUpgrade`), e um
 * único <UpgradeModal/> montado na App escuta o evento e mostra a oferta.
 */

import { toast } from "sonner";

export interface UpgradeDetail {
  /** "credits" = estourou a cota; "manual" = CTA direto; "login" = IA exige conta grátis. */
  reason: "credits" | "manual" | "login";
  used?: number;
  limit?: number;
}

/** Abre o paywall de qualquer lugar (ex.: um botão "Seja Premium" fora do fluxo de erro). */
export function openUpgrade(detail: UpgradeDetail = { reason: "manual" }): void {
  try {
    window.dispatchEvent(new CustomEvent<UpgradeDetail>("jlb:upgrade", { detail }));
  } catch {
    /* ambiente sem window (SSR/prerender) — ignora */
  }
}

/**
 * Se a resposta for 429 por COTA esgotada (não um rate-limit puro por rajada),
 * abre o paywall e retorna `true` — o chamador deve então ENCERRAR o fluxo em
 * silêncio (o modal já assume a experiência), sem lançar um erro de "limite".
 * Lê o corpo por `clone()`, então a resposta original continua consumível.
 */
export async function maybeUpgrade(res: Response): Promise<boolean> {
  if (res.status !== 429) return false;
  try {
    const body = (await res.clone().json()) as { error?: string; used?: number; limit?: number };
    if (body?.error === "credits_exhausted") {
      openUpgrade({ reason: "credits", used: body.used, limit: body.limit });
      return true;
    }
  } catch {
    /* corpo não-JSON → é rate-limit puro, deixa o chamador tratar como sempre */
  }
  return false;
}

/**
 * Gate unificado das chamadas de IA. Trata os dois "portões" e retorna `true`
 * quando um modal assumiu (o chamador deve ENCERRAR o fluxo em silêncio):
 *   • 401 login_required    → IA exige conta grátis: abre o modal de login.
 *   • 429 credits_exhausted → cota grátis do mês esgotada: abre o paywall.
 * Retorna `false` para qualquer outra resposta (inclusive 429 de rate-limit
 * puro por rajada), deixando o chamador seguir o tratamento normal de erro.
 */
/**
 * Bloqueios de CONTA que não são "falta cota" nem "falta login" (21/09/2026):
 * a cota grátis passou a ser da pessoa (e-mail normalizado), e e-mail
 * temporário ou não confirmado não usa a IA. O servidor manda o motivo em
 * português; sem este tratamento a tela mostraria "HTTP 403".
 */
const BLOQUEIOS_DE_CONTA = new Set(["email_temporario", "email_nao_confirmado", "cota_indisponivel"]);

export async function maybeAuthGate(res: Response): Promise<boolean> {
  if (res.status === 403 || res.status === 503) {
    try {
      const body = (await res.clone().json()) as { error?: string; message?: string };
      if (body?.error && BLOQUEIOS_DE_CONTA.has(body.error) && body.message) {
        toast.error(body.message, { duration: 10_000 });
        return true;
      }
    } catch {
      /* corpo não-JSON → deixa o chamador tratar */
    }
    return false;
  }
  if (res.status === 401) {
    try {
      const body = (await res.clone().json()) as { error?: string };
      if (body?.error === "login_required") {
        openUpgrade({ reason: "login" });
        return true;
      }
    } catch {
      /* 401 sem corpo JSON → deixa o chamador tratar */
    }
    return false;
  }
  return maybeUpgrade(res);
}
