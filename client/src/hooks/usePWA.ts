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

    // Register service worker (silencioso — sem log no console do usuário)
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        /* SW opcional — falha silenciosa não afeta o app */
      });
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
