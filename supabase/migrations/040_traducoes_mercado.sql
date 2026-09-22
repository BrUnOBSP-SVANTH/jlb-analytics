-- ─────────────────────────────────────────────────────────────────────────────
-- JLB Analytics — 040_traducoes_mercado.sql
--
-- Auditoria 21/09, DAD-05. A tradução dos títulos usava o endpoint não oficial
-- do Google (client=gtx) e o MyMemory, com cache SÓ EM MEMÓRIA — que some a
-- cada deploy. Resultado medido: a tela volta para o inglês a cada publicação,
-- e os dois serviços respondem 429 com frequência.
--
-- Pior que ficar em inglês, o tradutor automático inverteu o sentido:
--   "CNN, Politico, or MS NOW unbanned from White House…"
--   virou "…foram BANIDOS da Casa Branca…" — o contrário do que o mercado diz.
-- Também traduzia nome próprio ("Giants vs. Rams" → "Gigantes vs. Carneiros"),
-- escrevia em português de Portugal ("Irão") e estragava patamar
-- ("(HIGH) $3.0T" → "(ALTA) US$ 3,0T").
--
-- Agora quem traduz é a cadeia de IA do site, com regras explícitas, e cada
-- título é traduzido UMA VEZ NA VIDA: a tradução fica aqui, com o modelo que a
-- fez e a data. O endpoint gtx vira último recurso.
--
-- Só o servidor lê e escreve (RLS ligada, sem policy). O conteúdo é público
-- (título de mercado), mas quem escreve tem que ser o servidor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.traducoes_mercado (
  hash       text        PRIMARY KEY,          -- sha256 do texto original
  original   text        NOT NULL,
  traducao   text        NOT NULL,
  modelo     text        NOT NULL,             -- anthropic | gemini | groq | gtx | mymemory
  criado_em  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.traducoes_mercado ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.traducoes_mercado FROM anon, authenticated;
