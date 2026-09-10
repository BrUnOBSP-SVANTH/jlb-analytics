import { ReactNode, useEffect, useRef, useState } from "react";

interface Props {
  children: ReactNode;
  className?: string;
  delay?: number;
  direction?: "up" | "down" | "left" | "right" | "none";
}

/**
 * AnimatedSection — revela o conteúdo ao entrar na tela.
 *
 * O QUE ISTO CONSERTA (TRV-05, e por tabela DET-01, PRV-03, SIM-02, HOME-04).
 * A auditoria de 09/09/2026 encontrou cards, seções e o rodapé inteiro parados
 * em opacidade ~0,15 e sem se recuperar, em /apostas, /previsao, /simulador,
 * /perfil e /noticias. Um viewport inteiro em branco. A tela de detalhe de
 * mercado levava ~9 segundos para mostrar qualquer coisa — e o DOM já estava
 * pronto desde o primeiro segundo: era esta animação segurando tudo.
 *
 * A CAUSA. A versão anterior renderizava `style={{ opacity: inView ? 1 : 0 }}` e
 * dependia do IntersectionObserver para virar visível, com
 * `rootMargin: "-50px 0px"` e `threshold: 0.01`. Três formas de nunca disparar:
 *
 *   · o bloco nasce com altura zero (o conteúdo ainda está chegando da rede) —
 *     área zero nunca cruza um limiar de 1% da área;
 *   · dois AnimatedSection aninhados multiplicam a opacidade: 0,4 × 0,4 = 0,16,
 *     que é exatamente o 0,15 medido;
 *   · o observer não roda de jeito nenhum (erro anterior no bundle, extensão do
 *     navegador, JS bloqueado) — e aí a página fica permanentemente invisível.
 *
 * O CONSERTO, que é o que o artefato prescreve: **nenhum bloco nasce em
 * `opacity: 0`**. O estado de repouso é visível; a animação é enriquecimento.
 *
 *   1. Sem estilo inline de opacidade. Se nada mais acontecer, o conteúdo está lá.
 *   2. A revelação é `@keyframes` com `animation-fill-mode: backwards` — o
 *      navegador aplica o quadro inicial só ENQUANTO a animação existe. Falhou o
 *      CSS? O conteúdo aparece.
 *   3. Rede de segurança de 1,2 s: se o observer não disparou, revela assim mesmo.
 *   4. `prefers-reduced-motion` entrega a página pronta, sem animação nenhuma.
 *
 * A regra que fica: animação pode atrasar a chegada de um conteúdo, nunca
 * impedi-la. Se o único caminho até o conteúdo visível passa pelo JavaScript,
 * o conteúdo não existe.
 */
export default function AnimatedSection({ children, className = "", delay = 0, direction = "up" }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [revelado, setRevelado] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let vivo = true;
    const revelar = () => { if (vivo) { vivo = false; setRevelado(true); } };

    // A rede de segurança roda SEMPRE, em paralelo com o observer. É ela que
    // garante que "não animou" nunca vire "não apareceu".
    const rede = setTimeout(revelar, 1200);

    // `threshold: 0` — basta encostar na viewport. O 0.01 anterior é uma fração
    // da ÁREA do elemento, e bloco de altura zero nunca chega lá.
    const obs = new IntersectionObserver(
      ([entrada]) => { if (entrada.isIntersecting) revelar(); },
      { rootMargin: "0px 0px -40px 0px", threshold: 0 },
    );
    obs.observe(el);

    return () => { vivo = false; clearTimeout(rede); obs.disconnect(); };
  }, []);

  return (
    <div
      ref={ref}
      // Sem `revelar-pronto` o bloco continua visível — a classe só LIGA a
      // animação. É essa inversão que torna o defeito impossível de voltar.
      className={`revelar revelar-${direction}${revelado ? " revelar-pronto" : ""} ${className}`.trim()}
      style={delay ? { animationDelay: `${delay}s` } : undefined}
    >
      {children}
    </div>
  );
}
