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
];

/*
 * ⚠️ `jlb_calibration_history_v1` JÁ ESTEVE nesta lista, e não podia.
 *
 * A justificativa parecia boa: o histórico de calibração passou a ser
 * recalculado no servidor (`/api/ai/user-calibration-history`). Só que o
 * Dashboard mantém a série local DE PROPÓSITO, e diz por quê no próprio
 * código: ela serve quem não está logado e cobre a rede fora do ar — melhor a
 * série antiga do aparelho do que um gráfico vazio.
 *
 * Como `limparChavesAntigas()` roda em `main.tsx` a cada carga, ANTES do React
 * montar, o efeito era: `saveCalibrationSnapshot()` gravava, a próxima abertura
 * do site apagava, e o gráfico de quem não tem conta nunca tinha dado. Um
 * defeito silencioso — nada quebra, o gráfico só nasce vazio para sempre.
 *
 * É exatamente contra isto que a regra acima existe. O teste ao lado agora a
 * verifica sozinho, em vez de confiar em quem escreve a lista.
 */

export function limparChavesAntigas(): void {
  try {
    for (const chave of OBSOLETAS) localStorage.removeItem(chave);
  } catch {
    // Navegador sem storage (aba privada, storage bloqueado): não há o que
    // limpar, e falhar aqui não pode impedir o site de abrir.
  }
}
