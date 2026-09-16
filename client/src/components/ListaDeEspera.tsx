/**
 * ListaDeEspera — o campo de e-mail que /planos prometia e não tinha.
 *
 * Auditoria de 14/09/2026, item 21: a página dizia "deixe o seu e-mail e
 * avisamos quando abrir", e o botão era um `mailto:`. Em desktop sem cliente de
 * e-mail configurado, o clique não faz NADA visível — a pessoa que quis avisar
 * que pagaria some sem deixar rastro.
 *
 * O que o formulário promete é só o que a gente faz: um aviso quando o preço
 * sair. Sem data, porque não existe data.
 */
import { useState } from "react";
import { Mail, Check, Loader2 } from "lucide-react";
import { track } from "@/lib/analytics";

type Estado = "parado" | "enviando" | "pronto" | "erro";

export function ListaDeEspera() {
  const [email, setEmail] = useState("");
  const [estado, setEstado] = useState<Estado>("parado");
  const [erro, setErro] = useState("");

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (estado === "enviando") return;
    setEstado("enviando");
    setErro("");
    try {
      const r = await fetch("/api/lista-de-espera", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, origem: "planos" }),
      });
      if (r.ok) {
        setEstado("pronto");
        track("premium_click", { origem: "lista_de_espera" });
        return;
      }
      const corpo = await r.json().catch(() => null) as { message?: string } | null;
      setErro(corpo?.message ?? "Não conseguimos registrar agora. Tente mais tarde.");
      setEstado("erro");
    } catch {
      setErro("Sem conexão com o site. Tente de novo em instantes.");
      setEstado("erro");
    }
  }

  if (estado === "pronto") {
    return (
      <p className="inline-flex items-start gap-2 text-sm text-positive">
        <Check className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
        <span>
          Pronto — você está na lista. Escrevemos uma vez, quando o preço sair.
        </span>
      </p>
    );
  }

  return (
    <form onSubmit={enviar} className="max-w-md">
      <div className="flex flex-col sm:flex-row gap-2">
        <label htmlFor="email-espera" className="sr-only">Seu e-mail</label>
        <input
          id="email-espera"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); if (estado === "erro") setEstado("parado"); }}
          placeholder="seu@email.com"
          aria-describedby="nota-espera"
          aria-invalid={estado === "erro"}
          className="alvo-toque flex-1 px-3 rounded-lg bg-secondary/30 border border-border/50 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-gold/50"
        />
        <button
          type="submit"
          disabled={estado === "enviando"}
          className="alvo-toque inline-flex items-center justify-center gap-2 px-5 rounded-lg border border-gold/40 bg-gold/10 text-sm font-semibold text-gold hover:bg-gold/20 transition-colors disabled:opacity-60"
        >
          {estado === "enviando"
            ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Enviando…</>
            : <><Mail className="w-4 h-4" aria-hidden="true" /> Avise-me quando abrir</>}
        </button>
      </div>
      {estado === "erro" && <p className="mt-2 text-xs text-negative" role="alert">{erro}</p>}
      <p id="nota-espera" className="mt-2 text-[11px] text-muted-foreground">
        Guardamos só o e-mail, e só para este aviso. Sem newsletter, sem repasse a ninguém.
      </p>
    </form>
  );
}

export default ListaDeEspera;
