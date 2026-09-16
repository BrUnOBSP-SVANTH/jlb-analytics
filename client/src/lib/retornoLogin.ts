/**
 * Para onde levar quem acabou de voltar do login com Google.
 *
 * O QUE ACONTECIA (16/09/2026). O app pede ao Supabase para devolver o usuário
 * em `/dashboard`. Quando esse endereço não está na lista de "Redirect URLs" do
 * projeto, o Supabase ignora o pedido e devolve na RAIZ do "Site URL" — e foi
 * assim que o login "não concluía": o log do Supabase registrou
 * `"action":"login"` com sucesso às 20:41:10, o token chegou em
 * `localhost:3000/#access_token=…`, e a pessoa ficava na home, sem sinal de que
 * tinha entrado (ou, com o servidor fora, numa tela branca servida do cache).
 *
 * A configuração no painel do Supabase é o conserto de verdade. Isto é o cinto
 * de segurança: se a volta caiu na raiz com um token de login no endereço, o app
 * termina o caminho que o usuário começou.
 *
 * Recuperação de senha (`type=recovery`) NÃO entra: ela tem tela própria.
 */
export function destinoAposLoginSocial(hash: string, caminho: string): string | null {
  if (!hash || !/(?:^#|&)access_token=/.test(hash)) return null;
  if (/(?:^#|&)type=recovery(?:&|$)/.test(hash)) return null;
  // Só a raiz: se a volta caiu no endereço certo, não há o que corrigir.
  return caminho === "/" ? "/dashboard" : null;
}
