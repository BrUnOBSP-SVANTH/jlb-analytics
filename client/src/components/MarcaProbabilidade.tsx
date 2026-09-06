/**
 * MarcaProbabilidade — o sinal gráfico da casa, em miniatura.
 *
 * POR QUE EXISTE. O site usava ícones de biblioteca em toda parte: um cérebro
 * para "previsão", um chapéu de formatura para "aprender", uma engrenagem para
 * "ferramentas". São ícones bons e são os MESMOS de milhares de sites — foi o que
 * o fundador chamou de "cara de IA". Ícone emprestado não constrói identidade.
 *
 * Esta marca é o nosso assunto reduzido ao mínimo: a linha tracejada da dúvida
 * (50%) e duas curvas que se cruzam nela — o SIM subindo enquanto o NÃO desce.
 * É o mesmo desenho do fundo da home, em 20 pixels. Repetido nos lugares certos,
 * vira sinal reconhecível; e ninguém mais pode usá-lo, porque ele significa
 * exatamente o que a gente faz.
 *
 * Herda `currentColor`, então acompanha a cor de quem a envolve, como um ícone.
 */
export default function MarcaProbabilidade({
  className = "",
  size = 20,
}: { className?: string; size?: number }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      className={className} aria-hidden="true" data-marca-prob=""
    >
      {/* A régua da dúvida: 50%. Sem ela as duas curvas seriam dois riscos. */}
      {/* Traços mais grossos e tracejado mais largo do que pareceria certo no
          desenho grande: em 20px o detalhe fino simplesmente some, e a marca
          vira um risco. Marca pequena precisa ser desenhada para o tamanho em
          que vai ser vista. */}
      <line x1="1.5" y1="12" x2="22.5" y2="12"
        stroke="currentColor" strokeOpacity="0.5" strokeWidth="1.3"
        strokeDasharray="2.5 3" strokeLinecap="round" />

      {/* SIM: sobe da descrença até a certeza. */}
      <path d="M2 19.5 C 7 19, 9 13.5, 12 12 C 15 10.5, 17 5.5, 22 4.5"
        stroke="currentColor" strokeWidth="2.4"
        strokeLinecap="round" strokeLinejoin="round" />

      {/* NÃO: o espelho exato, mais discreto — a hierarquia segue quem vence. */}
      <path d="M2 4.5 C 7 5, 9 10.5, 12 12 C 15 13.5, 17 19, 22 19.5"
        stroke="currentColor" strokeOpacity="0.5" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" />

      {/* O cruzamento: onde as duas valem o mesmo. */}
      <circle cx="12" cy="12" r="2.2" fill="currentColor" />
    </svg>
  );
}
