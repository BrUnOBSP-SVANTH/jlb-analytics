# JLB Analytics — imagem de produção.
# Node (servidor Express + SPA buildada) + Python (crons do Cerebro/snapshots).
# Multi-stage: builda com todas as devDeps, roda enxuto só com o dist.

# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:22-slim AS build
WORKDIR /app

RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

# Variáveis VITE_* são embutidas no bundle do cliente EM BUILD TIME.
# São valores públicos por design (anon key vai ao browser de qualquer forma);
# os segredos de verdade entram só em runtime via fly secrets.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_STRIPE_PREMIUM_PRICE_ID
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_STRIPE_PREMIUM_PRICE_ID=$VITE_STRIPE_PREMIUM_PRICE_ID

RUN pnpm build

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Python para os scripts de coleta agendados (server/index.ts faz spawn("python"))
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pip \
  && ln -sf /usr/bin/python3 /usr/bin/python \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY python/requirements.txt ./python/requirements.txt
RUN pip3 install --no-cache-dir --break-system-packages -r python/requirements.txt

# Artefatos de build + scripts Python (rodados via cron pelo servidor)
COPY --from=build /app/dist ./dist
COPY python ./python

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3001)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
