/**
 * UpgradeModal — o paywall no momento de valor. Montado UMA vez na App, fica ouvindo
 * o evento global `jlb:upgrade` (disparado por maybeUpgrade/openUpgrade em lib/upgrade.ts)
 * e abre a oferta de Premium exatamente quando o usuário grátis bate a cota de IA.
 * Reusa o mesmo checkout do PremiumUpgrade (Stripe), então é uma só fonte de verdade.
 */
import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import { Star, CheckCircle, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { track } from "@/lib/analytics";
import { apiFetch } from "@/lib/api";
import { LINK_CADASTRO } from "@/lib/linkCadastro";
import { COTA_GRATIS_MENSAL } from "@shared/planos";
import type { UpgradeDetail } from "@/lib/upgrade";

const BENEFITS = [
  `Análises de IA ilimitadas (sem a cota mensal de ${COTA_GRATIS_MENSAL})`,
  "Previsão Guiada + Briefing por IA sem limite",
  "Histórico de previsões sincronizado na nuvem",
  "Apoio ao projeto + prioridade em novos recursos",
];

export default function UpgradeModal() {
  const { user } = useAuth();
  const [, irPara] = useLocation();
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<UpgradeDetail>({ reason: "manual" });
  const [loading, setLoading] = useState(false);
  // O preço mora no SERVIDOR (SEG-03): mandar `priceId` daqui deixava abrir um
  // checkout de qualquer outro price da conta Stripe.

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
    if (!user) return;
    track("premium_click", { source: "paywall" });
    setLoading(true);
    try {
      // `apiFetch` leva o cabeçalho Authorization — o servidor deriva a conta
      // dele, em vez de acreditar no `userId` que o navegador mandasse.
      const res = await apiFetch("/api/stripe/checkout", { method: "POST" });
      const data = (await res.json()) as { url?: string; error?: string; message?: string };
      if (data.url) { window.location.href = data.url; return; }
      // Assinatura ainda não aberta: leva para /planos, que explica o estado em
      // vez de deixar um aviso de erro no lugar de uma promessa. Antes esse
      // desvio era decidido no navegador (pela ausência do price no bundle);
      // agora quem sabe é o servidor, e a tela só reage.
      if (data.error === "preco_nao_configurado") { setOpen(false); irPara("/planos"); return; }
      toast.error(data.message ?? "Não foi possível iniciar o checkout.");
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
    ? `A IA é liberada para quem tem conta — ${COTA_GRATIS_MENSAL} análises grátis por mês, sem cartão. Leva 30 segundos.`
    : isCredits
    ? `Foram ${detail.used ?? COTA_GRATIS_MENSAL} de ${detail.limit ?? COTA_GRATIS_MENSAL} análises de IA. Libere ilimitado e continue de onde parou.`
    : "Análises de IA ilimitadas, Previsão Guiada sem limite e apoio ao projeto.";
  const benefits = isLogin
    ? [`${COTA_GRATIS_MENSAL} análises de IA grátis por mês`, "Histórico de previsões sincronizado", "Sem cartão de crédito", "Vira Premium quando quiser"]
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
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50 rounded"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2 mb-1.5">
          <div className="w-9 h-9 rounded-xl bg-gold/15 flex items-center justify-center shrink-0">
            <Star className="w-4 h-4 text-gold" />
          </div>
          <h2 className="font-bold text-[var(--titulo)] text-lg leading-tight">{title}</h2>
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
          // "Criar conta grátis" abre o CADASTRO (ver lib/linkCadastro.ts);
          // "Entrar para assinar" é de quem já tem conta.
          <Link href={isLogin ? LINK_CADASTRO : "/login"}>
            <span
              className="block w-full text-center px-6 py-2.5 rounded-lg bg-gold text-on-accent text-sm font-semibold hover:opacity-90 transition-opacity cursor-pointer"
              onClick={() => setOpen(false)}
            >
              {isLogin ? "Criar conta grátis" : "Entrar para assinar"}
            </span>
          </Link>
        ) : (
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
        )}

        <button
          onClick={() => setOpen(false)}
          className="w-full text-center text-[11px] text-muted-foreground hover:text-muted-foreground mt-3 transition-colors"
        >
          {isLogin ? "Agora não · conta grátis, sem cartão" : isCredits ? "Continuo grátis por enquanto · sem compromisso, cancele quando quiser" : "Agora não · sem compromisso, cancele quando quiser"}
        </button>
      </div>
    </div>
  );
}
