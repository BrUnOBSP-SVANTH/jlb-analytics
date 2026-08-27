/**
 * Layout — raiz visual do JLB Analytics.
 * Identity: obsidian bg, gold/neon-blue accents, glass-card.
 * A navegação (Navbar) e o rodapé (Footer) vivem em components/layout/*.
 */
import { ReactNode, useEffect } from "react";
import { useLocation } from "wouter";
import CommandPalette from "./CommandPalette";
import { track } from "@/lib/analytics";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";

export default function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();

  // page_view a cada mudança de rota (SPA não dispara navegação do browser)
  useEffect(() => { track("page_view"); }, [location]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Skip-link (WCAG 2.4.1): visível só ao receber foco via teclado */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-primary focus:text-primary-foreground focus:text-sm focus:font-semibold focus:shadow-lg"
      >
        Pular para o conteúdo
      </a>
      <CommandPalette />
      <Navbar />
      <main id="main-content" tabIndex={-1} className="flex-1 focus:outline-none">{children}</main>
      <Footer />
    </div>
  );
}
