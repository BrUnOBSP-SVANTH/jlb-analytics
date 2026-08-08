/**
 * App.tsx — JLB Analytics
 */

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AuthProvider } from "./contexts/AuthContext";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import { lazy, Suspense, useLayoutEffect } from "react";
import { usePWA } from "./hooks/usePWA";
import OnboardingTour from "./components/OnboardingTour";
import ChatWidget from "./components/chat/ChatWidget";
import ProgressSync from "./components/ProgressSync";

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
const Sobre         = lazy(() => import("./pages/Sobre"));
const Previsao      = lazy(() => import("./pages/Previsao"));
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

function PWAInstallBanner() {
  const { canInstall, install } = usePWA();
  if (!canInstall) return null;
  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-4 py-3 glass-card rounded-xl shadow-lg border border-border/30 text-sm">
      <span className="text-foreground">Instalar o app JLB no dispositivo?</span>
      <button onClick={install} className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity">
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
          <Suspense fallback={<PageLoader />}>
            <Switch>
              <Route path="/"             component={Home} />
              <Route path="/educacao"     component={Educacao} />
              <Route path="/nivel/1"      component={Nivel1} />
              <Route path="/nivel/2"      component={Nivel2} />
              <Route path="/nivel/3"      component={Nivel3} />
              <Route path="/nivel/4"      component={Nivel4} />
              <Route path="/nivel/5"      component={Nivel5} />
              <Route path="/apostas/:id"  component={MarketDetail} />
              <Route path="/apostas"      component={Apostas} />
              <Route path="/simulador"    component={Simulador} />
              <Route path="/noticias"     component={Noticias} />
              <Route path="/calculadoras" component={Calculadoras} />
              <Route path="/dashboard"    component={Dashboard} />
              <Route path="/perfil"       component={Perfil} />
              <Route path="/leaderboard"  component={Leaderboard} />
              <Route path="/duelos"       component={Duelos} />
              <Route path="/previsao"     component={Previsao} />
              <Route path="/briefing"     component={Briefing} />
              <Route path="/portfolio"    component={Portfolio} />
              <Route path="/sobre"        component={Sobre} />
              <Route path="/termos"       component={Termos} />
              <Route path="/privacidade"  component={Privacidade} />
              {/* Redirects backward compat */}
              {["/mercado","/mercados"].map(p => <Route key={p} path={p}>{() => { window.location.replace("/apostas"); return null; }}</Route>)}
              {["/minha-conta"].map(p => <Route key={p} path={p}>{() => { window.location.replace("/dashboard"); return null; }}</Route>)}
              {/* Backtester e a TELA do Cerebro foram retirados do site (mantido o motor do Cerebro nos bastidores). Redireciona links antigos. */}
              {["/laboratorio","/backtester"].map(p => <Route key={p} path={p}>{() => { window.location.replace("/calculadoras"); return null; }}</Route>)}
              {["/cerebro"].map(p => <Route key={p} path={p}>{() => { window.location.replace("/previsao"); return null; }}</Route>)}
              {["/analise"].map(p => <Route key={p} path={p}>{() => { window.location.replace("/previsao"); return null; }}</Route>)}
              {["/correlacao"].map(p => <Route key={p} path={p}>{() => { window.location.replace("/calculadoras"); return null; }}</Route>)}
              {["/premium","/contato"].map(p => <Route key={p} path={p}>{() => { window.location.replace("/sobre"); return null; }}</Route>)}
              <Route path="/404"          component={NotFound} />
              <Route                      component={NotFound} />
            </Switch>
          </Suspense>
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
            <OnboardingTour />
            <ChatWidget />
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
