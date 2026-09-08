/**
 * LoadingSkeleton — o card enquanto carrega.
 *
 * POR QUE ELE PRECISA SER FIEL. Um esqueleto não existe para "mostrar que está
 * carregando" — o spinner faz isso. Ele existe para RESERVAR O ESPAÇO exato que o
 * conteúdo vai ocupar, de modo que nada pule quando o dado chega. Quando o
 * esqueleto descreve um card que não existe mais, ele faz o contrário: promete um
 * formato e entrega outro, e a página dá um solavanco na frente do usuário.
 *
 * Era o caso aqui. O card ganhou a barra de probabilidade no topo, o número
 * gigante de 44px e o minigráfico de 7 dias; o esqueleto continuava desenhando um
 * círculo de 32px e nenhum gráfico. A tela pulava em toda carga, e ninguém
 * associava isso ao esqueleto — parecia lentidão.
 *
 * Regra ao mexer no card: mexer aqui junto. As duas coisas são a mesma forma.
 */
export function LoadingSkeleton() {
  return (
    <div className="glass-card rounded-xl p-5 space-y-4 animate-pulse h-full flex flex-col relative overflow-hidden">
      {/* A barra de probabilidade do topo. Largura neutra (metade) porque ainda
          não sabemos a chance — mas o espaço já está reservado. */}
      <span className="absolute top-0 left-0 h-[2px] w-1/2 bg-secondary/40" aria-hidden="true" />

      {/* Cabeçalho: marcador + título + o NÚMERO, que é o herói do card. */}
      <div className="flex items-start gap-3">
        <div className="w-2 h-2 rounded-full bg-secondary/50 mt-1.5 shrink-0" />
        <div className="flex-1 space-y-2">
          {/* Duas linhas de título + a linha da tradução em itálico. Medido:
              com uma linha a menos o esqueleto ficava 76px mais curto que o card
              real, e a lista inteira dava um solavanco quando o dado chegava. */}
          <div className="h-3.5 bg-secondary/50 rounded w-11/12" />
          <div className="h-3.5 bg-secondary/50 rounded w-8/12" />
          <div className="h-3 bg-secondary/30 rounded w-9/12" />
          <div className="h-3 bg-secondary/25 rounded w-5/12" />
          <div className="flex gap-1.5 mt-1">
            <div className="h-4 w-14 bg-secondary/30 rounded-full" />
            <div className="h-4 w-10 bg-secondary/20 rounded-full" />
          </div>
        </div>
        {/* 44px de altura = os 2.75rem do número real. Era um círculo de 32px, e
            a diferença aparecia como um pulo no cabeçalho inteiro. */}
        <div className="shrink-0 text-right space-y-1.5">
          <div className="h-11 w-16 bg-secondary/35 rounded" />
          <div className="h-2 w-14 bg-secondary/20 rounded ml-auto" />
        </div>
      </div>

      {/* Barra SIM/NÃO + os dois rótulos embaixo dela. */}
      <div className="space-y-1.5">
        <div className="h-2 bg-secondary/30 rounded-full w-full" />
        <div className="flex justify-between">
          <div className="h-2.5 bg-secondary/25 rounded w-8" />
          <div className="h-2.5 bg-secondary/25 rounded w-16" />
        </div>
      </div>

      {/* O minigráfico de 7 dias — 96×34, o mesmo tamanho do real. Faltava por
          completo, e é o bloco que mais deslocava o resto do card ao chegar. */}
      <div className="flex items-center gap-1.5">
        <div className="h-[34px] w-24 bg-secondary/20 rounded shrink-0" />
        <div className="h-2.5 bg-secondary/20 rounded w-14" />
      </div>

      {/* Volume */}
      <div className="h-3 bg-secondary/25 rounded w-28" />

      {/* Caixa do "por que está em alta" */}
      <div className="p-3 rounded-lg bg-secondary/10 space-y-1.5">
        <div className="h-3 bg-secondary/20 rounded w-full" />
        <div className="h-3 bg-secondary/15 rounded w-10/12" />
        <div className="h-3 bg-secondary/15 rounded w-7/12" />
      </div>

      {/* Botão de analisar */}
      <div className="h-9 bg-secondary/15 rounded-lg w-full" />

      {/* Rodapé */}
      <div className="flex justify-between items-center pt-1 mt-auto">
        <div className="h-3 bg-secondary/25 rounded w-32" />
        <div className="h-5 bg-secondary/20 rounded w-16" />
      </div>
    </div>
  );
}
