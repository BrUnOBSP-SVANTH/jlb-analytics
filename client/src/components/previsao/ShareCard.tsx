/**
 * ShareCard — cartão compartilhável do Track Record (prova → aquisição).
 *
 * Renderiza um SVG auto-contido com os números AO VIVO da IA (taxa de acerto vs.
 * mercado, skill, resolvidas) e deixa o usuário: (a) compartilhar via Web Share API
 * nativo (WhatsApp/X/Insta), ou (b) baixar como PNG (rasteriza o SVG em <canvas>).
 * Tudo client-side, sem dependência nova. SVG usa fontes de sistema para rasterizar
 * de forma confiável (web fonts nem sempre chegam ao contexto do canvas).
 */
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Share2, Download } from "lucide-react";
import AnimatedSection from "@/components/AnimatedSection";

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
  const aiB = d.aiBrier != null ? d.aiBrier.toFixed(2) : "—";
  const mktB = d.marketBrier != null ? d.marketBrier.toFixed(2) : "—";
  const beats = hit != null && mkt != null && hit >= mkt;

  const heroColor = beats ? "#4ade80" : "#e8b74a";
  const compare = `vs. ${mkt ?? "—"}% do mercado   ·   skill ${skillStr}   ·   Brier ${aiB} vs ${mktB}`;
  const honest = `${d.resolvedCount} previsões resolvidas — medidas contra o resultado REAL da plataforma, sem cherry-picking.`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0c111b"/><stop offset="1" stop-color="#080b12"/>
    </linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#f5cf6a"/><stop offset="1" stop-color="#e0a92e"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect x="20" y="20" width="${W - 40}" height="${H - 40}" rx="26" fill="none" stroke="#1c2838" stroke-width="2"/>
  <rect x="20" y="20" width="8" height="${H - 40}" rx="4" fill="url(#gold)"/>

  <text x="72" y="108" fill="#eef2f8" font-size="34" font-weight="700">JLB <tspan fill="url(#gold)">Analytics</tspan></text>
  <rect x="792" y="76" width="336" height="44" rx="22" fill="#0f2418" stroke="#2f6b45" stroke-width="1.5"/>
  <text x="960" y="105" fill="#4ade80" font-size="21" font-weight="700" text-anchor="middle" letter-spacing="1">✓ TRACK RECORD VERIFICADO</text>

  <text x="70" y="310" fill="${heroColor}" font-size="190" font-weight="800" letter-spacing="-4">${hit ?? "—"}%</text>
  <text x="80" y="366" fill="#93a1b3" font-size="32">taxa de acerto da nossa IA</text>

  <line x1="72" y1="410" x2="${W - 72}" y2="410" stroke="#1c2838" stroke-width="1.5"/>
  <text x="72" y="462" fill="#dfe6ef" font-size="27" font-weight="600">${esc(compare)}</text>
  <text x="72" y="512" fill="#93a1b3" font-size="24">${esc(honest)}</text>

  <text x="72" y="576" fill="#8b98a8" font-size="23">Faça sua previsão calibrada</text>
  <text x="${W - 72}" y="576" fill="url(#gold)" font-size="23" font-weight="700" text-anchor="end">jlb · /track-record</text>
</svg>`;
}

function buildGenericSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0c111b"/><stop offset="1" stop-color="#080b12"/></linearGradient>
  <linearGradient id="gold" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#f5cf6a"/><stop offset="1" stop-color="#e0a92e"/></linearGradient></defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect x="20" y="20" width="${W - 40}" height="${H - 40}" rx="26" fill="none" stroke="#1c2838" stroke-width="2"/>
  <rect x="20" y="20" width="8" height="${H - 40}" rx="4" fill="url(#gold)"/>
  <text x="72" y="108" fill="#eef2f8" font-size="34" font-weight="700">JLB <tspan fill="url(#gold)">Analytics</tspan></text>
  <text x="72" y="300" fill="#eef2f8" font-size="72" font-weight="800">Track record</text>
  <text x="72" y="378" fill="url(#gold)" font-size="72" font-weight="800">verificado.</text>
  <text x="72" y="452" fill="#93a1b3" font-size="30">Cada previsão da IA confrontada com o resultado REAL</text>
  <text x="72" y="494" fill="#93a1b3" font-size="30">da plataforma — auditável, sem cherry-picking.</text>
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
    fetch("/api/ai/track-record")
      .then((r) => r.ok ? r.json() as Promise<TrackRecordData> : null)
      .then((d) => { if (d?.available) setData(d); })
      .catch(() => {});
  }, []);

  // Só usa números quando há amostra minima (>=20); senão, cartão institucional.
  const hasNumbers = !!data && data.hitRate != null && data.resolvedCount >= 20;
  const svg = useMemo(() => (hasNumbers ? buildSvg(data!) : buildGenericSvg()), [data, hasNumbers]);

  const shareText = hasNumbers
    ? `A IA da JLB acerta ${data!.hitRate}% — track record verificado contra o resultado real, sem cherry-picking. Veja a prova:`
    : `Track record verificado da JLB: cada previsão da IA confrontada com o resultado real, sem cherry-picking. Veja a prova:`;

  return (
    <AnimatedSection>
      <div className="glass-card rounded-2xl p-5 border border-gold/20">
        <div className="flex items-center gap-2 mb-4">
          <Share2 className="w-4 h-4 text-gold shrink-0" />
          <p className="text-sm font-semibold text-foreground">Compartilhe esta prova</p>
          <span className="ml-auto text-[10px] text-muted-foreground/60">gera imagem para redes</span>
        </div>

        {/* Preview do cartão (o mesmo SVG que vira PNG) */}
        <div
          className="rounded-xl overflow-hidden border border-border/20 [&>svg]:block [&>svg]:w-full [&>svg]:h-auto"
          // eslint-disable-next-line react/no-danger -- SVG gerado localmente, sem input do usuário
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
