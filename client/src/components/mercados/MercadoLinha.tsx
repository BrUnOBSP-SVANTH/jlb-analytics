/**
 * MercadoLinha + EixoDeProbabilidade — a lista de mercados como GRÁFICO.
 *
 * O PROBLEMA. A tela mostrava vinte cards idênticos: mesmo raio, mesma borda,
 * mesma pilha interna de seis zonas. Nada dizia qual mercado importava, então
 * nenhum importava. O trabalho desta tela é TRIAGEM — achar em segundos o
 * mercado que vale atenção — e vinte coisas gritando no mesmo volume é o oposto
 * disso.
 *
 * A DECISÃO QUE CARREGA O DESENHO: a lista não é uma lista, é um gráfico de
 * barras com eixo. Cada mercado é uma barra; a grade vertical de 0/25/50/75/100
 * atravessa todas elas. Descer a lista com o olho passa a responder, sem ler uma
 * palavra: quanto deste catálogo o mercado já decidiu, e o que continua em
 * aberto.
 *
 * A PRIMEIRA TENTATIVA ERROU, e o erro vale registro: o fundo da linha inteira
 * se estendia até a probabilidade. Parecia certo no papel — "a linha É a barra"
 * — mas na tela a faixa terminava no meio do título e lia como destaque
 * aleatório, não como medida. Faltava a coisa que transforma extensão em dado:
 * um EIXO. Barra sem régua é decoração com pretensão de gráfico.
 *
 * A marca dos 50% é a mais forte de propósito. Cinquenta por cento é o ponto de
 * dúvida máxima, e é o conceito em torno do qual esta plataforma inteira gira —
 * quem cruza essa linha mudou de lado.
 *
 * DISCIPLINA DE COR. O número é neutro, a barra é neutra. As duas únicas cores
 * da linha são o MOVIMENTO da semana (semântico, e responde "por que agora?") e
 * a divergência da nossa IA — que é dourada e rara de propósito, porque é a
 * única coisa aqui que as bolsas não têm. A tradução, que na primeira versão
 * saía em dourado em toda linha, voltou a ser texto secundário: dourado em vinte
 * linhas é dourado que não significa nada.
 */
import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Bookmark, BookmarkCheck, Scale, ExternalLink, ChevronDown } from "lucide-react";
import { type TrendingItem, CATEGORY_LABELS, formatVolume } from "@/lib/trending";
import { pct, pp } from "@shared/formato";
import { useLivePrice } from "@/lib/livePrices";
import { useEdge } from "@/components/mercados/edgeStore";
import { NewsAnalysisPanel } from "@/components/mercados/panels";
import { traduzir, pareceEmPortugues } from "@/lib/traducao";

/** Quantos desfechos de um mercado múltiplo cabem antes de virar ruído. */
const MAX_DESFECHOS = 3;

/**
 * O TRILHO — a medida que o eixo, a grade e a barra compartilham.
 *
 * Escrito uma vez e usado nos três, porque a primeira versão os tinha em
 * contêineres diferentes: a grade era absoluta no contêiner da lista e a barra
 * era um item de flex com a coluna de ações depois dela. As duas ficavam
 * deslocadas em 5,5rem, e uma grade que não coincide com a barra é pior que
 * grade nenhuma — ela mede errado com cara de precisão.
 *
 * Agora a grade mora DENTRO do trilho de cada linha. Empilhadas, as linhas
 * verticais formam a mesma grade contínua de antes, e o alinhamento passa a ser
 * impossível de errar.
 */
const TRILHO = "w-[17rem] lg:w-[21rem] shrink-0";

/** As marcas do eixo. O 50 é o ponto de dúvida máxima — a ideia central daqui. */
const MARCAS = [0, 25, 50, 75, 100];

function LinhasDaGrade() {
  return (
    <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
      {MARCAS.map((marca) => (
        <div
          key={marca}
          className={`absolute inset-y-0 w-px ${marca === 50 ? "bg-border" : "bg-border/35"}`}
          style={{ left: `${marca}%` }}
        />
      ))}
    </div>
  );
}

/** Divergência mínima para a nossa leitura merecer aparecer na lista. */
const DIVERGENCIA_MINIMA_PP = 4;

/** O eixo, escrito uma vez no topo da lista. */
export function EixoDeProbabilidade() {
  return (
    <div className="hidden md:flex items-end gap-4 px-3 sm:px-4 pt-3 pb-1.5 border-b border-border/40">
      <p className="flex-1 min-w-0 text-[0.8125rem] text-muted-foreground">
        Chance segundo o mercado
      </p>
      <div className={`relative h-4 ${TRILHO}`}>
        {MARCAS.map((marca) => (
          <span
            key={marca}
            className={`absolute bottom-0 font-mono text-[0.6875rem] tabular-nums ${
              marca === 50 ? "text-foreground/70" : "text-muted-foreground"
            }`}
            style={{
              left: `${marca}%`,
              // As pontas alinham para dentro: centralizar em 0 e 100 cortaria
              // metade do número na borda do contêiner.
              transform: marca === 0 ? "none" : marca === 100 ? "translateX(-100%)" : "translateX(-50%)",
            }}
          >
            {marca}
          </span>
        ))}
      </div>
      {/* Reserva a mesma largura da coluna de movimento e ações das linhas, para
          o eixo terminar exatamente onde as barras terminam. */}
      <span className="w-[5.5rem] shrink-0" aria-hidden="true" />
    </div>
  );
}

export function MercadoLinha({ item, onCompare, inCompare, onWatch, watched }: {
  item: TrendingItem;
  onCompare?: (item: TrendingItem) => void;
  inCompare?: boolean;
  onWatch?: (item: TrendingItem) => void;
  watched?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [traducao, setTraducao] = useState<string | null>(null);

  const ehMercado = item.source !== "reddit";
  // `useLivePrice` trabalha em 0–100 — é o WebSocket de preços que o site já tem.
  const base = item.yesProb !== undefined ? Math.round(item.yesProb * 100) : 0;
  const { pct: valorAoVivo, flash } = useLivePrice(item.id, base);
  const jlbEdge = useEdge(item.id);

  useEffect(() => {
    if (!ehMercado || pareceEmPortugues(item.title)) return;
    let cancelado = false;
    void traduzir(item.title).then((t) => { if (!cancelado) setTraducao(t); });
    return () => { cancelado = true; };
  }, [item.id, ehMercado, item.title]);

  const valor = item.yesProb !== undefined ? valorAoVivo : null;
  const todos = item.parsedOutcomes ?? [];
  const desfechos = todos.slice(0, MAX_DESFECHOS);
  const sobram = todos.length - desfechos.length;

  // Num mercado de vários desfechos, quem manda na barra é o líder — é a leitura
  // equivalente ao "sim" de um mercado binário.
  const barra = todos.length ? Math.round((todos[0]?.prob ?? 0) * 100) : valor;

  const variacao = item.weekPriceChange !== undefined ? item.weekPriceChange * 100 : null;
  const destino = ehMercado ? `/mercados/${item.id}` : undefined;
  const divergiu = jlbEdge && Math.abs(jlbEdge.edge) >= DIVERGENCIA_MINIMA_PP;

  return (
    <article className="relative border-b border-border/30 last:border-b-0 transition-colors hover:bg-card/60">
      <div className="flex items-start gap-4 px-3 sm:px-4 py-3.5">

        {/* ── O QUÊ ───────────────────────────────────────────────────────── */}
        {/* `h2`, e não `h3`: cada mercado é uma seção de primeiro nível dentro
            da lista, e não há `h2` acima para pendurar um `h3`. A varredura
            pegou o salto h1→h3 no mesmo minuto em que ele nasceu — é para isso
            que ela mede sozinha. */}
        <div className="min-w-0 flex-1">
          {destino ? (
            <Link href={destino}>
              <h2 className="text-[0.9375rem] leading-snug text-foreground hover:text-primary transition-colors cursor-pointer">
                {item.title}
              </h2>
            </Link>
          ) : (
            <h2 className="text-[0.9375rem] leading-snug text-foreground">{item.title}</h2>
          )}

          {traducao && traducao !== item.title && (
            <p className="text-[0.8125rem] leading-snug text-muted-foreground mt-0.5">{traducao}</p>
          )}

          {/* Os desfechos de um mercado múltiplo, em uma linha. Sem eles,
              "Eleição 2028 — 17%" não diz de QUEM é o 17%. */}
          {desfechos.length > 0 && (
            <p className="mt-1.5 text-[0.8125rem] text-foreground/70 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              {desfechos.map((d) => (
                <span key={d.label} className="whitespace-nowrap">
                  <span className="font-mono tabular-nums text-foreground">{Math.round(d.prob * 100)}</span>
                  {" "}{d.label}
                </span>
              ))}
              {sobram > 0 && (
                <span className="text-muted-foreground">e mais {sobram}</span>
              )}
            </p>
          )}

          {/* Procedência, assunto e tamanho — texto, não chip. Eram sete chips
              coloridos por card, e chip colorido é promessa de importância que
              eles não cumpriam. */}
          <p className="mt-1.5 text-[0.8125rem] text-muted-foreground flex flex-wrap items-center gap-x-2">
            <span>
              {item.source === "reddit" ? `r/${item.subreddit}`
                : item.source === "kalshi" ? "Kalshi"
                : item.source === "manifold" ? "Manifold" : "Polymarket"}
            </span>
            {item.normalizedCategory !== "other" && item.normalizedCategory !== "all" && (
              <><span aria-hidden="true">·</span><span>{CATEGORY_LABELS[item.normalizedCategory]}</span></>
            )}
            {item.volume !== undefined && item.volume > 0 && (
              <><span aria-hidden="true">·</span><span>{formatVolume(item.volume)}</span></>
            )}
            {divergiu && (
              <>
                <span aria-hidden="true">·</span>
                {/* O ÚNICO dourado da linha, e ele é raro de propósito: só quando
                    a nossa leitura diverge do preço em 4 pontos ou mais. */}
                <span className="text-primary" title={`Nossa leitura para este mercado: ${pct(jlbEdge!.aiFairValue)}`}>
                  nós diríamos {pct(jlbEdge!.aiFairValue)}
                </span>
              </>
            )}
          </p>

          {/* No celular as ações descem para cá: ao lado do número elas roubavam
              a largura do título, que quebrava em quatro linhas. */}
          <div className="md:hidden flex items-center justify-between mt-1 -ml-1.5">
            <Acoes />
            {variacao !== null && Math.abs(variacao) >= 1 && (
              <p className={`font-mono text-[0.8125rem] tabular-nums ${variacao > 0 ? "text-positive" : "text-negative"}`}>
                {pp(variacao)}<span className="text-muted-foreground ml-1">7d</span>
              </p>
            )}
          </div>
        </div>

        {/* ── QUANTO: a barra, alinhada ao eixo do topo ────────────────────── */}
        {/* `self-stretch`, e não altura fixa: a grade precisa atravessar a
            linha inteira. Com altura fixa ela virava um tracinho solto no meio
            da linha, e o olho perdia a referência entre barras distantes na
            vertical — que é exatamente o trabalho da grade. */}
        <div className={`hidden md:block relative self-stretch min-h-[2.5rem] ${TRILHO}`}>
          <LinhasDaGrade />
          {barra !== null && (
            <>
              <div
                className={`absolute top-1/2 -translate-y-1/2 h-5 left-0 rounded-r-[3px] transition-[width,background-color] duration-500 ${
                  flash === "up" ? "bg-positive/40" : flash === "down" ? "bg-negative/40" : "bg-[var(--extensao)]"
                }`}
                style={{ width: `${Math.max(1.5, Math.min(100, barra))}%` }}
                aria-hidden="true"
              />
              {/* O número mora NA PONTA da barra: é onde o olho já está depois de
                  percorrer a extensão, e evita uma terceira coluna. */}
              <p
                className="absolute top-1/2 -translate-y-1/2 font-mono font-semibold tabular-nums text-foreground text-[1.375rem] leading-none whitespace-nowrap"
                style={
                  // Acima de 78% o número não cabe fora da barra sem sair do
                  // contêiner, então ele entra para dentro dela.
                  barra > 78
                    ? { right: `${100 - Math.min(100, barra)}%`, paddingRight: "0.5rem" }
                    : { left: `${Math.max(1.5, barra)}%`, paddingLeft: "0.5rem" }
                }
              >
                {valor ?? barra}<span className="text-[0.75rem] align-top text-muted-foreground">%</span>
              </p>
            </>
          )}
        </div>

        {/* No celular não há espaço para o eixo, então o número volta a ser um
            número — mas continua em mono e tabular, alinhado com os vizinhos. */}
        <div className="md:hidden shrink-0 text-right -mt-0.5">
          <p className="font-mono font-semibold tabular-nums text-foreground text-[1.75rem] leading-none">
            {valor ?? barra ?? "—"}
            {valor !== null && <span className="text-[0.75rem] align-top text-muted-foreground">%</span>}
          </p>
        </div>

        {/* ── MOVIMENTO E AÇÕES ───────────────────────────────────────────── */}
        <div className="hidden md:flex shrink-0 flex-col items-end gap-1 w-[5.5rem]">
          {variacao !== null && Math.abs(variacao) >= 1 ? (
            <p className={`font-mono text-[0.8125rem] tabular-nums leading-none ${
              variacao > 0 ? "text-positive" : "text-negative"
            }`}>
              {pp(variacao)}
            </p>
          ) : <span className="h-[0.8125rem]" aria-hidden="true" />}

          <Acoes />
        </div>
      </div>

      {aberto && (
        <div className="px-3 sm:px-4 pb-4">
          <NewsAnalysisPanel item={item} />
        </div>
      )}
    </article>
  );

  function Acoes() {
    return (
      <div className="flex items-center -mr-1.5">
        {ehMercado && (
          <button
            onClick={() => setAberto((v) => !v)}
            aria-expanded={aberto}
            className="alvo-minimo justify-center rounded-md text-muted-foreground hover:text-primary transition-colors"
            title="Ver a análise da IA"
          >
            <ChevronDown className={`w-4 h-4 transition-transform ${aberto ? "rotate-180" : ""}`} aria-hidden="true" />
          </button>
        )}
        {onCompare && (
          <button
            onClick={() => onCompare(item)}
            className={`alvo-minimo justify-center rounded-md transition-colors ${inCompare ? "text-neon-blue" : "text-muted-foreground hover:text-foreground"}`}
            title={inCompare ? "Remover da comparação" : "Comparar"}
          >
            <Scale className="w-4 h-4" aria-hidden="true" />
          </button>
        )}
        <button
          onClick={() => onWatch?.(item)}
          className={`alvo-minimo justify-center rounded-md transition-colors ${watched ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
          title={watched ? "Remover da watchlist" : "Acompanhar"}
        >
          {watched
            ? <BookmarkCheck className="w-4 h-4" aria-hidden="true" />
            : <Bookmark className="w-4 h-4" aria-hidden="true" />}
        </button>
        {item.externalUrl && (
          <a
            href={item.externalUrl} target="_blank" rel="noopener noreferrer"
            className="alvo-minimo justify-center rounded-md text-muted-foreground hover:text-foreground transition-colors"
            title="Abrir na plataforma de origem"
          >
              <ExternalLink className="w-4 h-4" aria-hidden="true" />
          </a>
        )}
      </div>
    );
  }
}
