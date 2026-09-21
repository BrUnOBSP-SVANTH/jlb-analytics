/**
 * CotaDeAnalises — quanto da cota grátis de IA a pessoa já usou no mês.
 *
 * POR QUE EXISTE (21/09/2026). A pastilha "X análises restantes" da barra de
 * navegação leva para /perfil — e o perfil não dizia nada sobre a cota. Quem
 * clicava querendo entender o consumo não achava.
 *
 * Diz também a regra que mudou no mesmo dia: a cota é da PESSOA (o e-mail),
 * não da conta. Quem tem duas contas no mesmo e-mail precisa saber por que o
 * saldo aparece dividido — regra invisível parece defeito.
 */
import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { apiFetch, EVENTO_IA_USADA } from "@/lib/api";
import { plural } from "@shared/formato";
import { COTA_GRATIS_MENSAL } from "@shared/planos";

interface Cota { used: number; limit: number | null; plan: string }

/** "1º de outubro" — o dia em que a cota volta a zero (virada do mês, UTC). */
export function renovaEm(agora = new Date()): string {
  const proximo = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() + 1, 1));
  const mes = proximo.toLocaleDateString("pt-BR", { month: "long", timeZone: "UTC" });
  return `1º de ${mes}`;
}

export function CotaDeAnalises() {
  const [cota, setCota] = useState<Cota | null>(null);

  useEffect(() => {
    let vivo = true;
    const ler = () => {
      apiFetch("/api/ai/credits")
        .then((r) => (r.ok ? (r.json() as Promise<Cota>) : null))
        .then((c) => { if (c && vivo) setCota(c); })
        .catch(() => {});
    };
    ler();
    // Mesmo aviso que a barra de navegação ouve — ver lib/api.ts.
    const aoUsarIA = () => setTimeout(ler, 1500);
    window.addEventListener(EVENTO_IA_USADA, aoUsarIA);
    return () => { vivo = false; window.removeEventListener(EVENTO_IA_USADA, aoUsarIA); };
  }, []);

  if (!cota || cota.plan === "premium") return null; // Premium já tem o próprio cartão

  const limite = cota.limit ?? COTA_GRATIS_MENSAL;
  const usadas = Math.min(cota.used, limite);
  const restantes = Math.max(0, limite - usadas);

  return (
    <div className="glass-card rounded-2xl p-5 space-y-3" aria-live="polite">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-primary" aria-hidden="true" />
        <h2 className="font-semibold text-[var(--titulo)]">Análises de IA deste mês</h2>
      </div>
      <p className="text-sm text-foreground">
        {restantes > 0
          ? <>Você ainda tem <strong>{plural(restantes, "análise", "análises")}</strong> de {limite}. </>
          : <>Você usou as {limite} análises grátis deste mês. </>}
        <span className="text-muted-foreground">A cota renova em {renovaEm()}.</span>
      </p>
      <div
        className="h-2 w-full rounded-full bg-secondary/40 overflow-hidden"
        role="progressbar" aria-valuemin={0} aria-valuemax={limite} aria-valuenow={usadas}
        aria-label={`${usadas} de ${limite} análises usadas`}
      >
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(usadas / limite) * 100}%` }} />
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        A cota vale por pessoa, não por conta: contas no mesmo e-mail dividem as mesmas análises.
        Repetir a análise de um mercado nas horas seguintes não gasta outra — a resposta já está pronta.
      </p>
    </div>
  );
}
