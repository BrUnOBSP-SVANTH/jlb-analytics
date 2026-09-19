/**
 * Eventos de telemetria — a lista, num lugar só.
 *
 * O QUE ISTO CONSERTA (14/09/2026). O servidor tem uma allowlist fechada de
 * eventos (server/routes/analytics.ts) e descarta em SILÊNCIO o que não está
 * nela: responde 204 antes de conferir, de propósito, para telemetria nunca
 * atrasar o app. A regra do projeto era "evento novo entra na allowlist" — e
 * dependia de alguém lembrar. Ninguém lembrou sete vezes:
 *
 *   cta_click              8 chamadas   o funil inteiro de CTA
 *   prediction_registered  5 chamadas   registrar previsão pela tela de mercado
 *   paywall_view, signup_nudge_click, calibration_test_done,
 *   previsao_hot_pick, progress_sync_failed
 *
 * 18 pontos do código enviavam eventos que nunca foram gravados, e o funil de
 * conversão (clique em CTA → paywall → Premium) nunca foi medido. Na outra
 * ponta, três nomes permitidos no servidor — prediction_saved, chat_message,
 * pwa_install — não eram enviados por ninguém.
 *
 * Agora o cliente só compila chamando um nome DESTA lista (`track(evento:
 * Evento)`), e o servidor aceita exatamente esta lista. Esquecer de um lado
 * virou erro de tipo, e não dado perdido.
 *
 * Nenhum destes carrega PII: o que vai junto é rota, anon_id aleatório e um
 * `meta` pequeno montado no próprio cliente.
 */
export const EVENTOS = [
  "page_view",
  "login",
  "signup",
  "signup_nudge_click",
  "cta_click",
  "paywall_view",
  "premium_click",
  "prediction_registered",
  "previsao_hot_pick",
  "calibration_test_done",
  "chat_opened",
  "progress_sync_failed",
  "client_error",
  // O degrau central do funil: alguém pediu a análise da IA de um mercado.
  // `meta.resultado` diz o que aconteceu — "vista", "barrada" (login ou cota),
  // "limite" (429) ou "erro". A análise exige conta, então "barrada" mede
  // quantos visitantes bateram no muro do cadastro no momento de valor.
  "analise_ia",
] as const;

export type Evento = (typeof EVENTOS)[number];
