import { createRoot } from "react-dom/client";
import App from "./App";
import { initErrorTracking } from "./lib/errorTracking";

// Fontes self-hosted (variable, woff2 com hash imutável) — sem render-blocking
// externo do Google Fonts e sem vazar visitas para terceiros.
import "@fontsource-variable/inter-tight";
import "@fontsource-variable/outfit";
import "@fontsource-variable/fraunces";
import "@fontsource-variable/playfair-display";
import "@fontsource-variable/jetbrains-mono";

import "./index.css";

initErrorTracking();
createRoot(document.getElementById("root")!).render(<App />);
