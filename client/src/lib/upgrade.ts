/**
 * Paywall no momento de valor. Quando o usuário grátis ESTOURA a cota mensal de IA
 * (HTTP 429 com `error: "credits_exhausted"`), em vez de um erro seco abrimos um
 * convite ao Premium — é ali, no pico de intenção, que a conversão acontece.
 *
 * Um evento global (`jlb:upgrade`) desacopla as dezenas de pontos de chamada de IA
 * da UI do modal: quem chama a IA só precisa de uma linha (`maybeUpgrade`), e um
 * único <UpgradeModal/> montado na App escuta o evento e mostra a oferta.
 */

export interface UpgradeDetail {
  /** "credits" = estourou a cota (mostra a mensagem de limite); "manual" = CTA direto. */
  reason: "credits" | "manual";
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
