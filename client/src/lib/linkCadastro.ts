/**
 * "Criar conta grátis" tem que abrir o CADASTRO, não o login.
 *
 * O QUE ACONTECIA (percorrido no site real em 19/09/2026, tela de celular). O
 * visitante pede a análise da IA, o modal oferece "Criar conta grátis" — e o
 * clique abria "Entre na sua conta", com o botão "Entrar". Para se cadastrar,
 * era preciso achar o "Criar gratuitamente" pequeno no pé do cartão. Três
 * botões faziam essa mesma promessa quebrada: o modal da análise, o convite
 * da lista de mercados e a página de planos. É o degrau onde o site tinha 0
 * cadastros em 30 dias.
 *
 * Os links que dizem "Entrar / Criar conta" continuam indo para o login — ali a
 * promessa é ambígua de propósito.
 */

/** O destino de todo botão que promete CRIAR conta. */
export const LINK_CADASTRO = "/login?modo=cadastro";

/** Em que modo a tela de login abre, a partir da URL. */
export function modoInicialDoLogin(search: string): "login" | "signup" {
  return new URLSearchParams(search).get("modo") === "cadastro" ? "signup" : "login";
}
