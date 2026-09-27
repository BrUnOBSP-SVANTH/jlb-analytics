/**
 * ShareCard — cartão compartilhável do Track Record (prova → aquisição).
 *
 * Renderiza um SVG auto-contido com os números AO VIVO da IA (taxa de acerto vs.
 * mercado, skill, resolvidas) e deixa o usuário: (a) compartilhar via Web Share API
 * nativo (WhatsApp/X/Insta), ou (b) baixar como PNG (rasteriza o SVG em <canvas>).
 * Tudo client-side, sem dependência nova. SVG usa fontes de sistema para rasterizar
 * de forma confiável (web fonts nem sempre chegam ao contexto do canvas).
 *
 * ⚠️ AQUI A COR É HEX FIXO, E TEM DE SER: o SVG vira PNG num <canvas>, fora do
 * documento — `var(--gold)` não existe nesse contexto e sairia preto. A regra
 * da casa ("cor só por token") continua valendo para tudo que é tela.
 *
 * 🔴 Por isso mesmo ele ficou para trás (27/09/2026). Esta é a única imagem da
 * marca que sai do site — vai para WhatsApp, X, Instagram — e estava numa
 * ARDÓSIA AZUL (#0c111b, borda #1c2838, texto #93a1b3) que nunca foi a paleta
 * da casa. Quem recebia o cartão via uma marca; quem abria o link via outra.
 * Os hex abaixo são conversões diretas dos tokens do tema escuro, anotadas com
 * o token de origem para que a próxima mudança de paleta chegue até aqui.
 */
/** Tokens do tema escuro convertidos para hex — ver o aviso acima. */
const TINTA = {
  fundo: "#0f0c07",        // --background
  fundoBaixo: "#0a0804",   // --obsidian
  borda: "#2f2b24",        // --border
  texto: "#edebe7",        // --foreground
  dado: "#e1ceb0",         // --dado
  dadoSuave: "#b5a996",    // --dado-suave
  quieto: "#9d978f",       // --muted-foreground
  douradoClaro: "#ecc980", // --gold-light
  dourado: "#dbb155",      // --gold
  positivo: "#00c66d",     // --positive
} as const;
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Share2, Download } from "lucide-react";
import AnimatedSection from "@/components/AnimatedSection";
import { buscarJson } from "@/lib/api";
import { num, pct } from "@shared/formato";

interface TrackRecordData {
  available: boolean;
  resolvedCount: number;
  hitRate: number | null;
  marketHitRate: number | null;
  aiBrier: number | null;
  marketBrier: number | null;
  skillVsMarket: number | null;
}

const W = 1200, H = 630;

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildSvg(d: TrackRecordData): string {
  const hit = d.hitRate;
  const mkt = d.marketHitRate;
  const skill = d.skillVsMarket;
  const skillStr = skill != null ? `${skill >= 0 ? "+" : ""}${Math.round(skill * 100)}%` : "—";
  const aiB = d.aiBrier != null ? num(d.aiBrier, 2) : "—";
  const mktB = d.marketBrier != null ? num(d.marketBrier, 2) : "—";
  const beats = hit != null && mkt != null && hit >= mkt;

  const heroColor = beats ? TINTA.positivo : TINTA.dourado;
  const compare = `de acerto, contra ${mkt != null ? pct(mkt) : "—"} do mercado  ·  Brier ${aiB} vs ${mktB}  ·  skill ${skillStr}`;
  const honest = `${d.resolvedCount} previsões resolvidas — medidas contra o resultado REAL da plataforma, sem cherry-picking.`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${TINTA.fundo}"/><stop offset="1" stop-color="${TINTA.fundoBaixo}"/>
    </linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${TINTA.douradoClaro}"/><stop offset="1" stop-color="${TINTA.dourado}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect x="20" y="20" width="${W - 40}" height="${H - 40}" rx="26" fill="none" stroke="${TINTA.borda}" stroke-width="2"/>
  <rect x="20" y="20" width="8" height="${H - 40}" rx="4" fill="url(#gold)"/>

  <text x="72" y="108" fill="${TINTA.texto}" font-size="34" font-weight="700">JLB <tspan fill="url(#gold)">Analytics</tspan></text>
  <rect x="792" y="76" width="336" height="44" rx="22" fill="#0d2218" stroke="#2c6244" stroke-width="1.5"/>
  <text x="960" y="105" fill="${TINTA.positivo}" font-size="21" font-weight="700" text-anchor="middle" letter-spacing="1">✓ TRACK RECORD VERIFICADO</text>

  <!-- TRK-08: o número-herói era a taxa de acerto direcional — que a PRÓPRIA
       página chama de "a parte fácil: quase nenhum mercado é 50/50, então saber
       o lado óbvio já acerta muito". Liderar com ela é vender o argumento que
       qualquer concorrente também consegue alegar, e que o nosso próprio texto
       desmonta três parágrafos depois.
       O que ninguém mais faz é publicar o número medido contra o resultado real
       da plataforma, incluindo quando ele é ruim. É esse o cartaz. -->
  <text x="70" y="268" fill="${TINTA.texto}" font-size="76" font-weight="800" letter-spacing="-2">Publicamos até</text>
  <text x="70" y="352" fill="url(#gold)" font-size="76" font-weight="800" letter-spacing="-2">quando erramos.</text>

  <line x1="72" y1="404" x2="${W - 72}" y2="404" stroke="${TINTA.borda}" stroke-width="1.5"/>
  <text x="72" y="462" fill="${heroColor}" font-size="46" font-weight="800">${hit != null ? pct(hit) : "—"}</text>
  <text x="160" y="462" fill="${TINTA.dado}" font-size="27" font-weight="600">${esc(compare)}</text>
  <text x="72" y="512" fill="${TINTA.dadoSuave}" font-size="24">${esc(honest)}</text>

  <text x="72" y="576" fill="${TINTA.quieto}" font-size="23">Faça sua previsão calibrada</text>
  <text x="${W - 72}" y="576" fill="url(#gold)" font-size="23" font-weight="700" text-anchor="end">jlb · /track-record</text>
</svg>`;
}

function buildGenericSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${TINTA.fundo}"/><stop offset="1" stop-color="${TINTA.fundoBaixo}"/></linearGradient>
  <linearGradient id="gold" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${TINTA.douradoClaro}"/><stop offset="1" stop-color="${TINTA.dourado}"/></linearGradient></defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect x="20" y="20" width="${W - 40}" height="${H - 40}" rx="26" fill="none" stroke="${TINTA.borda}" stroke-width="2"/>
  <rect x="20" y="20" width="8" height="${H - 40}" rx="4" fill="url(#gold)"/>
  <text x="72" y="108" fill="${TINTA.texto}" font-size="34" font-weight="700">JLB <tspan fill="url(#gold)">Analytics</tspan></text>
  <text x="72" y="300" fill="${TINTA.texto}" font-size="72" font-weight="800">Track record</text>
  <text x="72" y="378" fill="url(#gold)" font-size="72" font-weight="800">verificado.</text>
  <text x="72" y="452" fill="${TINTA.dadoSuave}" font-size="30">Cada previsão da IA confrontada com o resultado REAL</text>
  <text x="72" y="494" fill="${TINTA.dadoSuave}" font-size="30">da plataforma — auditável, sem cherry-picking.</text>
  <text x="${W - 72}" y="576" fill="url(#gold)" font-size="23" font-weight="700" text-anchor="end">jlb · /track-record</text>
</svg>`;
}

async function downloadPng(svg: string) {
  try {
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
    await new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext("2d");
        if (!ctx) { URL.revokeObjectURL(url); reject(new Error("no ctx")); return; }
        ctx.drawImage(img, 0, 0, W, H);
        URL.revokeObjectURL(url);
        canvas.toBlob((b) => {
          if (!b) { reject(new Error("no blob")); return; }
          const a = document.createElement("a");
          a.href = URL.createObjectURL(b);
          a.download = "jlb-track-record.png";
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 1000);
          resolve();
        }, "image/png");
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("img load")); };
      img.src = url;
    });
  } catch {
    toast.error("Não foi possível gerar a imagem — tente uma captura de tela.");
  }
}

async function shareLink(text: string) {
  const url = `${window.location.origin}/track-record`;
  const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
  if (nav.share) {
    try { await nav.share({ title: "Track Record verificado — JLB Analytics", text, url }); }
    catch { /* usuário cancelou — sem toast */ }
    return;
  }
  try { await navigator.clipboard.writeText(`${text} ${url}`); toast.success("Texto + link copiados!"); }
  catch { toast.error("Não foi possível copiar."); }
}

export function ShareCard() {
  const [data, setData] = useState<TrackRecordData | null>(null);

  useEffect(() => {
    buscarJson<TrackRecordData>("/api/ai/track-record")
      .then((d) => { if (d?.available) setData(d); })
      .catch(() => {});
  }, []);

  // Só usa números quando há amostra minima (>=20); senão, cartão institucional.
  const hasNumbers = !!data && data.hitRate != null && data.resolvedCount >= 20;
  const svg = useMemo(() => (hasNumbers ? buildSvg(data!) : buildGenericSvg()), [data, hasNumbers]);

  const shareText = hasNumbers
    ? `A JLB publica o próprio track record medido contra o resultado real da plataforma — ${data!.resolvedCount} previsões, inclusive as que erramos. Confira:`
    : `Track record verificado da JLB: cada previsão da IA confrontada com o resultado real, sem cherry-picking. Veja a prova:`;

  return (
    <AnimatedSection>
      <div className="glass-card rounded-2xl p-5 border border-gold/20">
        <div className="flex items-center gap-2 mb-4">
          <Share2 className="w-4 h-4 text-gold shrink-0" />
          <p className="text-sm font-semibold text-foreground">Compartilhe esta prova</p>
          <span className="ml-auto text-[11px] text-muted-foreground">gera imagem para redes</span>
        </div>

        {/* Preview do cartão (o mesmo SVG que vira PNG) */}
        <div
          className="rounded-xl overflow-hidden border border-border/20 [&>svg]:block [&>svg]:w-full [&>svg]:h-auto"
          // dangerouslySetInnerHTML aqui é seguro: o SVG é gerado localmente, sem input do usuário.
          // (Havia uma diretiva eslint-disable para react/no-danger, uma regra de plugin que
          // este projeto não carrega — e diretiva de regra inexistente é ERRO no lint.)
          dangerouslySetInnerHTML={{ __html: svg }}
        />

        <div className="flex flex-wrap items-center gap-2 mt-4">
          <button
            onClick={() => shareLink(shareText)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gold/15 border border-gold/30 text-xs font-semibold text-gold hover:bg-gold/25 transition-colors"
          >
            <Share2 className="w-3.5 h-3.5" /> Compartilhar
          </button>
          <button
            onClick={() => downloadPng(svg)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border/30 text-xs font-semibold text-foreground/80 hover:text-foreground hover:border-primary/40 transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> Baixar imagem
          </button>
        </div>
      </div>
    </AnimatedSection>
  );
}
