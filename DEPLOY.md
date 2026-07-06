# Deploy — JLB Analytics

App full-stack **stateful**: Express + WebSocket + crons + spawn de Python.
Isso descarta plataformas serverless/edge (Vercel, Netlify, Cloudflare) — elas
não sustentam WebSocket persistente nem processos de longa duração. Use um host
que rode um container/VM contínuo: **Railway, Fly.io, Render (Web Service) ou um
VPS** (Hetzner/DigitalOcean).

## O que a build gera

`pnpm build` produz:
- `dist/public/` — SPA (Vite) servida como estático pelo próprio Express
- `dist/index.js` — servidor bundizado (esbuild)

`pnpm start` roda `NODE_ENV=production node dist/index.js`, que serve a API, o
SPA e o WebSocket na mesma porta (`PORT`, padrão 3001).

## Variáveis de ambiente obrigatórias

Copie de `.env.example` e preencha no painel do provedor (NÃO commitar `.env`):

| Var | Para quê |
|-----|----------|
| `ANTHROPIC_API_KEY` | Chat, análise, previsão, briefing |
| `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` | Auth, Cerebro, snapshots, analytics, feedback |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | Cliente (injetadas no build) |
| `NEWS_API_KEY` | Notícias contextuais na análise |
| `BRAPI_TOKEN` | Cotações BR |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `VITE_STRIPE_PREMIUM_PRICE_ID` | Checkout premium |
| `NODE_ENV=production` | Ativa CORS restrito, CSP e cache de estáticos |
| `APP_URL=https://jlbasset.com` | Origin permitido no CORS/CSP e nos links de email/OG |
| `RESEND_API_KEY` / `EMAIL_FROM` | (Opcional) resumo semanal por email; sem isso os toggles se escondem |
| `DEBUG_STATS_KEY` | (Opcional) libera `/api/cache/stats` em prod via header `x-debug-key` |

> Após o deploy, trocar `APP_URL` de `http://localhost:3000` para o domínio real
> é **obrigatório** — sem isso o CORS bloqueia o próprio front em produção.

## Opção 0 — Render FREE (recomendada para começar; sem cartão)

O repo tem um **Blueprint** (`render.yaml`) que configura tudo sozinho:

1. [render.com](https://render.com) → login com GitHub
2. **New +** → **Blueprint** → selecionar o repo `jlb-analytics` → **Apply**
3. O dashboard pede os valores das envs (copiar do `.env` local):
   `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`,
   `NEWS_API_KEY`, `BRAPI_TOKEN`, `STRIPE_SECRET_KEY`,
   `STRIPE_WEBHOOK_SECRET`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
4. Build (~5-10 min) → app no ar em `https://jlb-analytics*.onrender.com`
5. **Anti-hibernação** (free dorme após 15 min ocioso, o que mata os crons):
   criar monitor gratuito no [UptimeRobot](https://uptimerobot.com) para
   `https://SEU-APP.onrender.com/api/health` a cada 5 min. Mantém acordado
   24/7 (o free dá 750h/mês = exatamente 1 serviço sempre ligado) e ainda
   avisa por email se o site cair.

Deploy automático: todo `git push` na `main` redeploya sozinho.
`APP_URL` não precisa ser configurada — o servidor usa a
`RENDER_EXTERNAL_URL` injetada pelo Render.

Limites do free: 512MB RAM, CPU compartilhada, ~50s de cold start se chegar
a dormir. Quando o produto validar, migrar para Fly.io/VPS (abaixo).

## Opção A — Docker (Railway / Fly / Render pago / VPS)

O `Dockerfile` na raiz builda Node + Python numa imagem só.

```bash
docker build -t jlb .
docker run -p 3001:3001 --env-file .env jlb
# valida:
curl http://localhost:3001/api/health   # {"status":"ok",...}
```

- **Railway/Render**: apontar para o repo; detectam o Dockerfile. Definir as
  envs no painel e `PORT` (Railway injeta automaticamente; o server respeita).
- **Fly.io**: `fly launch` (gera fly.toml a partir do Dockerfile) → `fly deploy`.
  Setar segredos com `fly secrets set KEY=valor`.

## Opção B — VPS sem Docker

```bash
# no servidor (Ubuntu): node 22 + python3 + pnpm
git clone <repo> && cd jlb-completo
pnpm install --frozen-lockfile
pip3 install -r python/requirements.txt
pnpm build
# processo gerenciado (sobrevive a reboot):
pm2 start "pnpm start" --name jlb
```

Pôr Nginx/Caddy na frente para TLS + proxy para `:3001` (o Caddy resolve o
HTTPS sozinho). Confirmar que o proxy repassa o `Upgrade` do WebSocket em `/ws`.

## Crons (rodam DENTRO do servidor)

Ao subir com `SUPABASE_SERVICE_KEY`, o `server/index.ts` agenda sozinho:
coleta do Cerebro (2h), snapshots de mercado (24h), scoring do track record
(6h), seed de previsões (24h) e digest semanal. **Só funcionam com o processo
no ar 24/7** — é a razão de os dados terem estagnado em dev.

## Checklist pós-deploy

1. `GET /api/health` responde `ok`
2. `APP_URL` = domínio real; front carrega sem erro de CORS no console
3. Header `Content-Security-Policy` presente e `content-encoding: gzip` nas respostas
4. WebSocket conecta (cotações atualizando no ticker)
5. Webhook do Stripe apontando para `https://SEU_DOMINIO/api/stripe/webhook`
6. Ativar **leaked password protection** no dashboard do Supabase (Auth → Settings)
7. Logs sem `SUPABASE_SERVICE_KEY ausente` (senão os crons não rodam)
