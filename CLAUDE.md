# JLB Analytics — instruções para o Claude

Plataforma brasileira de **mercados de previsão** (Polymarket, Kalshi, Manifold)
com camada de análise por IA, trilha educacional (Níveis 1–5), banca simulada e
track record verificável. Público-alvo é o Brasil: **o produto inteiro fala
português**.

**Stack:** React 19 + Vite + Tailwind 4 + wouter (SPA) · Express + WebSocket
(Node rodando TS direto via `--experimental-transform-types`) · Supabase
(Postgres + Auth + RLS) · Python spawnado para modelos e coleta · IA em cadeia
Anthropic → Gemini → Groq.

---

## Comandos

| Comando | Para quê |
|---|---|
| `pnpm dev:all` | Vite (:3000) + Express (:3001) juntos. `/api` e `/ws` são proxy para o :3001 |
| `pnpm check` | TypeScript (`tsc --noEmit`) |
| `pnpm lint` / `pnpm format` | ESLint / Prettier |
| `pnpm test` | Vitest (client, server, shared, supabase) |
| `pnpm test:e2e` | Playwright |
| `pnpm doctor` | Auditoria de saúde: telas órfãs, mocks, env faltando, dados no Supabase. Sai com lista de prioridades. `--quick` pula o tsc |
| `pnpm varredura` | Abre TODAS as rotas num navegador real e registra o que quebra. Acha o que o doctor não acha (erro de runtime em tela esquecida). Precisa do servidor local de pé |
| `pnpm cobertura` / `pnpm qualidade` | Medem cobertura e qualidade da análise da IA |

Gerenciador é **pnpm** (`packageManager` fixa a versão). Não usar npm/yarn aqui.

### Antes de dar uma tarefa por concluída
`pnpm check` + `pnpm test` sempre. Se mexeu em tela, também `pnpm varredura`.
Se mexeu em rota, dado ou env, também `pnpm doctor`.

---

## Mapa do repositório

```
client/src/      SPA. pages/ (as telas) · components/ · lib/ (regras puras, testadas) · contexts/ (Auth, Theme)
server/          index.ts (bootstrap, crons, spawn de Python) · routes/ · lib/ · lib/ai/ · middleware/
shared/          Código que roda nos DOIS lados. Alias @shared
python/          Modelos e coletores, chamados por spawn do server/index.ts
scripts/         Ferramentas de linha de comando (doctor, varredura, backtests)
supabase/        migrations/ numeradas em sequência (001_…, 027_…)
e2e/             Playwright
```

Testes ficam **ao lado** do arquivo (`fichaMercado.ts` + `fichaMercado.test.ts`).

---

## Regras de código

**Fonte única — nunca reimplementar estas quatro:**

- **`apiFetch`** ([client/src/lib/api.ts](client/src/lib/api.ts)) é a única porta
  para chamar `/api/`. `fetch` cru vai sem o cabeçalho `Authorization`, o
  servidor responde 401 e o sintoma é um **pedido de login que não acaba nunca**.
  Já aconteceu em 7 das 9 chamadas de IA. Para GET, prefira `buscarJson` (dedup
  de requisição em voo + cache curto).
- **`shared/formato.ts`** formata todo número que aparece na tela ou em texto
  gerado pelo servidor. pt-BR, com a convenção `%` (variação relativa) vs `pp`
  (diferença entre probabilidades) — trocar um pelo outro é justamente o erro
  que a plataforma existe para corrigir.
- **`shared/banca.ts`** faz a conta da banca simulada nos dois lados.
- **Cores só por token** do `client/src/index.css` (oklch, tema claro/escuro).
  Nunca cor escura fixa nem classe Tailwind crua de cor — quebra no tema claro.

**Comentário explica POR QUE o código existe**, não o que ele faz. O padrão da
casa é abrir o arquivo com o bug ou a decisão que o originou (veja `api.ts`,
`formato.ts`). Siga esse tom ao criar arquivo novo.

**Integrações só com API real.** Nada de mock, dado inventado ou placeholder em
tela — se a fonte não responde, a tela diz que não respondeu.

---

## Idioma e escrita

Código, comentários, nomes de domínio, commits e UI: **português do Brasil**.
Nomes de função do domínio em PT (`buscarJson`, `fichaMercado`, `cobertura`);
termos de framework ficam como são (`useState`, `apiFetch`).

Commits descrevem o efeito para quem usa, não o arquivo alterado — e citam o
código do achado quando vem de auditoria (`MKT-14`, `DSH-07`).

---

## Armadilhas

- **Casar token por substring já mordeu 4×.** Desconfie de
  `texto.includes(termo)` quando `termo` vem de dado. Use palavra inteira.
- **Deploy é o Render** ([render.yaml](render.yaml), [DEPLOY.md](DEPLOY.md)).
  O `fly.toml` é legado — não é o que roda. Publicar = `git push`.
- **Antes do push, confira `git log --oneline origin/main..HEAD`.** Já houve 63
  commits parados 8 dias porque ninguém olhou.
- **Plano free do Render tem CPU fracionada.** Rota nova precisa de orçamento de
  tempo; o que for pesado vai para cron ou cache, não para o request.
- **Python é spawnado como `python`** (não `python3`) em `server/index.ts`.
- **O pre-commit barra segredo e `.env`** ([.githooks/pre-commit](.githooks/pre-commit)).
  Se ele reclamar, o certo é tirar o segredo — nunca `--no-verify`.
- **Coluna GERADA no Postgres fica NULL** e quebra denominador de métrica.
- **`closed` sozinho não significa resolvido**: track record só conta o
  settlement oficial.

---

## Decisões já fechadas — não reabrir sem dado novo

Estas foram **medidas**, não supostas. Reabrir custa dias e já deu negativo:

- **Não tentar bater o preço do mercado.** A calibração fora da amostra (n=124)
  PIOROU o Brier em 7,7%. O ganho do backtest era miragem: corrigia viés do
  mercado, não do modelo. `pnpm calibration:fit` refaz a conta se preciso.
- **Modelos de esporte não são edge.** Poisson/Dixon-Coles perdem da baseline,
  Elo empata (`pnpm backtest:sports`). Não vender como vantagem.
- **Não trocar o modelo de IA.** O bake-off (`scripts/ai-bakeoff.mjs`) mostrou
  que o atual já é o melhor dos gratuitos.
- **Duelos de Previsão** ([DUELOS.md](DUELOS.md)) é pré-projeto. **Não
  implementar** até o fundador pedir.

---

## Coisas que exigem decisão humana

Não resolva sozinho, pergunte: chave/credencial nova, custo (upgrade de plano,
recarga de API), mudança de posicionamento do produto, e qualquer coisa que
apareça para o usuário final como promessa de retorno financeiro.
