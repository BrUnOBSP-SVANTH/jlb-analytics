/**
 * UpgradeModal — o paywall no momento de valor. Montado UMA vez na App, fica ouvindo
 * o evento global `jlb:upgrade` (disparado por maybeUpgrade/openUpgrade em lib/upgrade.ts)
 * e abre a oferta de Premium exatamente quando o usuário grátis bate a cota de IA.
 * Reusa o mesmo checkout do PremiumUpgrade (Stripe), então é uma só fonte de verdade.
 */
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import { Star, CheckCircle, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { track } from "@/lib/analytics";
import type { UpgradeDetail } from "@/lib/upgrade";

const BENEFITS = [
  "Análises de IA ilimitadas (sem a cota mensal de 4)",
  "Previsão Guiada + Briefing por IA sem limite",
  "Histórico de previsões sincronizado na nuvem",
  "Apoio ao projeto + prioridade em novos recursos",
];

export default function UpgradeModal() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<UpgradeDetail>({ reason: "manual" });
  const [loading, setLoading] = useState(false);
  const priceId = (import.meta.env.VITE_STRIPE_PREMIUM_PRICE_ID
    ?? import.meta.env.VITE_STRIPE_PRICE_ID) as string | undefined;

  useEffect(() => {
    const onOpen = (e: Event) => {
      setDetail((e as CustomEvent<UpgradeDetail>).detail ?? { reason: "manual" });
      setOpen(true);
      track("paywall_view", { reason: (e as CustomEvent<UpgradeDetail>).detail?.reason ?? "manual" });
    };
    window.addEventListener("jlb:upgrade", onOpen);
    return () => window.removeEventListener("jlb:upgrade", onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  async function checkout() {
    if (!user || !priceId) return;
    track("premium_click", { source: "paywall" });
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId, userId: user.id, userEmail: user.email }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (data.url) { window.location.href = data.url; return; }
      toast.error(data.error ?? "Não foi possível iniciar o checkout.");
    } catch {
      toast.error("Erro ao conectar com o pagamento.");
    }
    setLoading(false);
  }

  const isCredits = detail.reason === "credits";
  const isLogin = detail.reason === "login";
  const title = isLogin
    ? "Crie sua conta grátis"
    : isCredits ? "Você usou suas análises grátis do mês" : "Vire Premium";
  const subtitle = isLogin
    ? "A IA é liberada para quem tem conta — 4 análises grátis por mês, sem cartão. Leva 30 segundos."
    : isCredits
    ? `Foram ${detail.used ?? 4} de ${detail.limit ?? 4} análises de IA. Libere ilimitado e continue de onde parou.`
    : "Análises de IA ilimitadas, Previsão Guiada sem limite e apoio ao projeto.";
  const benefits = isLogin
    ? ["4 análises de IA grátis por mês", "Histórico de previsões sincronizado", "Sem cartão de crédito", "Vira Premium quando quiser"]
    : BENEFITS;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label={isLogin ? "Criar conta grátis" : "Assinar Premium"}
    >
      <div
        className="glass-card rounded-2xl p-6 max-w-md w-full border border-gold/30 bg-gradient-to-br from-gold/10 to-transparent relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => setOpen(false)}
          aria-label="Fechar"
          className="absolute top-4 right-4 text-muted-foreground/60 hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50 rounded"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2 mb-1.5">
          <div className="w-9 h-9 rounded-xl bg-gold/15 flex items-center justify-center shrink-0">
            <Star className="w-4 h-4 text-gold" />
          </div>
          <h2 className="font-bold text-foreground text-lg leading-tight">{title}</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-5">{subtitle}</p>

        <div className="space-y-2 mb-6">
          {benefits.map((b) => (
            <div key={b} className="flex items-start gap-2 text-xs text-muted-foreground">
              <CheckCircle className="w-3.5 h-3.5 text-gold shrink-0 mt-0.5" /> {b}
            </div>
          ))}
        </div>

        {(!user || isLogin) ? (
          <Link href="/login">
            <span
              className="block w-full text-center px-6 py-2.5 rounded-lg bg-gold text-on-accent text-sm font-semibold hover:opacity-90 transition-opacity cursor-pointer"
              onClick={() => setOpen(false)}
            >
              {isLogin ? "Criar conta grátis" : "Entrar para assinar"}
            </span>
          </Link>
        ) : priceId ? (
          <button
            onClick={checkout}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg bg-gold text-on-accent text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading
              ? <span className="w-4 h-4 border-2 border-on-accent border-t-transparent rounded-full animate-spin" />
              : <Star className="w-4 h-4" />}
            Assinar Premium
          </button>
        ) : (
          <Link href="/perfil">
            <span
              className="block w-full text-center px-6 py-2.5 rounded-lg bg-gold text-on-accent text-sm font-semibold hover:opacity-90 transition-opacity cursor-pointer"
              onClick={() => setOpen(false)}
            >
              Ver planos
            </span>
          </Link>
        )}

        <button
          onClick={() => setOpen(false)}
          className="w-full text-center text-[11px] text-muted-foreground/50 hover:text-muted-foreground mt-3 transition-colors"
        >
          {isLogin ? "Agora não · conta grátis, sem cartão" : isCredits ? "Continuo grátis por enquanto · sem compromisso, cancele quando quiser" : "Agora não · sem compromisso, cancele quando quiser"}
        </button>
      </div>
    </div>
  );
}
