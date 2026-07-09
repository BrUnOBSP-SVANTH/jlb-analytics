# /lapidar — Lapidação final do JLB Analytics (visual + lógica)

Assuma o papel de um time sênior de produto: Staff Engineer, UI/UX Designer de
nível Apple/Linear/Stripe e QA. A missão é levar o site ao acabamento de um
produto premium lançável — **refinando o visual sem descaracterizar a
identidade** e fechando as pendências de lógica.

## Contexto (NÃO redescobrir — já está pronto e validado)

Stack: React+TS+Vite (:3000) · Express+WS (:3001) · Python (crons) · Supabase.
Rodar: `pnpm dev` + `cross-env PORT=3001 pnpm dev:server`.
Oráculo de estado: `pnpm doctor` (auditoria completa do site num comando).

Já entregue e NÃO refazer: hardening (CSP estrita, RLS, helmet, JWT verificado),
performance (gzip com bypass de SSE, cache immutable, fontes self-hosted,
chunks), SEO (useSEO 26/26, canonical, JSON-LD, prerender p/ bots via
`pnpm prerender`), PWA instalável, chat "Analista JLB" (widget SSE + RAG do
Cerebro + feedback 👍/👎), telemetria first-party (/api/track + client_error),
Web Push de watchlist, CI GitHub (tsc+unit+E2E Playwright+build+audit),
deploy Render via render.yaml.

## Identidade visual — PRESERVAR (inegociável)

- Tema dark padrão "obsidian quente" + light "papel quente" — tokens oklch em
  `client/src/index.css`. Dourado = primário/marca; neon-blue = dados.
- Tipografia: Outfit (display), Inter Tight (texto), **Playfair via
  `.numeric-hero`** para números-herói (tom editorial "revista quant"),
  JetBrains Mono tabular para dados.
- Hierarquia de superfície: `.glass-card` (destaque) vs `.panel` (fundo quieto)
  — não usar glass em tudo. Monograma (linha ascendente + ponto) como marca.
- Idioma: pt-BR. Tom: educacional, quantitativo, honesto ("sem cherry-picking").

## Direção visual — nível Apple, SEM virar clone

Princípios a aplicar página a página:
1. **Respiro**: mais espaço em branco; uma ideia por seção; reduzir densidade
   de bordas/badges concorrentes nos cards (hoje competem por atenção).
2. **Hierarquia tipográfica dramática**: títulos maiores e mais confiantes,
   suporte menor e mais quieto; deixar o `.numeric-hero` protagonizar.
3. **Consistência absoluta**: escala de espaçamento 4/8px auditada; raios,
   sombras e transições idênticos entre páginas; estados hover/focus/active
   deliberados em TODO elemento interativo.
4. **Motion com propósito**: micro-transições CSS de 150-250ms (entrada de
   seção, hover de card, número que atualiza) — sutis, nunca decorativas;
   `prefers-reduced-motion` já é respeitado globalmente, manter.
5. **Estados com o mesmo carinho do caminho feliz**: skeletons, empty states
   com próxima ação clara, erros amigáveis.
6. Dataviz e tipografia SÃO a estética (não há fotografia) — gráficos limpos,
   grid editorial `hairline`, tabular-nums em colunas.

Auditar em 375px, 768px e desktop. Dark E light com a mesma qualidade.

## Regras técnicas — violar = quebrar produção (aprendidas neste projeto)

- CSP `script-src 'self'`: NENHUM script inline novo no index.html
  (exceto `application/ld+json`). Tema é `/theme-init.js`.
- Toda rota SSE nova DEVE terminar em `/stream` (senão o gzip congela o streaming).
- NÃO reintroduzir framer-motion (removido; usar CSS/tw-animate + IntersectionObserver)
  nem Google Fonts (self-hosted via @fontsource — famílias "X Variable").
- Cores SEMPRE via tokens (`bg-card`, `text-foreground`, `var(--...)`) — nunca
  cor escura fixa; `text-on-accent` sobre dourado.
- `profiles` no Supabase tem GRANTS POR COLUNA — coluna nova exige GRANT explícito.
- Vars `VITE_*` são de BUILD time; segredos só em runtime.
- Modelos Claude 4.x NÃO aceitam prefill de assistant; timeouts de IA no
  cliente ≥ 50s (nunca reapertar); confiabilidade JSON vem de `extractJson`.
- Novos eventos de telemetria: adicionar à allowlist de `server/routes/analytics.ts`.
- E2E: pré-marcar `jlb_onboarding_v3=done` no localStorage (o tour intercepta cliques).

## Método de trabalho

1. Comece com `pnpm doctor` + screenshots das páginas principais via Playwright
   (infra E2E já existe) para diagnosticar o visual ANTES de mexer.
2. Trabalhe em lotes pequenos verificados: a cada lote →
   `pnpm check && pnpm test && pnpm lint && pnpm build && pnpm test:e2e` → commit
   com mensagem substantiva → push (CI valida; Render autodeploya).
3. Valide o visual DEPOIS de cada mudança com novo screenshot — compare.
4. Não remover funcionalidades; não redesenhar por redesenhar — cada mudança
   visual precisa de justificativa de hierarquia/clareza/consistência.
5. Decisões de produto (preço, copy de marca, cortar feature) → perguntar.
   Todo o resto → decidir e executar.

## Pendências de lógica conhecidas (verificar/fechar se ainda abertas)

- Deploy Render aplicado? (snapshots parados em 973 = ainda não; é o item nº 0)
- `VITE_STRIPE_PREMIUM_PRICE_ID` real (Stripe dashboard) p/ o checkout premium
- `RESEND_API_KEY` p/ emails (toggles se escondem sem ela — comportamento correto)
- Refatorar os arquivos >900 linhas APENAS quando for tocá-los pelo visual
  (Apostas 1465, Dashboard 1387, ai.ts 1386, Previsao 1296…)
- 41 warnings de lint (backlog React Compiler) — reduzir oportunisticamente

## Critério de conclusão

"Eu colocaria este site no meu portfólio ao lado de produtos da Linear/Stripe?"
Se não: identifique O QUE falta, priorize por impacto visível e continue.
Doctor verde + CI verde + E2E verde são pré-requisito, não conclusão.
