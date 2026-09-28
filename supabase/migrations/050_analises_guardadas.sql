-- ─────────────────────────────────────────────────────────────────────────────
-- JLB Analytics — 050_analises_guardadas.sql
--
-- A ANÁLISE DE MERCADO MORAVA SÓ NA MEMÓRIA DO PROCESSO — e é a coisa mais cara
-- que o site produz.
--
-- Reportado em 27/09: a tela de um mercado mostrava a análise de emergência
-- ("a leitura da IA não pôde ser gerada agora"). Medindo os três provedores na
-- hora: Anthropic sem crédito, Groq em 429, e o Gemini free com teto diário.
-- Os três fora ao mesmo tempo — e a tela não tinha nada para mostrar.
--
-- Só que TINHA. Aquele mercado já havia sido analisado antes; a análise estava
-- num `Map()` em memória e foi jogada fora no deploy anterior.
--
-- É o mesmo defeito que o briefing teve e que a migração 043 consertou, com o
-- mesmo texto escrito lá: "ficava só na memória do processo, então cada deploy
-- — e cada vez que o plano grátis do Render deixava o serviço dormir — jogava
-- fora o do dia e a próxima visita pagava tudo de novo". A análise de mercado
-- nunca recebeu esse conserto, e ela roda centenas de vezes mais que o briefing.
--
-- O aperto é real e está medido no próprio código: ~2.900 tokens por análise
-- contra 200.000/dia de teto gratuito, ou seja ~69 análises no dia inteiro. O
-- Render grátis dorme com 15 minutos sem tráfego e o site tem ~53 visitantes
-- por mês, então quase todo visitante encontra o processo recém-nascido, com a
-- memória vazia. A cota do dia era gasta refazendo análise que já existia.
--
-- Duas coisas passam a ser possíveis com esta tabela:
--   1. análise já feita não é paga de novo depois de soneca ou deploy;
--   2. com TODOS os provedores fora, a tela mostra a última leitura real em vez
--      do texto de emergência — dizendo de quando ela é e a que preço foi feita.
--
-- ⚠️ É CÓPIA, nunca verdade. Uma análise de ontem apresentada como de agora
-- seria pior que não ter análise: o preço muda, e a leitura fala do preço.
-- Por isso `preco_pct` e `criada_em` são NOT NULL — a tela é obrigada a contar
-- as duas coisas.
--
-- Uma linha por mercado e faixa de preço. Só o servidor lê e escreve.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.analises_mercado (
  chave      text PRIMARY KEY,
  market_id  text NOT NULL,
  fonte      text NOT NULL,
  titulo     text NOT NULL,
  -- A que preço a leitura foi feita. A análise inteira fala deste número, então
  -- mostrá-la sem ele é descontextualizar o texto.
  preco_pct  integer NOT NULL,
  -- O provedor que respondeu (anthropic/gemini/groq). Permite fatiar qualidade
  -- depois e não misturar níveis diferentes num número público.
  provedor   text,
  resultado  jsonb NOT NULL,
  criada_em  timestamptz NOT NULL DEFAULT now()
);

-- Busca pela ÚLTIMA análise de um mercado, em qualquer faixa de preço: é o
-- caminho do "todos os provedores fora", quando a faixa atual não tem cópia mas
-- alguma anterior tem.
CREATE INDEX IF NOT EXISTS analises_mercado_por_mercado
  ON public.analises_mercado (market_id, criada_em DESC);

-- Limpeza: a tabela cresce por mercado × faixa de preço e nada aqui tem valor
-- histórico — o track record de verdade mora em `ai_forecasts`.
CREATE INDEX IF NOT EXISTS analises_mercado_por_idade
  ON public.analises_mercado (criada_em);

COMMENT ON TABLE public.analises_mercado IS
  'Última análise de IA por mercado e faixa de preço. Cópia para sobreviver a soneca/deploy e para ter o que mostrar com os provedores fora. Nunca fonte de verdade.';
COMMENT ON COLUMN public.analises_mercado.preco_pct IS
  'Preço no momento da análise. A tela precisa mostrar isto junto — o texto fala deste número.';
COMMENT ON COLUMN public.analises_mercado.criada_em IS
  'De quando é esta leitura. Obrigatório mostrar quando a cópia é servida no lugar de uma análise nova.';

ALTER TABLE public.analises_mercado ENABLE ROW LEVEL SECURITY;

-- Sem política para anon/authenticated: só a chave de serviço entra. A análise
-- já é pública pela rota HTTP, que é onde a cota por pessoa e o limite por IP
-- acontecem — abrir a tabela daria um jeito de baixar todas as análises do site
-- sem passar por nenhum dos dois.
REVOKE ALL ON TABLE public.analises_mercado FROM PUBLIC;
