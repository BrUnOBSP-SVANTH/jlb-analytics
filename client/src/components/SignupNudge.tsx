/**
 * SignupNudge — convite de cadastro no momento de maior intenção.
 * Fecha o "beco do convidado": quem registra previsões como visitante não
 * perdia nada visível, mas também nunca era convidado a salvar. Aparece onde
 * o valor é sentido (previsões locais) com uma chamada única para /login.
 */
import { Link } from "wouter";
import { UserPlus, Cloud } from "lucide-react";
import { track } from "@/lib/analytics";

export default function SignupNudge({ count, context }: { count?: number; context?: string }) {
  const label =
    count && count > 1
      ? `Você tem ${count} previsões salvas só neste dispositivo`
      : count === 1
        ? "Você tem 1 previsão salva só neste dispositivo"
        : "Suas previsões ficam só neste dispositivo";

  return (
    <div className="glass-card rounded-xl p-5 border border-gold/25 bg-gold/5 flex items-center gap-4 flex-wrap">
      <div className="w-10 h-10 rounded-lg bg-gold/15 flex items-center justify-center shrink-0">
        <Cloud className="w-5 h-5 text-gold" aria-hidden="true" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Crie uma conta grátis para não perdê-las e acompanhar seu Brier Score em qualquer dispositivo.
        </p>
      </div>
      <Link href="/login" onClick={() => track("signup_nudge_click", { context })}>
        <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gold text-on-accent text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer shrink-0">
          <UserPlus className="w-3.5 h-3.5" aria-hidden="true" /> Criar conta grátis
        </span>
      </Link>
    </div>
  );
}
