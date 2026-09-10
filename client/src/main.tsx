import { createRoot } from "react-dom/client";
import App from "./App";
import { initErrorTracking } from "./lib/errorTracking";

/**
 * Fontes self-hosted (variable, woff2 com hash imutável) — sem render-blocking
 * externo do Google Fonts e sem vazar visitas para terceiros.
 *
 * TRÊS famílias, um papel cada (TRV-03). A auditoria encontrou CINCO baixadas e
 * três usadas: Playfair Display estava declarada como `--font-serif` e não era
 * referenciada em lugar nenhum, e Outfit só existia como reserva de Fraunces —
 * duas serifadas display para o mesmo papel. Fonte que não aparece na tela é
 * peso puro no primeiro carregamento.
 *
 *   Fraunces      → display (títulos)
 *   Inter Tight   → texto
 *   JetBrains Mono → número e dado tabular
 */
import "@fontsource-variable/inter-tight";
import "@fontsource-variable/fraunces";
import "@fontsource-variable/jetbrains-mono";

import "./index.css";
import { limparChavesAntigas } from "./lib/limpezaStorage";

initErrorTracking();
// Apaga chaves de versões anteriores antes de o app montar (TRV-04).
limparChavesAntigas();
createRoot(document.getElementById("root")!).render(<App />);
