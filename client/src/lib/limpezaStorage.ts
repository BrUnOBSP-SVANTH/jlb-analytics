/**
 * Limpeza de chaves antigas do navegador (TRV-04).
 *
 * O QUE ISTO CONSERTA. A auditoria encontrou `jlb_onboarding_v2` e
 * `jlb_onboarding_v3` convivendo no mesmo navegador — e há um `v1` ainda no
 * código. Cada vez que uma estrutura muda, a chave sobe de versão e a anterior
 * fica lá para sempre, ocupando a cota do domínio e podendo ser lida por engano
 * por um código que ainda referencia o nome velho.
 *
 * Não é só arrumação: o histórico de alertas antigo (`v1`) guardava 50 itens com
 * duplicatas e mercados já liquidados dentro. Deixá-lo no navegador é deixar o
 * defeito adormecido esperando alguém voltar a ler dali.
 *
 * A regra: quando uma chave sobe de versão, a versão anterior é APAGADA na
 * primeira vez que o site abre. Idempotente e barato — roda uma vez por carga.
 */

/**
 * Chaves que já não são lidas por ninguém.
 *
 * Só entram aqui nomes cujo consumidor foi REMOVIDO ou migrado. Nunca uma chave
 * viva: apagar dado que alguém ainda lê é bem pior que deixar lixo.
 */
const OBSOLETAS = [
  // Tour do site: o componente lê `jlb_onboarding_v3`. As versões anteriores
  // ficaram para trás.
  //
  // ⚠️ `jlb_onboarding_v1` só entra nesta lista porque a faixa da home, que era
  // a única a lê-la, foi renomeada para `jlb_faixa_boas_vindas` — os dois
  // recursos tinham nomes que pareciam versões um do outro. Sem renomear
  // primeiro, esta limpeza apagaria uma chave VIVA.
  "jlb_onboarding_v1",
  "jlb_onboarding_v2",
  // Histórico de alertas antes da régua de dedup (ver lib/alertas.ts).
  "jlb_alert_history_v1",
  // Histórico de calibração: passou a ser recalculado no servidor a partir das
  // previsões da conta (server/lib/calibracaoUsuario.ts).
  "jlb_calibration_history_v1",
];

export function limparChavesAntigas(): void {
  try {
    for (const chave of OBSOLETAS) localStorage.removeItem(chave);
  } catch {
    // Navegador sem storage (aba privada, storage bloqueado): não há o que
    // limpar, e falhar aqui não pode impedir o site de abrir.
  }
}
