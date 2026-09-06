/**
 * EntradaDePagina — a página inteira sobe e aparece, a cada abertura e a cada
 * troca de rota.
 *
 * POR QUE AQUI, E NÃO EM CADA TELA. Metade do site (13 das 27 páginas) não tinha
 * animação nenhuma: o conteúdo simplesmente estava lá, seco. Sair adicionando um
 * `AnimatedSection` em treze arquivos resolveria hoje e voltaria a divergir na
 * próxima tela criada — o mesmo problema que a regra de linguagem e o guardrail
 * de dado já tiveram neste projeto. Aqui a entrada nasce de graça em toda página
 * que existir daqui em diante, inclusive as que ninguém escreveu ainda.
 *
 * ⚠️ POR QUE @keyframes E NÃO UMA TRANSIÇÃO DE ESTADO. A primeira versão guardava
 * um `visivel` no estado e virava de `false` para `true` dentro de dois
 * requestAnimationFrame. Parecia certo e NÃO ANIMAVA — descobri medindo a
 * opacidade real no navegador durante a navegação: ela ficava em 1 o tempo todo.
 * O motivo é que o navegador agrupa as mudanças de estilo entre quadros; sem uma
 * leitura forçada do layout no meio, ele nunca vê o estado inicial e portanto não
 * tem de onde transicionar. Uma animação por keyframes não depende disso: ela
 * toca sempre que o elemento nasce, e a `key` amarrada à rota faz ele nascer de
 * novo a cada navegação.
 *
 * A animação é curta de propósito (360ms) e mexe só em opacidade e deslocamento —
 * as duas propriedades que o navegador anima sem recalcular layout. Enfeite que
 * atrasa a leitura vira defeito: quem entrou para ver um preço não quer esperar.
 *
 * `prefers-reduced-motion` desliga tudo pelo CSS (ver a regra em index.css): o
 * conteúdo aparece pronto, sem movimento nenhum.
 */
import { useLocation } from "wouter";

export default function EntradaDePagina({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    // A `key` é o mecanismo, não um detalhe: sem ela o React reaproveitaria o
    // mesmo nó entre rotas e a animação só tocaria no primeiro carregamento.
    // `data-entrada-pagina` existe para o teste conseguir medir a animação sem
    // adivinhar seletor — foi assim que a versão quebrada foi flagrada.
    <div key={location} data-entrada-pagina="" className="entrada-pagina">
      {children}
    </div>
  );
}
