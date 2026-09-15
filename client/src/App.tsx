/**
 * App.tsx — JLB Analytics
 */

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Redirect, Route, Switch, useLocation } from "wouter";
import { APELIDOS } from "@shared/rotas";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AuthProvider } from "./contexts/AuthContext";
import Layout from "./components/Layout";
import EntradaDePagina from "./components/EntradaDePagina";
import Home from "./pages/Home";
import { lazy, Suspense, useLayoutEffect, useState } from "react";
import { usePWA } from "./hooks/usePWA";
import ProgressSync from "./components/ProgressSync";

/**
 * TRV-02: estes três entravam no bundle INICIAL de toda rota. A auditoria
 * mediu: ao abrir /apostas, o navegador carregava também `Home.tsx`,
 * `NotFound.tsx`, `UpgradeModal`, `OnboardingTour`, `ChatWidget` e
 * `CommandPalette` — tudo de uma vez.
 *
 * Nenhum dos três aparece no primeiro quadro: o tour só existe para quem nunca
 * viu o site, o chat só monta ao ser aberto e o modal de upgrade só quando a
 * cota estoura. Carregar tarde não muda nada para o usuário e tira peso da
 * primeira pintura, que é onde ele espera.
 */
const OnboardingTour = lazy(() => import("./components/OnboardingTour"));
const ChatWidget     = lazy(() => import("./components/chat/ChatWidget"));
const UpgradeModal   = lazy(() => import("./components/UpgradeModal"));

const Login         = lazy(() => import("./pages/Login"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Nivel1        = lazy(() => import("./pages/Nivel1"));
const Nivel2        = lazy(() => import("./pages/Nivel2"));
const Nivel3        = lazy(() => import("./pages/Nivel3"));
const Nivel4        = lazy(() => import("./pages/Nivel4"));
const Nivel5        = lazy(() => import("./pages/Nivel5"));
const Apostas       = lazy(() => import("./pages/Apostas"));
const Simulador     = lazy(() => import("./pages/Simulador"));
const Noticias      = lazy(() => import("./pages/Noticias"));
const Calculadoras  = lazy(() => import("./pages/Calculadoras"));
const Educacao      = lazy(() => import("./pages/Educacao"));
const Dashboard     = lazy(() => import("./pages/Dashboard"));
const Perfil        = lazy(() => import("./pages/Perfil"));
const Planos        = lazy(() => import("./pages/Planos"));
const Sobre         = lazy(() => import("./pages/Sobre"));
const Previsao      = lazy(() => import("./pages/Previsao"));
const TrackRecord   = lazy(() => import("./pages/TrackRecord"));
const Imprensa      = lazy(() => import("./pages/Imprensa"));
const Briefing      = lazy(() => import("./pages/Briefing"));
const Portfolio     = lazy(() => import("./pages/Portfolio"));
const MarketDetail  = lazy(() => import("./pages/MarketDetail"));
const Leaderboard   = lazy(() => import("./pages/Leaderboard"));
const Duelos        = lazy(() => import("./pages/Duelos"));
const Termos        = lazy(() => import("./pages/Termos"));
const Privacidade   = lazy(() => import("./pages/Privacidade"));

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-2 border-neon-blue border-t-transparent rounded-full animate-spin" aria-hidden="true" />
        <p className="text-muted-foreground text-sm">Carregando...</p>
      </div>
    </div>
  );
}

/** Guardado no aparelho: quem disse "agora não" não é perguntado de novo. */
const CHAVE_PWA_DISPENSADO = "jlb_pwa_dispensado";

/**
 * Convite para instalar o app.
 *
 * DOIS DEFEITOS QUE ELE TINHA (14/09/2026):
 *  1. Não havia como fechar. Só "Instalar" — em todo navegador que aceita
 *     instalação (o Chrome de desktop inclusive), o banner flutuava sobre o
 *     conteúdo em toda página, para sempre, até a pessoa instalar.
 *  2. Ficava fixo a 96px do rodapé, sem saber do aviso de cookies — que tem
 *     165px no celular. O convite caía EM CIMA do aviso. Agora lê a mesma
 *     `--folga-inferior` que o botão do chat (hooks/useFolgaInferior.ts), e fica
 *     acima dos dois.
 */
function PWAInstallBanner() {
  const { canInstall, install } = usePWA();
  const [dispensado, setDispensado] = useState(() => {
    try { return localStorage.getItem(CHAVE_PWA_DISPENSADO) === "1"; } catch { return false; }
  });
  if (!canInstall || dispensado) return null;

  function agoraNao() {
    try { localStorage.setItem(CHAVE_PWA_DISPENSADO, "1"); } catch { /* aba privada: vale só nesta visita */ }
    setDispensado(true);
  }

  return (
    <div
      role="region"
      aria-label="Instalar o app"
      // 5rem acima do respiro = a altura do botão do chat e um vão, como antes.
      style={{ bottom: "calc(var(--folga-inferior, 0px) + var(--respiro-flutuante) + 5rem)" }}
      // Largura cheia com margem no celular, centralizado no desktop. Fundo
      // SÓLIDO (bg-popover), e não `glass-card`: translúcido, ele deixava o botão
      // dourado da página aparecer por baixo do texto — em 390px ficava ilegível.
      className="fixed inset-x-4 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 z-40 flex items-center gap-2 pl-4 pr-2 py-2 rounded-xl border border-border/60 bg-popover shadow-lg transition-[bottom] duration-300"
    >
      <span className="flex-1 min-w-0 text-[13px] leading-snug text-foreground">Instalar o app da JLB?</span>
      <button onClick={agoraNao} className="alvo-toque shrink-0 whitespace-nowrap px-3 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
        Agora não
      </button>
      <button onClick={install} className="alvo-toque shrink-0 whitespace-nowrap px-4 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity">
        Instalar
      </button>
    </div>
  );
}

/** SPA não reseta o scroll sozinha — sem isto, navegar pelo footer deixava o
 *  usuário no meio da página seguinte. Hash (#ancora) é respeitado. */
function ScrollToTop() {
  const [location] = useLocation();
  useLayoutEffect(() => {
    if (!window.location.hash) window.scrollTo(0, 0);
  }, [location]);
  return null;
}

function Router() {
  return (
    <Switch>
      <Route path="/login">
        <Suspense fallback={<PageLoader />}><Login /></Suspense>
      </Route>
      <Route path="/reset-password">
        <Suspense fallback={<PageLoader />}><ResetPassword /></Suspense>
      </Route>
      <Route>
        <Layout>
          {/* Toda página do site sobe e aparece ao abrir — inclusive as que ainda
              não existem. Ver components/EntradaDePagina.tsx. */}
          <EntradaDePagina>
          <Suspense fallback={<PageLoader />}>
            <Switch>
              <Route path="/"             component={Home} />
              <Route path="/educacao"     component={Educacao} />
              <Route path="/nivel/1"      component={Nivel1} />
              <Route path="/nivel/2"      component={Nivel2} />
              <Route path="/nivel/3"      component={Nivel3} />
              <Route path="/nivel/4"      component={Nivel4} />
              <Route path="/nivel/5"      component={Nivel5} />
              {/* NEG-01: a rota canônica é /mercados.
                  Os Termos dizem "não somos uma casa de apostas" e a rota
                  principal do site era /apostas — com "Aposte dinheiro
                  fictício", "½ Kelly (RECOMENDADO)" e comparação nominal com
                  uma casa de apostas. A auditoria apontou o risco: com a Lei
                  14.790/2023 e as regras de publicidade de apostas no Brasil, a
                  ambiguidade traz exposição regulatória, de meio de pagamento e
                  de loja de aplicativos.
                  O produto é educação quantitativa, e agora a URL diz isso. */}
              <Route path="/mercados/:id" component={MarketDetail} />
              <Route path="/mercados"     component={Apostas} />
              <Route path="/simulador"    component={Simulador} />
              <Route path="/noticias"     component={Noticias} />
              <Route path="/calculadoras" component={Calculadoras} />
              <Route path="/dashboard"    component={Dashboard} />
              <Route path="/perfil"       component={Perfil} />
              <Route path="/leaderboard"  component={Leaderboard} />
              <Route path="/duelos"       component={Duelos} />
              <Route path="/previsao"     component={Previsao} />
              <Route path="/track-record" component={TrackRecord} />
              <Route path="/imprensa"     component={Imprensa} />
              <Route path="/briefing"     component={Briefing} />
              <Route path="/portfolio"    component={Portfolio} />
              <Route path="/planos"       component={Planos} />
              <Route path="/sobre"        component={Sobre} />
              <Route path="/termos"       component={Termos} />
              <Route path="/privacidade"  component={Privacidade} />
              {/* Endereços antigos (shared/rotas.ts). <Redirect> do wouter, e não
                  window.location.replace: aquilo baixava o site inteiro de novo a
                  cada clique num link antigo (auditoria de 14/09, item 12). O
                  servidor responde 301 aos mesmos endereços para quem chega de fora. */}
              <Route path="/apostas/:id">{(p) => <Redirect to={`/mercados/${p.id}`} replace />}</Route>
              {Object.entries(APELIDOS).map(([de, para]) => (
                <Route key={de} path={de}><Redirect to={para} replace /></Route>
              ))}
              <Route path="/404"          component={NotFound} />
              <Route                      component={NotFound} />
            </Switch>
          </Suspense>
          </EntradaDePagina>
        </Layout>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <ScrollToTop />
            <ProgressSync />
            <Router />
            <PWAInstallBanner />
            {/* `fallback={null}`: são acessórios: nenhum deles deve reservar
                espaço nem piscar um esqueleto enquanto chega. */}
            <Suspense fallback={null}>
              <OnboardingTour />
              <ChatWidget />
              <UpgradeModal />
            </Suspense>
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
