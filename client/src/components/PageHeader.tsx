/**
 * PageHeader — o cabeçalho das 22 telas de conteúdo.
 *
 * 🔴 REESCRITO EM 27/09/2026, e o motivo está no que ele era.
 *
 * O arquivo anterior empilhava quatro tiques de página gerada, de uma vez só,
 * em 22 telas:
 *
 *  · um rótulo em CAIXA ALTA com letra espaçada e um pontinho pulsando acima de
 *    todo título. Em 12 dos 17 casos ele repetia o próprio título — "Sobre" em
 *    cima de "Sobre a JLB", "Perfil" em cima de "Perfil", "Legal" em cima de
 *    "Termos de uso";
 *  · a primeira palavra do título em dourado. O comentário antigo chamava isso
 *    de "a assinatura dos títulos da casa", e é aí que dói: é o oposto de uma
 *    assinatura. Acentuar uma palavra do título é o recurso que toda página
 *    gerada usa, justamente por não exigir nenhuma decisão;
 *  · entrada em cascata (80ms no título, 160ms no subtítulo) POR CIMA da
 *    animação de rota que o `EntradaDePagina` já faz — duas entradas
 *    empilhadas na mesma tela;
 *  · uma linha de gradiente dourado no topo e outra desbotando no rodapé.
 *
 * E havia uma ideia boa enterrada embaixo de tudo isso: a RÉGUA DE
 * PROBABILIDADE (0 · 25 · 50 · 75 · 100), com a justificativa certa escrita no
 * próprio arquivo — "probabilidade é a unidade fundamental da plataforma, não
 * preço, não retorno".
 *
 * Só que ela era desenhada a 8% de opacidade, com rótulos a 20%, e o `probability`
 * NUNCA foi passado por nenhuma das 22 telas. A régua existia havia meses e
 * jamais mediu coisa alguma — inclusive em /termos e /privacidade, onde não há
 * probabilidade nenhuma para medir.
 *
 * AGORA ELA MEDE, E SÓ APARECE QUANDO HÁ O QUE MEDIR. Sem `medida` não existe
 * régua: a ausência é informação tanto quanto a presença.
 */

/** O que a régua mostra. Ver o aviso sobre barra de progresso em `Regua`. */
export interface Medida {
  /** Posição na escala, de 0 a 100. */
  valor: number;
  /**
   * O que este número mede, em palavras — e não é opcional de propósito.
   * Número sem nome é o que a régua já era: enfeite com aparência de dado.
   */
  rotulo: string;
}

interface Props {
  title: string;
  subtitle?: string;
  /**
   * Informação que o título não dá sozinho ("Grátis", "Beta", "Avançado").
   *
   * Substituiu o `badge`, e a troca de nome foi de propósito: obrigou a visitar
   * as 22 chamadas e decidir uma por uma se aquilo dizia alguma coisa. Doze não
   * diziam. Renderiza em caixa normal, depois do subtítulo — não é eyebrow.
   */
  nota?: string;
  image?: string;
  medida?: Medida;
  /**
   * Versão enxuta, para TELA DE TRABALHO (DSH-07).
   *
   * A auditoria apontou "hero de marketing dentro de uma tela de aplicação": o
   * Dashboard, que a pessoa abre para consultar os próprios números, começava
   * com o mesmo tratamento de uma landing page. Numa tela de conversão isso
   * convida; numa de trabalho, atrasa.
   */
  compacto?: boolean;
}

const GRADUACOES = [0, 25, 50, 75, 100];

/**
 * A régua de probabilidade.
 *
 * ⚠️ NÃO É UMA BARRA DE PROGRESSO, e a diferença é o desenho inteiro. Barra de
 * progresso PREENCHE da esquerda até o valor, e o que se lê é "quanto já foi" —
 * uma quantidade acumulada. Probabilidade não acumula nada: ela tem uma POSIÇÃO
 * numa escala que existe inteira o tempo todo, dos dois lados do valor.
 *
 * Daí cada escolha aqui: nada preenchido; graduações DESCENDO da linha, como as
 * de uma régua de verdade; a agulha SUBINDO no ponto medido, fina, porque é uma
 * leitura e não um volume. Preencher o trecho à esquerda faria o desenho dizer
 * outra coisa — e seria, de quebra, o tratamento que qualquer página usa.
 */
function Regua({ valor, rotulo }: Medida) {
  const pct = Math.max(0, Math.min(100, valor));
  // A agulha vira o rótulo para dentro perto das pontas, senão ele sai da tela.
  const ancora = pct > 82 ? "right-0" : pct < 18 ? "left-0" : "left-1/2 -translate-x-1/2";

  return (
    // Alinhada com a coluna de texto, e não com o container inteiro.
    //
    // A primeira versão ia de borda a borda: os rótulos 0 e 100 caíam nos
    // extremos da tela, longe do título, e a régua lia como um eixo de gráfico
    // solto que tinha sobrado de outro componente. Presa à mesma medida do
    // texto, ela vira o rodapé do bloco — que é o que ela é.
    //
    // `mt-12` e não `mt-8`: o rótulo da agulha sobe ACIMA da linha, e com a
    // folga menor ele encostava no subtítulo.
    <div className="mt-12 max-w-3xl">
      <div className="relative h-px bg-border" aria-hidden="true">
        {GRADUACOES.map((g) => (
          <span
            key={g}
            className="absolute top-0 w-px h-1.5 bg-border"
            style={{ left: `${g}%` }}
          />
        ))}

        {/* A agulha: sobe da linha, fina, na cor da marca — é a NOSSA leitura. */}
        <span
          className="absolute bottom-0 w-px h-5 bg-gold"
          style={{ left: `${pct}%` }}
        >
          <span className={`absolute bottom-full mb-1.5 whitespace-nowrap ${ancora}`}>
            <span className="font-mono text-sm font-semibold text-gold tabular-nums">{pct}%</span>
          </span>
        </span>
      </div>

      {/* A escala. Mono e tabular porque são medidas, não texto. */}
      <div className="relative h-4 mt-1.5" aria-hidden="true">
        {GRADUACOES.map((g) => (
          <span
            key={g}
            className="absolute top-0 font-mono text-[11px] text-muted-foreground tabular-nums"
            style={{
              left: `${g}%`,
              // Pontas para dentro: centralizar em 0% e 100% corta metade do número.
              transform: g === 0 ? "translateX(0)" : g === 100 ? "translateX(-100%)" : "translateX(-50%)",
            }}
          >
            {g}
          </span>
        ))}
      </div>

      {/* O que o número mede. É esta linha que separa régua de enfeite — e é
          também o texto que quem usa leitor de tela recebe, já que o desenho
          acima é `aria-hidden`. */}
      <p className="mt-1 text-xs text-muted-foreground">
        <span className="sr-only">{pct}% — </span>{rotulo}
      </p>
    </div>
  );
}

export default function PageHeader({ title, subtitle, nota, image, medida, compacto = false }: Props) {
  return (
    <section className="relative overflow-hidden border-b border-border/20">
      {image && (
        <div className="absolute inset-0" aria-hidden="true">
          <img src={image} alt="" className="w-full h-full object-cover opacity-10" />
          <div className="absolute inset-0 bg-gradient-to-r from-background via-background/90 to-background/60" />
        </div>
      )}

      {/* Respiro maior em cima que embaixo, de propósito: o título tem altura
          de maiúscula, o último elemento embaixo tem descida de letra ou uma
          linha de 11px. Padding simétrico aqui LÊ como sobra, não como folga —
          foi o que a primeira captura mostrou. */}
      <div className={`container relative ${compacto ? "pt-6 pb-5 md:pt-7 md:pb-6" : "pt-12 pb-9 md:pt-16 md:pb-11"}`}>
        <div className="max-w-3xl">
          {/* UMA COR. O tamanho, o peso e o entrelinhamento fazem a hierarquia —
              é para isso que existe uma fonte de display escolhida a dedo. */}
          <h1 className={`font-display font-semibold text-foreground tracking-[-0.025em] text-balance ${
            compacto ? "text-2xl md:text-3xl leading-tight" : "text-[2rem] md:text-[2.75rem] lg:text-[3.25rem] leading-[1.06]"
          }`}>
            {title}
          </h1>

          {subtitle && (
            <p className="mt-4 text-muted-foreground max-w-[58ch] text-sm md:text-base leading-relaxed">
              {subtitle}
            </p>
          )}

          {nota && (
            <p className="mt-3 text-xs text-muted-foreground">{nota}</p>
          )}
        </div>

        {medida && !compacto && <Regua {...medida} />}
      </div>
    </section>
  );
}
