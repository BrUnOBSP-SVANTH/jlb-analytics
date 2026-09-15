/**
 * gerar-sitemap.mjs — reescreve client/public/sitemap.xml a partir de shared/rotas.ts.
 *
 * O sitemap era escrito à mão e, em 14/09, listava três endereços que só
 * redirecionavam e omitia /mercados. Agora ele sai da mesma tabela do roteador,
 * e shared/rotas.test.ts falha se o arquivo e a tabela divergirem.
 *
 * Uso: pnpm sitemap
 */
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { sitemapXml } from "../shared/rotas.ts";

const destino = join(dirname(fileURLToPath(import.meta.url)), "..", "client", "public", "sitemap.xml");
writeFileSync(destino, sitemapXml());
console.log(`sitemap.xml gravado em ${destino}`);
