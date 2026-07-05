/**
 * ResetPassword Page — JLB Analytics
 *
 * Fluxo:
 * 1. Usuário clica em "Esqueci minha senha" na tela de login
 * 2. Recebe e-mail com link → clica no link
 * 3. Supabase redireciona para /reset-password com tokens na URL
 * 4. Esta página detecta o evento PASSWORD_RECOVERY e exibe o formulário
 * 5. Usuário define nova senha → supabase.auth.updateUser()
 */

import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { TrendingUp, Lock, Eye, EyeOff, AlertCircle, CheckCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";

const inputClass =
  "w-full px-4 py-3 rounded-lg bg-secondary/50 border border-border/50 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-colors";

type PageState = "waiting" | "ready" | "success" | "error";

export default function ResetPassword() {
  const [, navigate] = useLocation();

  const [pageState, setPageState] = useState<PageState>("waiting");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Supabase dispara o evento PASSWORD_RECOVERY quando detecta
  // os tokens de recuperação na URL (hash fragment)
  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setPageState("ready");
      }
    });

    // Se o usuário chegou aqui sem o token (acesso direto pela URL),
    // aguardamos 3 segundos e redirecionamos para o login
    const timeout = setTimeout(() => {
      setPageState((prev) => {
        if (prev === "waiting") {
          navigate("/login");
          return "error";
        }
        return prev;
      });
    }, 3000);

    return () => {
      listener.subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    if (password.length < 6) {
      setErrorMsg("A senha deve ter pelo menos 6 caracteres.");
      return;
    }

    if (password !== confirm) {
      setErrorMsg("As senhas não coincidem.");
      return;
    }

    setSubmitting(true);

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setErrorMsg(error.message);
      setSubmitting(false);
    } else {
      setPageState("success");
    }
  }

  // ── Aguardando token do Supabase na URL ────────────────────────────────
  if (pageState === "waiting") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="w-10 h-10 border-2 border-neon-blue border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground text-sm">Verificando link de recuperação...</p>
        </div>
      </div>
    );
  }

  // ── Senha redefinida com sucesso ───────────────────────────────────────
  if (pageState === "success") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-md text-center glass-card rounded-2xl p-8">
          <div className="flex justify-center mb-4">
            <div className="w-12 h-12 rounded-full bg-positive/10 flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-positive" />
            </div>
          </div>
          <h2 className="text-lg font-semibold text-foreground mb-2">Senha redefinida!</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Sua senha foi atualizada com sucesso.
          </p>
          <button
            onClick={() => navigate("/dashboard")}
            className="w-full py-3 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Ir para o Dashboard
          </button>
        </div>
      </div>
    );
  }

  // ── Formulário de nova senha ───────────────────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-neon-blue to-primary flex items-center justify-center mb-3">
            <TrendingUp className="w-6 h-6 text-white" aria-hidden="true" />
          </div>
          <h1 className="text-xl font-display font-bold text-foreground">JLB Analytics</h1>
          <p className="text-sm text-muted-foreground mt-1">Defina sua nova senha</p>
        </div>

        <div className="glass-card rounded-2xl p-8">
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {/* Nova senha */}
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Nova senha (mínimo 6 caracteres)"
                required
                autoComplete="new-password"
                className={`${inputClass} pl-10 pr-10`}
                aria-label="Nova senha"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {/* Confirmar senha */}
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
              <input
                type={showPassword ? "text" : "password"}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Confirme a nova senha"
                required
                autoComplete="new-password"
                className={`${inputClass} pl-10`}
                aria-label="Confirmar nova senha"
              />
            </div>

            {/* Erro */}
            {errorMsg && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-negative/10 border border-negative/30" role="alert">
                <AlertCircle className="w-4 h-4 text-negative shrink-0 mt-0.5" aria-hidden="true" />
                <p className="text-xs text-negative leading-relaxed">{errorMsg}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || !password || !confirm}
              className="w-full py-3 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {submitting ? "Salvando..." : "Redefinir senha"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
