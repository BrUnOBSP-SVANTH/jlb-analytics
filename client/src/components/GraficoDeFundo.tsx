/**
 * GraficoDeFundo — o pano de fundo do hero, desenhado em canvas.
 *
 * POR QUE NÃO UMA IMAGEM DE GRÁFICO GENÉRICA. Toda página feita às pressas hoje
 * usa o mesmo gradiente e o mesmo círculo borrado — era exatamente o que estava
 * aqui. Trocar por um "gráfico bonito" qualquer resolveria pela metade: continuaria
 * decoração emprestada.
 *
 * O que se desenha aqui é O NOSSO ASSUNTO. Um mercado de previsão tem uma forma
 * própria: o preço oscila em torno da dúvida e, quando o evento acontece, ele
 * RESOLVE — vai para 100% ou para 0% e para de se mexer. Nenhum outro gráfico do
 * mundo faz isso. Então o fundo mostra várias dessas trajetórias saindo dos 50%
 * (a dúvida completa) e terminando decididas, com a linha dos 50% marcada.
 * Quem entende, reconhece; quem não entende, vê um gráfico bonito. Os dois ganham.
 *
 * Custo: um canvas de ~40 linhas, sem biblioteca, sem imagem para baixar.
 *
 * Acessibilidade e desempenho:
 *  · `prefers-reduced-motion` → desenha o quadro final e para. Sem exceção.
 *  · redesenha ao redimensionar, com devicePixelRatio (senão borra em tela retina).
 *  · `aria-hidden` e `pointer-events-none`: é papel de parede, não conteúdo.
 */
import { useEffect, useRef } from "react";

/** Quantas trajetórias. Poucas de propósito: é fundo, não painel. */
const CAMINHOS = 7;
/** Passos por trajetória — resolução do desenho, não do dado. */
const PASSOS = 90;

export interface Ponto { x: number; y: number }

/**
 * Uma trajetória de preço de mercado de previsão: passeio aleatório em torno de
 * 50% que, na reta final, é puxado para o desfecho. A "puxada" é o que diferencia
 * isto de um gráfico de ações — mercado de previsão termina em 0 ou 100, sempre.
 */
export function trajetoria(semente: number, resolveEmSim: boolean): Ponto[] {
  // Gerador determinístico: o mesmo desenho a cada carga, sem piscar diferente
  // a cada visita (e sem depender de Math.random, que atrapalharia o teste).
  let s = semente * 9973;
  const aleatorio = () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };

  const pontos: Ponto[] = [];
  let valor = 0.5;
  for (let i = 0; i <= PASSOS; i++) {
    const t = i / PASSOS;
    // Força de resolução: quase nula no começo, dominante no fim.
    const puxada = Math.pow(t, 3.2);
    const ruido = (aleatorio() - 0.5) * 0.075 * (1 - puxada);
    valor += ruido;
    valor += ((resolveEmSim ? 1 : 0) - valor) * puxada * 0.09;
    valor = Math.max(0.02, Math.min(0.98, valor));
    pontos.push({ x: t, y: valor });
  }
  return pontos;
}

export default function GraficoDeFundo({ className = "" }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const semMovimento = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const caminhos = Array.from({ length: CAMINHOS }, (_, i) => trajetoria(i + 1, i % 2 === 0));

    let animId = 0;
    let progresso = semMovimento ? 1 : 0;

    function desenhar() {
      const canvas = canvasRef.current;
      if (!canvas || !ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const largura = canvas.clientWidth;
      const altura = canvas.clientHeight;
      if (canvas.width !== largura * dpr || canvas.height !== altura * dpr) {
        canvas.width = largura * dpr;
        canvas.height = altura * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      ctx.clearRect(0, 0, largura, altura);
      if (largura < 2 || altura < 2) return;

      const emY = (v: number) => altura * (1 - v) * 0.88 + altura * 0.06;

      // A linha dos 50% — a régua da dúvida. É o que dá sentido ao resto.
      ctx.strokeStyle = "oklch(0.78 0.12 85 / 9%)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 7]);
      ctx.beginPath();
      ctx.moveTo(0, emY(0.5));
      ctx.lineTo(largura, emY(0.5));
      ctx.stroke();
      ctx.setLineDash([]);

      caminhos.forEach((pontos, i) => {
        // Cada trajetória entra um pouco depois da anterior — dá a leitura de
        // mercados chegando ao vivo, que é o que a página promete logo acima.
        const atraso = i * 0.06;
        const avanco = Math.max(0, Math.min(1, (progresso - atraso) / 0.55));
        if (avanco <= 0) return;
        const ate = Math.floor(avanco * PASSOS);

        const resolveuAlto = pontos[PASSOS].y > 0.5;
        // O ouro é a marca; o azul entra só como contraponto frio nas que caem.
        ctx.strokeStyle = resolveuAlto
          ? `oklch(0.78 0.12 85 / ${8 + i}%)`
          : `oklch(0.72 0.09 240 / ${6 + i}%)`;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        for (let k = 0; k <= ate; k++) {
          const p = pontos[k];
          const x = p.x * largura;
          const y = emY(p.y);
          if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // O ponto final só aparece quando a trajetória REALMENTE terminou —
        // sinaliza a resolução, que é o momento que o site inteiro celebra.
        if (avanco >= 1) {
          const p = pontos[PASSOS];
          ctx.fillStyle = resolveuAlto ? "oklch(0.78 0.12 85 / 22%)" : "oklch(0.72 0.09 240 / 18%)";
          ctx.beginPath();
          ctx.arc(p.x * largura, emY(p.y), 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    }

    function quadro() {
      progresso = Math.min(1, progresso + 0.006);
      desenhar();
      if (progresso < 1) animId = requestAnimationFrame(quadro);
    }

    desenhar();
    if (!semMovimento) animId = requestAnimationFrame(quadro);

    const aoRedimensionar = () => desenhar();
    window.addEventListener("resize", aoRedimensionar);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", aoRedimensionar);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 w-full h-full pointer-events-none ${className}`}
      aria-hidden="true"
    />
  );
}
