/**
 * Consentimento de armazenamento — e ele MEXE de verdade no que o site faz.
 *
 * A REGRA QUE ORIENTOU ISTO. Um aviso de cookies que não muda comportamento é
 * teatro, e teatro é pior que nada: dá ao usuário a impressão de escolha e ao
 * site a impressão de conformidade, sem nenhuma das duas. Aqui recusar DESLIGA a
 * telemetria e APAGA o identificador que já existia — ver `track()` em
 * lib/analytics.ts, que consulta este módulo antes de enviar qualquer coisa.
 *
 * O QUE O SITE REALMENTE GUARDA, levantado no código e não no chute:
 *
 *   ESSENCIAL (sempre, sem escolha — sem isto o site não funciona)
 *     · a sessão de login (Supabase), sem a qual não dá para entrar;
 *     · `jlb-theme`, o tema claro/escuro;
 *     · `jlb_aceite_pendente`, o aceite dos Termos em trânsito até a sessão existir;
 *     · as previsões, alertas e filtros que a pessoa criou — dado DELA, guardado
 *       no aparelho dela.
 *
 *   MEDIÇÃO (opcional, é o que esta escolha controla)
 *     · `jlb_anon_id`: um identificador aleatório, sem nome, e-mail ou IP, usado
 *       só para contar quantas pessoas distintas usaram cada tela. Vai para o
 *       NOSSO servidor, não para terceiro nenhum.
 *
 * O que NÃO existe aqui, e vale dizer: nenhum cookie de publicidade, nenhum
 * rastreador de terceiro, nenhum pixel de rede social, nenhuma revenda de dado.
 */

const CHAVE = "jlb_consentimento_v1";

export type Consentimento = "completo" | "essencial";

/** O identificador de medição, apagado quando a pessoa recusa. */
const CHAVE_ANON = "jlb_anon_id";

/** A escolha já foi feita? Enquanto não, o aviso aparece. */
export function jaEscolheu(): boolean {
  try { return localStorage.getItem(CHAVE) !== null; } catch { return true; }
}

/**
 * A escolha atual. O padrão de quem ainda não escolheu é `essencial`: até haver
 * consentimento, não medimos. O contrário — medir e parar depois — já teria
 * coletado o dado que a pessoa vai recusar em seguida.
 */
export function consentimento(): Consentimento {
  try {
    return localStorage.getItem(CHAVE) === "completo" ? "completo" : "essencial";
  } catch {
    return "essencial";
  }
}

/** A medição está autorizada agora? É o que `track()` pergunta. */
export function podeMedir(): boolean {
  return consentimento() === "completo";
}

/**
 * Registra a escolha. Ao recusar, APAGA o identificador que já tinha sido criado
 * — recusar tem que desfazer, não só impedir daqui para a frente.
 */
export function definirConsentimento(escolha: Consentimento): void {
  try {
    localStorage.setItem(CHAVE, escolha);
    if (escolha === "essencial") localStorage.removeItem(CHAVE_ANON);
  } catch { /* navegador sem storage: nada a guardar, nada a apagar */ }
  // Avisa quem estiver na tela agora (o aviso some, a medição religa/desliga)
  // sem exigir recarregar a página.
  try { window.dispatchEvent(new CustomEvent("jlb:consentimento", { detail: escolha })); } catch { /* SSR */ }
}
