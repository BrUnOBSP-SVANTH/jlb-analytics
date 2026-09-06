/**
 * GraficoDeFundo — o gráfico que fica atrás do título da home.
 *
 * PRIMEIRA TENTATIVA, E POR QUE ELA NÃO SERVIU. Comecei desenhando doze
 * trajetórias de preço espalhadas pelo quadro. A ideia era certa (mostrar a forma
 * do nosso assunto), a execução não: doze linhas sobrepostas não leem como
 * gráfico, leem como linhas jogadas no fundo. O fundador apontou na hora, e tinha
 * razão — quantidade não vira leitura, estrutura vira.
 *
 * O QUE ESTÁ AQUI AGORA é um gráfico de verdade, com duas linhas só. E o par não
 * é escolha estética: é o fato central de um mercado binário. SIM e NÃO são
 * COMPLEMENTARES — se o SIM vale 70%, o NÃO vale exatamente 30%, e as duas somam
 * 100% o tempo todo. Uma sobe na medida exata em que a outra desce, e elas se
 * cruzam nos 50%: o instante de dúvida máxima. É o site inteiro em duas curvas —
 * a incerteza, o cruzamento, a resolução.
 *
 * A curva do NÃO é literalmente `1 − SIM`, calculada e não desenhada de olho.
 * Um gráfico que ilustra dado, num site de dados, tem que obedecer ao dado.
 *
 * Custo: um canvas, sem biblioteca e sem imagem para baixar.
 *
 * Acessibilidade e desempenho:
 *  · `prefers-reduced-motion` → desenha o quadro final e para. Sem exceção.
 *  · redesenha ao redimensionar (com devicePixelRatio) e ao trocar de tema.
 *  · `aria-hidden` e `pointer-events-none`: é papel de parede, não conteúdo.
 */
import { useEffect, useRef } from "react";

/** Pontos da curva. Alto o bastante para a linha sair lisa em tela larga. */
const PASSOS = 160;

export interface Ponto { x: number; y: number }

/**
 * A curva do SIM: começa DESCRENTE (~5%), vira no meio e resolve alto (~95%).
 *
 * A forma conta uma história, e é de propósito. Um mercado que só sobe é uma
 * barra de progresso; o que prende é a VIRADA — o evento que quase ninguém dava
 * como provável e que acabou acontecendo. Como o NÃO é o espelho exato, as duas
 * curvas se cruzam no meio e desenham um X: uma subindo, a outra descendo.
 *
 * Os três trechos: descrença no começo, a virada quando a notícia chega, e a
 * subida que achata perto do teto (a certeza chegando, sem mais o que descobrir).
 */
export function curvaSim(): Ponto[] {
  const pontos: Ponto[] = [];
  for (let i = 0; i <= PASSOS; i++) {
    const t = i / PASSOS;

    // Espinha da curva: sigmoide deslocada — dúvida no começo, virada no meio,
    // certeza no fim. É o formato de quem descobre a resposta aos poucos.
    const sigmoide = 1 / (1 + Math.exp(-9 * (t - 0.46)));
    const base = 0.5 + (sigmoide - 0.5) * 0.92;

    // Ondulação: duas frequências somadas, ambas se apagando no fim. Quando o
    // evento se aproxima, o preço para de balançar — não há mais o que descobrir.
    const balanco =
      Math.sin(t * 11.5) * 0.030 * (1 - t) +
      Math.sin(t * 27 + 1.4) * 0.013 * (1 - t);

    pontos.push({ x: t, y: Math.max(0.03, Math.min(0.97, base + balanco)) });
  }
  return pontos;
}

/**
 * A curva do NÃO. Não é desenhada: é o complemento exato do SIM, porque é isso
 * que ela é num mercado binário. Se a do SIM mudar, esta acompanha sozinha.
 */
export function curvaNao(sim: Ponto[]): Ponto[] {
  return sim.map((p) => ({ x: p.x, y: 1 - p.y }));
}

export default function GraficoDeFundo({ className = "" }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const semMovimento = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const sim = curvaSim();
    const nao = curvaNao(sim);

    let animId = 0;
    let progresso = semMovimento ? 1 : 0;

    function desenhar() {
      const canvas = canvasRef.current;
      if (!canvas || !ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const L = canvas.clientWidth;
      const A = canvas.clientHeight;
      if (canvas.width !== L * dpr || canvas.height !== A * dpr) {
        canvas.width = L * dpr;
        canvas.height = A * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      ctx.clearRect(0, 0, L, A);
      if (L < 2 || A < 2) return;

      // Sobre preto, dourado a 15% salta; sobre o creme do tema claro ele quase
      // some, porque o contraste contra fundo claro é muito menor. Cada tema tem
      // seu tom — mesma discrição, presença igual.
      const claro = document.documentElement.getAttribute("data-theme") === "light"
        || document.documentElement.classList.contains("light");
      const ouro  = (op: number) => claro ? `oklch(0.55 0.13 78 / ${op}%)`  : `oklch(0.80 0.13 85 / ${op}%)`;
      const azul  = (op: number) => claro ? `oklch(0.50 0.10 240 / ${op}%)` : `oklch(0.70 0.09 240 / ${op}%)`;
      const cinza = (op: number) => claro ? `oklch(0.45 0.02 260 / ${op}%)` : `oklch(0.75 0.02 260 / ${op}%)`;

      // Área útil: margem em cima e embaixo para as curvas não encostarem na borda.
      const topo = A * 0.08;
      const alturaUtil = A * 0.84;
      const emY = (v: number) => topo + (1 - v) * alturaUtil;
      const emX = (v: number) => v * L;

      // ── GRADE. É o que transforma duas linhas soltas em gráfico: dá escala, e
      // sem escala curva nenhuma significa coisa alguma. A dos 50% é tracejada e
      // dourada porque não é só mais um nível — é a linha da dúvida.
      ctx.lineWidth = 1;
      for (const nivel of [0, 0.25, 0.5, 0.75, 1]) {
        const meio = nivel === 0.5;
        ctx.strokeStyle = meio ? ouro(16) : cinza(7);
        ctx.setLineDash(meio ? [4, 6] : []);
        ctx.beginPath();
        ctx.moveTo(0, emY(nivel));
        ctx.lineTo(L, emY(nivel));
        ctx.stroke();
      }
      ctx.setLineDash([]);

      const ate = Math.max(1, Math.floor(progresso * PASSOS));
      const caminho = (pts: Ponto[]) => {
        ctx.beginPath();
        for (let k = 0; k <= ate; k++) {
          const x = emX(pts[k].x), y = emY(pts[k].y);
          if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
      };

      // ── Área sob o SIM. Dá peso ao lado que vence e deixa claro qual é a curva
      // principal — duas linhas de mesmo peso competiriam entre si.
      const degrade = ctx.createLinearGradient(0, topo, 0, topo + alturaUtil);
      degrade.addColorStop(0, ouro(claro ? 13 : 11));
      degrade.addColorStop(1, ouro(0));
      ctx.fillStyle = degrade;
      caminho(sim);
      ctx.lineTo(emX(sim[ate].x), emY(0));
      ctx.lineTo(0, emY(0));
      ctx.closePath();
      ctx.fill();

      // ── NÃO primeiro (fica atrás), SIM por cima: a hierarquia segue quem vence.
      ctx.lineWidth = 2;
      ctx.strokeStyle = azul(claro ? 34 : 30);
      caminho(nao);
      ctx.stroke();

      ctx.lineWidth = 2.4;
      ctx.strokeStyle = ouro(claro ? 46 : 42);
      caminho(sim);
      ctx.stroke();

      // ── O cruzamento nos 50%: o ponto em que as duas valem o mesmo. É o mais
      // informativo do desenho, então ganha marca própria.
      const iCruz = sim.findIndex((p, k) => k > 0.1 * PASSOS && p.y >= 0.5);
      if (iCruz > 0 && ate >= iCruz) {
        ctx.strokeStyle = ouro(30);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(emX(sim[iCruz].x), emY(0.5), 4.5, 0, Math.PI * 2);
        ctx.stroke();
      }

      // ── As pontas, quando a curva termina: é a RESOLUÇÃO — um lado passa a
      // valer tudo, o outro nada. É o momento que o site inteiro celebra.
      if (ate >= PASSOS) {
        for (const [pts, cor] of [[sim, ouro(70)], [nao, azul(50)]] as const) {
          ctx.fillStyle = cor;
          ctx.beginPath();
          ctx.arc(emX(pts[PASSOS].x) - 2, emY(pts[PASSOS].y), 3.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    function quadro() {
      progresso = Math.min(1, progresso + 0.009);
      desenhar();
      if (progresso < 1) animId = requestAnimationFrame(quadro);
    }

    desenhar();
    if (!semMovimento) animId = requestAnimationFrame(quadro);

    const aoRedimensionar = () => desenhar();
    window.addEventListener("resize", aoRedimensionar);

    // Trocar de tema tem que redesenhar. A animação termina em ~2s e para; sem
    // isto, quem clicasse no sol/lua depois ficaria com o traço do tema anterior
    // — quase invisível no claro, e sem erro nenhum para denunciar.
    const observador = new MutationObserver(() => desenhar());
    observador.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] });

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", aoRedimensionar);
      observador.disconnect();
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
