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
  if (caminho !== "/") return null;
  // Onde a pessoa estava quando clicou em "Entrar" (UXP-05); o painel fica de
  // reserva para quem entrou pela própria tela de login.
  return consumirDestino() ?? "/dashboard";
}

/**
 * DE ONDE A PESSOA VEIO (Auditoria 21/09, UXP-05).
 *
 * Todo caminho para o login jogava a pessoa em `/dashboard` depois de entrar —
 * inclusive quem clicou em "Entrar" lendo a Banca Simulada, o Perfil, os Duelos
 * ou um mercado. A tarefa que a pessoa estava fazendo some, e ela tem que
 * reencontrar sozinha o lugar onde estava. Num site com uma conta cadastrada, a
 * primeira sessão de cada pessoa é exatamente o momento que não pode ter atrito.
 *
 * Fica em `sessionStorage`, e não na URL: o retorno do Google recarrega a página
 * inteira e passa pelo Supabase, que reescreve o endereço. Guardar na aba
 * sobrevive a isso sem depender da lista de "Redirect URLs" do projeto — que é
 * justamente a configuração que já falhou uma vez (ver o topo deste arquivo).
 */
const CHAVE_DESTINO = "jlb_destino_pos_login";

/** Telas que não podem ser destino: voltar para o login depois de entrar é laço. */
const NAO_SAO_DESTINO = /^\/(login|cadastro|reset-password|callback)\b/;

/**
 * Só caminho interno. `//evil.com` e `https://evil.com` são endereços de FORA
 * disfarçados de caminho — é assim que um "volte para onde estava" vira
 * redirecionamento aberto, que é phishing com o nosso domínio na barra.
 */
export function destinoSeguro(caminho: unknown): string | null {
  if (typeof caminho !== "string" || !caminho.startsWith("/")) return null;
  if (caminho.startsWith("//")) return null;
  if (NAO_SAO_DESTINO.test(caminho)) return null;
  return caminho;
}

/** Chamado ANTES de mandar alguém para o login. */
export function guardarDestino(caminho: string): void {
  const seguro = destinoSeguro(caminho);
  if (!seguro) return;
  try { sessionStorage.setItem(CHAVE_DESTINO, seguro); } catch { /* sem storage: cai no padrão */ }
}

/** Lê e APAGA: o destino vale para uma entrada só. */
export function consumirDestino(): string | null {
  try {
    const guardado = sessionStorage.getItem(CHAVE_DESTINO);
    sessionStorage.removeItem(CHAVE_DESTINO);
    return destinoSeguro(guardado);
  } catch { return null; }
}

/**
 * Atalho para o caso de sempre: "guarde a tela em que estou".
 *
 * Existe para não haver desculpa. Toda tela que manda alguém para o login
 * precisa chamar isto antes — e há um teste que cobra exatamente isso de todas,
 * porque o defeito do UXP-05 não foi uma tela errada: foram cinco, cada uma
 * escrita num dia diferente, todas esquecendo a mesma linha.
 */
export function lembrarOndeEstou(): void {
  try { guardarDestino(window.location.pathname + window.location.search); }
  catch { /* fora do navegador */ }
}
