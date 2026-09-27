import { chromium } from "@playwright/test";
const DIR = process.argv[2];
const ROTAS = [["/", "home"], ["/mercados", "mercados"], ["/dashboard", "dashboard"], ["/previsao", "previsao"], ["/track-record", "track"], ["/nivel/1", "nivel1"]];
const nav = await chromium.launch();
for (const tema of ["dark", "light"]) {
  for (const [rota, nome] of ROTAS) {
    const ctx = await nav.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });
    const p = await ctx.newPage();
    await p.addInitScript((t) => { localStorage.setItem("jlb_onboarding_v3","done"); localStorage.setItem("jlb-theme", t); localStorage.setItem("jlb_cookies_v1","accepted"); }, tema);
    await p.goto("http://localhost:3432" + rota, { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(3000);
    await p.screenshot({ path: `${DIR}/${nome}-${tema}.png` });
    await ctx.close();
  }
}
await nav.close();
console.log("capturas em", DIR);
