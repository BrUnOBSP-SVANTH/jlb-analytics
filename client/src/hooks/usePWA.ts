/**
 * usePWA — PWA install prompt + service worker registration
 * Fase 5: Feature nova
 *
 * Returns:
 *  - canInstall: true when browser has a deferred install prompt
 *  - install(): triggers the native install dialog
 *  - isInstalled: true when running as standalone PWA
 */

import { useState, useEffect } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** Variável de MÓDULO, não de storage: sobrevive a re-render mas não a recarga,
 *  que é exatamente o escopo certo para impedir um laço de recarregamentos. */
let recarregouPorTrocaDeSW = false;

export function usePWA() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if already running as PWA
    const mq = window.matchMedia("(display-mode: standalone)");
    setIsInstalled(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setIsInstalled(e.matches);
    mq.addEventListener("change", onChange);

    // Capture install prompt
    const handler = (e: Event) => {
      e.preventDefault();
      setPromptEvent(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handler);

    if ("serviceWorker" in navigator) {
      if (import.meta.env.PROD) {
        // Quem já tinha a página CONTROLADA por um SW antigo está rodando o
        // shell que ele entregou. Quando o SW novo assume, recarregar uma vez
        // troca esse shell pelo atual. Primeira visita (sem controlador) não
        // precisa: a página já veio da rede.
        const tinhaControlador = Boolean(navigator.serviceWorker.controller);
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          if (!tinhaControlador || recarregouPorTrocaDeSW) return;
          recarregouPorTrocaDeSW = true;
          window.location.reload();
        });
        navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
          /* SW opcional — falha silenciosa não afeta o app */
        });
      } else {
        /**
         * NO SERVIDOR DE DESENVOLVIMENTO, NENHUM SERVICE WORKER.
         *
         * Foi aqui que o fundador viu a tela branca: o SW cacheava os módulos
         * do Vite, que mudam de versão quando as dependências são reotimizadas.
         * O HTML congelado pedia módulos que já não existiam, o React não
         * montava, e o token do login com Google ficava parado na URL.
         *
         * Não basta deixar de registrar — o SW antigo continua instalado no
         * navegador de quem já abriu o localhost. Então desregistramos e
         * apagamos os caches ativamente: o ambiente de dev se cura sozinho na
         * primeira carga. O preço é não testar Web Push em dev, e vale.
         */
        navigator.serviceWorker.getRegistrations()
          .then((regs) => Promise.all(regs.map((r) => r.unregister())))
          .catch(() => {});
        if ("caches" in window) {
          caches.keys().then((ks) => Promise.all(ks.map((k) => caches.delete(k)))).catch(() => {});
        }
      }
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      mq.removeEventListener("change", onChange);
    };
  }, []);

  const install = async () => {
    if (!promptEvent) return;
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    if (outcome === "accepted") setPromptEvent(null);
  };

  return {
    canInstall: !!promptEvent && !isInstalled,
    install,
    isInstalled,
  };
}
