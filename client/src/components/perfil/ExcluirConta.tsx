/**
 * Excluir a conta — o direito do art. 18 da LGPD, exercível em dois cliques.
 *
 * POR QUE EXISTE (Auditoria 21/09, PRV-01). A Política prometia eliminação dos
 * dados, mas o único caminho era mandar e-mail e esperar alguém ler. Direito
 * que depende da boa vontade de quem abre a caixa de entrada não é direito
 * exercível — é promessa.
 *
 * ⚠️ O desenho aqui é deliberadamente CHATO: a pessoa precisa digitar EXCLUIR.
 * Não é fricção decorativa — é a única confirmação possível para uma ação que
 * apaga previsões, progresso e histórico e não tem volta. Um diálogo de "tem
 * certeza?" com dois botões é clicado no automático; digitar uma palavra, não.
 *
 * E o aviso sobre o track record vem ANTES, não depois: o que já foi resolvido
 * sai do seu nome, e é justo dizer isso enquanto ainda dá para mudar de ideia.
 */
import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import AnimatedSection from "@/components/AnimatedSection";
import { apiFetch } from "@/lib/api";
import { supabase } from "@/lib/supabase";

export function ExcluirConta() {
  const [aberto, setAberto] = useState(false);
  const [confirmacao, setConfirmacao] = useState("");
  const [excluindo, setExcluindo] = useState(false);

  async function excluir() {
    setExcluindo(true);
    try {
      const r = await apiFetch("/api/conta/minha-conta", {
        method: "DELETE",
        body: JSON.stringify({ confirmacao }),
      });
      const dados = await r.json() as { excluida?: boolean; message?: string };
      if (!dados.excluida) {
        toast.error(dados.message ?? "Não foi possível excluir a conta agora.");
        setExcluindo(false);
        return;
      }
      // A sessão morre com a conta: sair daqui evita a tela seguinte tentar
      // carregar dados de um usuário que não existe mais.
      await supabase.auth.signOut();
      try { localStorage.clear(); } catch { /* aba privada */ }
      window.location.href = "/";
    } catch {
      toast.error("Não foi possível excluir a conta agora.");
      setExcluindo(false);
    }
  }

  return (
    <AnimatedSection>
      <div className="glass-card rounded-2xl p-5 border border-negative/20">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-negative shrink-0 mt-0.5" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-[var(--titulo)] text-sm">Excluir minha conta</h2>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Apaga sua conta, suas previsões, o progresso na trilha, a banca simulada e os alertas.
              Não tem volta.
            </p>
            <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
              As previsões que já foram <strong className="text-foreground">resolvidas</strong> saem do seu nome,
              mas continuam contando no total público do track record — sem dono. Apagar o resultado depois de
              saber o desfecho é justamente o que a plataforma existe para não fazer.
            </p>

            {!aberto ? (
              <button
                onClick={() => setAberto(true)}
                className="mt-3 text-xs text-negative hover:underline underline-offset-2 transition-colors"
              >
                Quero excluir minha conta
              </button>
            ) : (
              <div className="mt-3 space-y-2">
                <label htmlFor="confirmar-exclusao" className="block text-[11px] text-muted-foreground">
                  Para confirmar, digite <strong className="text-foreground">EXCLUIR</strong>:
                </label>
                <input
                  id="confirmar-exclusao"
                  type="text"
                  value={confirmacao}
                  onChange={(e) => setConfirmacao(e.target.value)}
                  autoComplete="off"
                  className="w-full min-w-0 px-3 py-2 rounded-lg bg-secondary/40 border border-border/40 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-negative"
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={excluir}
                    disabled={confirmacao.trim().toUpperCase() !== "EXCLUIR" || excluindo}
                    className="px-4 py-2 rounded-lg bg-negative/15 border border-negative/30 text-xs font-semibold text-negative hover:bg-negative/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {excluindo ? "Excluindo…" : "Excluir definitivamente"}
                  </button>
                  <button
                    onClick={() => { setAberto(false); setConfirmacao(""); }}
                    className="px-4 py-2 rounded-lg border border-border/40 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AnimatedSection>
  );
}
