/**
 * PremiumUpgrade — card do plano Premium (Stripe checkout). Extraido de pages/Perfil.tsx.
 */
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import AnimatedSection from "@/components/AnimatedSection";
import { track } from "@/lib/analytics";
import { apiFetch } from "@/lib/api";
import { Star, CheckCircle } from "lucide-react";

export function PremiumUpgrade({ userId, userEmail }: { userId: string; userEmail: string }) {
  const [plan, setPlan] = useState<"free" | "premium" | null>(null);
  const [loading, setLoading] = useState(false);
  // ⚠️ O PREÇO NÃO MORA MAIS AQUI (Auditoria 21/09, SEG-03). O navegador
  // mandava `priceId` no corpo do checkout, e o servidor obedecia: dava para
  // abrir um checkout de qualquer outro price da conta Stripe. Agora quem sabe
  // o preço é o servidor (`STRIPE_PREMIUM_PRICE_ID`), e a tela só descobre que
  // ele não está configurado quando tenta — e então diz isso.
  const [semPreco, setSemPreco] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("success")) toast.success("Bem-vindo ao Premium! 🎉", { description: "Análises ilimitadas e níveis avançados liberados." });
    if (params.get("cancelled")) toast("Checkout cancelado — sem cobrança.");
    void supabase.from("profiles").select("plan").eq("id", userId).maybeSingle()
      .then(({ data }) => setPlan((data?.plan as "free" | "premium") ?? "free"));
  }, [userId]);

  async function handleUpgrade() {
    track("premium_click");
    setLoading(true);
    try {
      // `apiFetch`, não `fetch` cru: sem o cabeçalho Authorization o servidor
      // responde 401 e a tela fica pedindo login para sempre — o defeito que já
      // mordeu 7 das 9 chamadas de IA deste site.
      const res = await apiFetch("/api/stripe/checkout", { method: "POST" });
      const data = await res.json() as { url?: string; error?: string; message?: string };
      if (data.url) { window.location.href = data.url; return; }
      if (data.error === "preco_nao_configurado") setSemPreco(true);
      toast.error(data.message ?? "Não foi possível iniciar o checkout.");
    } catch { toast.error("Erro ao conectar com o pagamento."); }
    setLoading(false);
  }

  /**
   * Abre o portal do Stripe: cancelar, trocar o cartão, ver as faturas.
   *
   * Existe porque até aqui não havia COMO cancelar sozinho — e plano pago
   * difícil de cancelar é prática que este produto não adota (SEG-03).
   */
  async function abrirPortal() {
    setLoading(true);
    try {
      const res = await apiFetch("/api/stripe/portal", { method: "POST" });
      const data = await res.json() as { url?: string; message?: string };
      if (data.url) { window.location.href = data.url; return; }
      toast.error(data.message ?? "Não foi possível abrir a gestão da assinatura.");
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
          <div className="min-w-0">
            <p className="text-sm font-bold text-gold">Plano Premium ativo</p>
            <p className="text-xs text-muted-foreground">Análises de IA ilimitadas e apoio ao projeto. Obrigado! 🙏</p>
          </div>
          <button
            onClick={abrirPortal}
            disabled={loading}
            className="ml-auto shrink-0 text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors disabled:opacity-50"
          >
            Gerenciar assinatura
          </button>
        </div>
      </AnimatedSection>
    );
  }

  const benefits = [
    "Análises de IA ilimitadas (sem a cota mensal de 4)",
    "Previsão Guiada + Briefing por IA sem limite",
    "Histórico de previsões sincronizado na nuvem",
    "Apoio ao projeto + prioridade em novos recursos",
  ];

  return (
    <AnimatedSection>
      <div className="glass-card rounded-2xl p-6 border border-gold/20 bg-gradient-to-br from-gold/5 to-transparent space-y-4">
        <div className="flex items-center gap-2">
          <Star className="w-4 h-4 text-gold" />
          <h2 className="font-semibold text-[var(--titulo)]">JLB Premium</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {benefits.map((b) => (
            <div key={b} className="flex items-start gap-2 text-xs text-muted-foreground">
              <CheckCircle className="w-3.5 h-3.5 text-gold shrink-0 mt-0.5" /> {b}
            </div>
          ))}
        </div>
        {semPreco ? (
          <p className="text-[11px] text-muted-foreground">
            A assinatura ainda não está aberta. Estamos terminando de configurar o pagamento.
          </p>
        ) : (
          <button
            onClick={handleUpgrade}
            disabled={loading}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg bg-gold text-on-accent text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading ? <span className="w-4 h-4 border-2 border-on-accent border-t-transparent rounded-full animate-spin" /> : <Star className="w-4 h-4" />}
            Assinar Premium
          </button>
        )}
      </div>
    </AnimatedSection>
  );
}
