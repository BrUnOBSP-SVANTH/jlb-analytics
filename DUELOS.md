# Duelos de Previsão — Pré-projeto (rascunho)

> **Status: ideia registrada, NÃO implementar ainda.** Documento para amadurecer a
> proposta e servir de base quando o beta estiver encaminhado. Origem: ideia do
> fundador (2026-07), inspirada nos duelos de fantasy game (modelo Rei do Pitaco).

## 1. Visão

Usuários montam **análises de previsão** (esportes, economia, política…), duelam
entre si — 1x1 ou em grupo, mesmo nicho ou nichos diferentes — e **quem chegar
mais perto do que realmente aconteceu leva o pote**. Previsões mais específicas
valem mais que previsões vagas. A plataforma fica com um **rake (~10%)** sobre as
entradas; o líquido vai para o vencedor.

Por que faz sentido para a JLB:
- É a monetização por **movimento** (rake), não só por assinatura — alinhada ao
  que o público já gosta (competir, provar que sabe mais, ganhar dinheiro sabendo).
- O motor já existe: previsões probabilísticas + **Brier Score** + resolução
  automática + leaderboard são exatamente a infraestrutura de um duelo justo.
- Diferencial honesto: aqui o duelo é de **calibração** (ciência), não de palpite.

## 2. Como funciona nos concorrentes (pesquisa 2026-07)

**Rei do Pitaco (fantasy BR)** — o modelo que inspirou a ideia:
- Usuário paga entrada (R$1–R$50) para disputar contra outros; maior pontuação
  leva o prêmio; pagamento via Pix; formatos de entrada única e multientrada.
- O rake fica embutido na diferença entre o total de entradas e a premiação.
- Estrutura os torneios com **premiação garantida** (independe de quantos entram)
  — isso não é estética: é o que os encaixa no carve-out legal (ver §6).

**DFS internacional (DraftKings/FanDuel/Underdog) — duelos H2H:**
- Head-to-head: 1 escalação vs 1 adversário; vencedor leva as duas entradas
  menos o rake; retorno típico de **1.8–1.9x** a entrada.
- **Rake de mercado: 6.5–10% em H2H** (10–20% em torneios grandes) — o instinto
  de 10% está exatamente no teto do padrão H2H.
- Formatos que engajam: H2H, 50/50 (metade do campo dobra), torneios GPP com
  prêmio garantido (ex.: US$15 mi garantidos no Best Ball do Underdog).

## 3. Mecânica proposta (o duelo JLB)

**Scoring — regra de pontuação própria (proper scoring rule):**
- Cada jogador registra previsões **probabilísticas** ("França campeã: 62%"),
  não binárias. Ao resolver, calcula-se o **Brier** (ou log score) de cada um;
  menor erro vence. Regras próprias são **incentive-compatible**: a única forma
  de maximizar a pontuação esperada é dizer o que você realmente acredita —
  impossível "jogar o meta" sem conhecimento real.

**Especificidade vale mais (o ponto do "quem previu mais detalhes ganha mais"):**
- Previsão composta = mais "pernas" ("França campeã" + "final contra a Espanha"
  + "2x1") = mais conteúdo de informação = mais pontos em jogo.
- Implementação natural com log score: a pontuação é somada por evento previsto;
  quem cobre mais eventos com boa calibração acumula mais. Quem só arrisca uma
  perna vaga compete por menos pontos — exatamente o "ganha um pouco mais quem
  detalhou mais" da ideia original, sem arbitrariedade.
- Desempate: (1) maior nº de pernas resolvidas; (2) melhor perna individual;
  (3) previsão registrada primeiro.

**Formatos:**
- **Duelo 1x1** (H2H): aposta espelhada no mesmo conjunto de eventos, ou cada um
  no seu nicho com nº de pernas equivalente.
- **Liga/rodada** (estilo bolão calibrado): N jogadores, mesmo baralho de
  eventos da semana; pódio leva o pote em 50/30/20.
- **50/50**: metade do campo dobra a entrada (porta de entrada de baixo risco).

**Integridade (obrigatório antes de qualquer dinheiro):**
- Previsões **seladas**: hash + timestamp no registro; visíveis ao oponente só
  após o lock (início do evento). A tabela `predictions` já tem `created_at`.
- Resolução por fonte oficial predefinida (o pipeline de resolução automática
  por snapshots/preço extremo já existe para os mercados Polymarket/Kalshi).
- Anti multi-conta e anti-conluio (2 contas do mesmo dono duelando de graça
  para farmar rake negativo): KYC na fase de dinheiro real, limites por CPF.

## 4. Monetização

- **Rake de 10%** sobre o pote (benchmark de mercado: 6.5–10% em H2H).
  Ex.: duelo de R$125 + R$125 → pote R$250 → rake R$25 → vencedor leva R$225.
- Rake menor (6–7%) em duelos pequenos para aquecer a liquidez; maior em
  torneios com prêmio garantido.
- Receita = f(volume), não f(assinantes) — complementa (não substitui) o premium.

## 5. O que JÁ existe no código que vira alicerce

| Peça | Onde | Estado |
|---|---|---|
| Previsões probabilísticas por usuário | `predictions` (Supabase, RLS por usuário) | ✅ produção |
| Brier Score + calibração | `Dashboard`/`lib/predictions` | ✅ produção |
| Resolução automática de eventos | `scoreAiForecasts` (preço extremo + snapshots) | ✅ produção |
| Leaderboard público por Brier | `/leaderboard` | ✅ produção |
| Comparação lado a lado | `ComparePanel` (Apostas) | ✅ produção (semente da UX de duelo) |
| Gamificação (pontos) | `userProgress` | ✅ produção (moeda da Fase 1) |
| Auth + perfil | Supabase Auth + `profiles` | ✅ produção |
| Pagamentos | Stripe (assinatura) | ⚠️ configurado p/ assinatura, não p/ carteira |

## 6. Realidade regulatória (o capítulo mais importante)

A Lei **14.790/2023** regulou apostas de quota fixa no Brasil e **excluiu o
fantasy sport** da necessidade de autorização — mas sob critérios cumulativos:

1. Competição virtual baseada no desempenho de **pessoas reais** (≥2);
2. Resultado depende **predominantemente de conhecimento, análise estatística,
   estratégia e habilidade** (não de sorte);
3. **Prêmio garantido, independente do nº de participantes ou do volume
   arrecadado** com as entradas;
4. Resultado não pode derivar do resultado isolado de uma única pessoa/evento.

Consequências diretas para o desenho:
- O modelo puro "pote = entradas − rake" **NÃO atende o critério 3** — sem
  estrutura de prêmio garantido, um duelo com dinheiro real corre risco de ser
  classificado como aposta não autorizada (licença de quota fixa custa R$30 mi
  de outorga — fora de alcance). O Rei do Pitaco trabalha com premiação
  garantida exatamente por isso.
- Duelo de **calibração multi-eventos** tem argumento de habilidade FORTE (mais
  que fantasy: Brier é literalmente uma medida de habilidade), mas previsão de
  UM evento único esbarra no critério 4.
- Prêmios líquidos: IRPF de 15% (mesma disciplina das bets).
- Dinheiro real exige: PSP com Pix, carteira segregada, KYC/+18, PLD/AML,
  LGPD, termos próprios — e **parecer jurídico especializado antes do go**.

## 7. Fases propostas

- **Fase 0 — já feita**: motor de previsões, Brier, resolução, leaderboard.
- **Fase 1 — Duelos por PONTOS (beta)** ✅ **LANÇADA (2026-07-19)**: página
  `/duelos` (lobby, criação com baralho de 2-5 mercados, aceite), previsões
  seladas server-side (tabela `duels` sem policies públicas — migration 014),
  resolução por preço extremo (mesmo critério do track record da IA), menor
  Brier vence, +25 pts ao vencedor. **Zero risco regulatório.**
- **Fase 2 — Torneios com prêmio garantido** (patrocinado/fixo semanal, ex.:
  R$500 garantidos ao melhor Brier da rodada): aproxima-se do formato do
  carve-out, receita via inscrição + assinatura premium para multientrada.
- **Fase 3 — Dinheiro real** (somente com parecer jurídico + PSP + KYC):
  duelos e ligas com rake de 10%, prêmios garantidos onde o critério legal
  exigir.

## 8. Questões em aberto

- [ ] Parecer jurídico: duelo de calibração multi-eventos se encaixa no
      carve-out de fantasy ou precisa de outra moldura?
- [ ] PSP para carteira/Pix (Stripe não é o instrumento certo para pote).
- [ ] Matchmaking justo (handicap por Brier histórico? divisões/ligas?).
- [ ] Anti-conluio em H2H com dinheiro (colusão para transferir saldo).
- [ ] Impacto na identidade educacional do site (hoje: "não recomendamos
      apostas") — duelo por pontos preserva; dinheiro real reposiciona a marca.

## Fontes da pesquisa

- Rei do Pitaco — como funciona, entradas e prêmios: techtudo.com.br, placar.com.br, dicascartola.com.br
- Rake H2H 6.5–10% e estrutura 1.8–1.9x: rotopicks.com, occupyfantasy.com, wealthifynest.com
- Lei 14.790/2023 (texto e análises do carve-out de fantasy): planalto.gov.br, abfsoficial.com, mayerbrown.com, apet.org.br
