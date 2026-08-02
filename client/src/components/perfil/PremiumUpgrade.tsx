/**
 * PremiumUpgrade — card do plano Premium (Stripe checkout). Extraido de pages/Perfil.tsx.
 */
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import AnimatedSection from "@/components/AnimatedSection";
import { track } from "@/lib/analytics";
import { Star, CheckCircle } from "lucide-react";

export function PremiumUpgrade({ userId, userEmail }: { userId: string; userEmail: string }) {
  const [plan, setPlan] = useState<"free" | "premium" | null>(null);
  const [loading, setLoading] = useState(false);
  // Nome canônico é VITE_STRIPE_PREMIUM_PRICE_ID (.env / .env.example); mantém
  // fallback ao nome antigo por segurança.
  const priceId = (import.meta.env.VITE_STRIPE_PREMIUM_PRICE_ID
    ?? import.meta.env.VITE_STRIPE_PRICE_ID) as string | undefined;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("success")) toast.success("Bem-vindo ao Premium! 🎉", { description: "Análises ilimitadas e níveis avançados liberados." });
    if (params.get("cancelled")) toast("Checkout cancelado — sem cobrança.");
    void supabase.from("profiles").select("plan").eq("id", userId).maybeSingle()
      .then(({ data }) => setPlan((data?.plan as "free" | "premium") ?? "free"));
  }, [userId]);

  async function handleUpgrade() {
    if (!priceId) return;
    track("premium_click");
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId, userId, userEmail }),
      });
      const data = await res.json() as { url?: string; error?: string };
      if (data.url) { window.location.href = data.url; return; }
      toast.error(data.error ?? "Não foi possível iniciar o checkout.");
    } catch { toast.error("Erro ao conectar com o pagamento."); }
    setLoading(false);
  }

  if (plan === "premium") {
    return (
      <AnimatedSection>
        <div className="glass-card rounded-2xl p-5 border border-gold/30 bg-gold/5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gold/15 flex items-center justify-center shrink-0">
            <Star className="w-5 h-5 text-gold" />
          </div>
          <div>
            <p className="text-sm font-bold text-gold">Plano Premium ativo</p>
            <p className="text-xs text-muted-foreground">Análises de IA ilimitadas e apoio ao projeto. Obrigado! 🙏</p>
          </div>
        </div>
      </AnimatedSection>
    );
  }

  const benefits = [
    "Análises de IA ilimitadas (sem a cota mensal de 30)",
    "Previsão Guiada + Briefing por IA sem limite",
    "Histórico de previsões sincronizado na nuvem",
    "Apoio ao projeto + prioridade em novos recursos",
  ];

  return (
    <AnimatedSection>
      <div className="glass-card rounded-2xl p-6 border border-gold/20 bg-gradient-to-br from-gold/5 to-transparent space-y-4">
        <div className="flex items-center gap-2">
          <Star className="w-4 h-4 text-gold" />
          <h2 className="font-semibold text-foreground">JLB Premium</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {benefits.map((b) => (
            <div key={b} className="flex items-start gap-2 text-xs text-muted-foreground">
              <CheckCircle className="w-3.5 h-3.5 text-gold shrink-0 mt-0.5" /> {b}
            </div>
          ))}
        </div>
        {priceId ? (
          <button
            onClick={handleUpgrade}
            disabled={loading}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg bg-gold text-on-accent text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading ? <span className="w-4 h-4 border-2 border-on-accent border-t-transparent rounded-full animate-spin" /> : <Star className="w-4 h-4" />}
            Assinar Premium
          </button>
        ) : (
          <p className="text-[11px] text-muted-foreground/60">
            Checkout em configuração. Defina <code className="font-mono">VITE_STRIPE_PREMIUM_PRICE_ID</code> e <code className="font-mono">STRIPE_SECRET_KEY</code> para ativar.
          </p>
        )}
      </div>
    </AnimatedSection>
  );
}
