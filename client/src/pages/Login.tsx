/**
 * Login Page — JLB Analytics
 * Supports: email/password sign-in, sign-up, Google OAuth, password reset
 */

import { useState } from "react";
import { useLocation, Link } from "wouter";
import { Mail, Lock, Eye, EyeOff, Chrome, ArrowLeft, AlertCircle, CheckCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useSEO } from "@/hooks/useSEO";
import { track } from "@/lib/analytics";
import { checkPassword, MIN_PASSWORD_LEN } from "@/lib/passwordSafety";
import { marcarAceitePendente } from "@/lib/aceite";

type Mode = "login" | "signup" | "reset";

const inputClass =
  "w-full px-4 py-3 rounded-lg bg-secondary/50 border border-border/50 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-colors";

export default function Login() {
  useSEO("Entrar", "Acesse sua conta para sincronizar previsões, calibração e progresso.");
  const [, navigate] = useLocation();
  const { signIn, signUp, signInWithGoogle, resetPassword } = useAuth();
  // O aceite é exigido só no cadastro: quem já tem conta aceitou quando criou.
  const [aceitou, setAceitou] = useState(false);

  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const reset = () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setEmail("");
    setPassword("");
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    reset();
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    if (mode === "login") {
      const { error } = await signIn(email, password);
      if (error) {
        setErrorMsg(translateError(error));
      } else {
        track("login");
        navigate("/dashboard");
      }
    } else if (mode === "signup") {
      // Regras locais + checagem no HaveIBeenPwned (k-anonimato: a senha não sai
      // do navegador). É a proteção do plano Pro do Supabase, implementada por
      // nós — ver lib/passwordSafety.ts. Falha aberta se a API estiver fora.
      const verdict = await checkPassword(password);
      if (!verdict.ok) {
        setErrorMsg(verdict.reason ?? "Escolha uma senha mais forte.");
        setSubmitting(false);
        return;
      }
      // Barreira no cliente E no envio: o botão já fica desabilitado, mas quem
      // burlar o HTML não passa daqui.
      if (!aceitou) {
        setErrorMsg("Para criar a conta, é preciso aceitar os Termos de Uso e a Política de Privacidade.");
        setSubmitting(false);
        return;
      }
      const { error } = await signUp(email, password);
      if (error) {
        setErrorMsg(translateError(error));
      } else {
        // O aceite é gravado quando a SESSÃO aparecer — no cadastro por e-mail
        // ela só existe depois da confirmação. Ver lib/aceite.ts.
        marcarAceitePendente();
        track("signup");
        setSuccessMsg("Conta criada! Verifique seu e-mail para confirmar o cadastro.");
      }
    } else {
      const { error } = await resetPassword(email);
      if (error) {
        setErrorMsg(translateError(error));
      } else {
        setSuccessMsg("E-mail de recuperação enviado! Verifique sua caixa de entrada.");
      }
    }

    setSubmitting(false);
  }

  async function handleGoogle() {
    // O CADASTRO PELO GOOGLE PASSA PELA MESMA PORTA. Sem isto o aceite seria
    // contornável com um clique: bastava trocar para "criar conta" e entrar pelo
    // Google, e a pessoa teria conta sem nunca ter visto os termos.
    if (mode === "signup") {
      if (!aceitou) {
        setErrorMsg("Para criar a conta, é preciso aceitar os Termos de Uso e a Política de Privacidade.");
        return;
      }
      // Marcado ANTES de sair da página: o Google redireciona o navegador, e o
      // código depois desta linha pode nunca rodar.
      marcarAceitePendente();
    }
    setSubmitting(true);
    setErrorMsg(null);
    const { error } = await signInWithGoogle();
    if (error) {
      setErrorMsg(translateError(error));
      setSubmitting(false);
    }
    // On success, Supabase redirects the browser — no need to navigate()
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          {/* Monograma da marca (linha ascendente + ponto) — o gradiente azul era resquício de scaffold */}
          <div className="w-12 h-12 rounded-xl bg-gold/12 border border-gold/25 flex items-center justify-center mb-3">
            <svg viewBox="0 0 32 32" className="w-9 h-9 text-gold" aria-hidden="true">
              <path d="M6.5 21.5 L12.5 14 L17.5 18 L25 8.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="25" cy="8.5" r="2.2" fill="currentColor" />
            </svg>
          </div>
          <h1 className="text-xl font-display font-bold text-[var(--titulo)]">JLB Analytics</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {mode === "login" && "Entre na sua conta"}
            {mode === "signup" && "Crie sua conta gratuita"}
            {mode === "reset" && "Recuperar senha"}
          </p>
        </div>

        <div className="glass-card rounded-2xl p-8">
          {/* Google OAuth */}
          {mode !== "reset" && (
            <>
              <button
                onClick={handleGoogle}
                disabled={submitting || (mode === "signup" && !aceitou)}
                className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-lg border border-border/50 bg-secondary/30 text-sm font-medium text-foreground hover:bg-secondary/50 transition-colors disabled:opacity-50"
                aria-label="Entrar com Google"
              >
                <Chrome className="w-4 h-4" aria-hidden="true" />
                Continuar com Google
              </button>

              <div className="flex items-center gap-3 my-6">
                <div className="flex-1 h-px bg-border/30" />
                <span className="text-xs text-muted-foreground">ou</span>
                <div className="flex-1 h-px bg-border/30" />
              </div>
            </>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                required
                autoComplete="email"
                className={`${inputClass} pl-10`}
                aria-label="E-mail"
              />
            </div>

            {mode !== "reset" && (
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === "signup" ? `Mínimo ${MIN_PASSWORD_LEN} caracteres, com letras e números` : "Sua senha"}
                  required
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  className={`${inputClass} pl-10 pr-10`}
                  aria-label="Senha"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
                </button>
              </div>
            )}

            {/* Error */}
            {errorMsg && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-negative/10 border border-negative/30" role="alert">
                <AlertCircle className="w-4 h-4 text-negative shrink-0 mt-0.5" aria-hidden="true" />
                <p className="text-xs text-negative leading-relaxed">{errorMsg}</p>
              </div>
            )}

            {/* Success */}
            {successMsg && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-positive/10 border border-positive/30" role="status">
                <CheckCircle className="w-4 h-4 text-positive shrink-0 mt-0.5" aria-hidden="true" />
                <p className="text-xs text-positive leading-relaxed">{successMsg}</p>
              </div>
            )}

            {/* ACEITE DOS TERMOS — só no cadastro.
                O texto diz o que está sendo aceito em vez de "li e concordo":
                quem clica em "li e concordo" não leu, e as três coisas listadas
                aqui são justamente as que geram briga depois (achar que análise
                é garantia, achar que a IA não erra, achar que vendemos método). */}
            {mode === "signup" && (
              <label className="flex items-start gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={aceitou}
                  onChange={(e) => setAceitou(e.target.checked)}
                  required
                  className="mt-0.5 w-4 h-4 shrink-0 accent-primary cursor-pointer"
                />
                <span className="text-[11px] text-muted-foreground leading-relaxed">
                  Li e aceito os{" "}
                  <Link href="/termos"><span className="text-gold hover:underline">Termos de Uso</span></Link>{" "}
                  e a{" "}
                  <Link href="/privacidade"><span className="text-gold hover:underline">Política de Privacidade</span></Link>.
                  Entendo que a JLB é uma plataforma de <strong className="text-foreground/80">educação e análise</strong>,
                  que <strong className="text-foreground/80">nossas análises erram</strong> e não garantem ganho,
                  e que <strong className="text-foreground/80">não oferecemos método de lucro nem forma de burlar
                  sistema algum</strong>.
                </span>
              </label>
            )}

            <button
              type="submit"
              disabled={submitting || !email || (mode === "signup" && !aceitou)}
              className="w-full py-3 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {submitting ? "Aguarde..." : mode === "login" ? "Entrar" : mode === "signup" ? "Criar conta" : "Enviar e-mail"}
            </button>
          </form>

          {/* Mode switchers */}
          <div className="mt-6 space-y-2 text-center">
            {mode === "login" && (
              <>
                <button onClick={() => switchMode("reset")} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                  Esqueci minha senha
                </button>
                <p className="text-xs text-muted-foreground">
                  Não tem conta?{" "}
                  <button onClick={() => switchMode("signup")} className="text-primary hover:underline font-medium">
                    Criar gratuitamente
                  </button>
                </p>
              </>
            )}
            {mode === "signup" && (
              <p className="text-xs text-muted-foreground">
                Já tem conta?{" "}
                <button onClick={() => switchMode("login")} className="text-primary hover:underline font-medium">
                  Entrar
                </button>
              </p>
            )}
            {mode === "reset" && (
              <button
                onClick={() => switchMode("login")}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mx-auto"
              >
                <ArrowLeft className="w-3 h-3" aria-hidden="true" />
                Voltar ao login
              </button>
            )}
          </div>
        </div>

        {/* Guest access */}
        <p className="text-center text-xs text-muted-foreground mt-6">
          Prefere não criar conta?{" "}
          <button
            onClick={() => navigate("/dashboard")}
            className="text-primary hover:underline"
          >
            Continuar como visitante
          </button>
        </p>
      </div>
    </main>
  );
}

// ─── Translate common Supabase error messages to PT-BR ────────────────────

function translateError(msg: string): string {
  if (msg.includes("Invalid login credentials")) return "E-mail ou senha incorretos.";
  if (msg.includes("Email not confirmed")) return "Confirme seu e-mail antes de entrar.";
  if (msg.includes("User already registered")) return "Este e-mail já está cadastrado.";
  if (msg.includes("Password should be at least")) return "A senha deve ter pelo menos 6 caracteres.";
  if (msg.includes("Unable to validate email")) return "E-mail inválido.";
  if (msg.includes("rate limit")) return "Muitas tentativas. Aguarde alguns minutos.";
  return msg;
}
