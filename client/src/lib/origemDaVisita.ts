/**
 * De onde veio quem chegou.
 *
 * O QUE FALTAVA (medido em 18/09/2026). A telemetria registrava 53 visitantes
 * em 30 dias e nenhuma pista de onde vieram: `meta` só tinha erro de
 * navegador. Sem isso nenhuma ação de divulgação pode ser avaliada — postar no
 * Instagram e não postar dão o mesmo número, porque o número não sabe a origem.
 *
 * O que se guarda, e o que NÃO se guarda. Do referrer, só o HOST
 * ("www.google.com") — a URL completa pode carregar busca, e-mail ou token de
 * quem clicou. As tags UTM vão inteiras (são rótulos que NÓS pomos no link). E
 * só na PRIMEIRA página da sessão: é a chegada que tem origem; as páginas
 * seguintes vieram de dentro do próprio site.
 *
 * ⚠️ WhatsApp no celular quase nunca manda referrer: chega como "direto". O
 * jeito de medir WhatsApp é compartilhar o link com `?utm_source=whatsapp`.
 */

export type Canal =
  | "direto" | "busca" | "whatsapp" | "instagram" | "facebook" | "x"
  | "linkedin" | "reddit" | "youtube" | "telegram" | "tiktok" | "outro site";

// `type`, não `interface`: vai direto como `meta` do track(), que pede
// Record<string, unknown> — e interface não tem assinatura de índice.
export type Origem = {
  canal: Canal | string;
  ref?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
};

const CANAIS: Array<[RegExp, Canal]> = [
  [/(^|\.)(google|bing|duckduckgo|yahoo|ecosia|yandex|search\.brave)\./, "busca"],
  [/(^|\.)(whatsapp\.com|wa\.me)$/, "whatsapp"],
  [/(^|\.)instagram\.com$/, "instagram"],
  [/(^|\.)(facebook\.com|fb\.com|fb\.me)$/, "facebook"],
  [/(^|\.)(t\.co|twitter\.com|x\.com)$/, "x"],
  [/(^|\.)(linkedin\.com|lnkd\.in)$/, "linkedin"],
  [/(^|\.)reddit\.com$/, "reddit"],
  [/(^|\.)(youtube\.com|youtu\.be)$/, "youtube"],
  [/(^|\.)(t\.me|telegram\.org|telegram\.me)$/, "telegram"],
  [/(^|\.)tiktok\.com$/, "tiktok"],
];

/** Rótulo curto e limpo: tag UTM é texto livre que alguém digitou num link. */
function tag(v: string | null): string | undefined {
  const t = (v ?? "").trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, "-").slice(0, 40);
  return t || undefined;
}

function hostDe(url: string): string | null {
  try { return new URL(url).hostname.toLowerCase(); } catch { return null; }
}

/**
 * Classifica a chegada. Devolve `null` quando a "chegada" é navegação interna
 * (referrer do próprio site) — essa não tem origem a registrar.
 */
export function origemDaVisita(referrer: string, search: string, hostAtual: string): Origem | null {
  const q = new URLSearchParams(search);
  const utm = {
    utm_source: tag(q.get("utm_source")),
    utm_medium: tag(q.get("utm_medium")),
    utm_campaign: tag(q.get("utm_campaign")),
  };
  const ref = referrer ? hostDe(referrer) : null;
  const semVazios = <T extends object>(o: T) =>
    Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

  // UTM é declaração explícita de quem montou o link: vence o referrer.
  if (utm.utm_source) {
    return semVazios({ canal: utm.utm_source, ref: ref ?? undefined, ...utm });
  }
  if (!ref) return { canal: "direto" };
  if (ref === hostAtual.toLowerCase()) return null;

  const canal = CANAIS.find(([re]) => re.test(ref))?.[1] ?? "outro site";
  return { canal, ref };
}

const CHAVE = "jlb_origem_registrada";
let registradaNestaCarga = false;

// Fotografada quando o app sobe: a navegação interna troca a URL e as UTMs da
// chegada somem dela. O referrer não precisa — numa SPA ele não muda.
const BUSCA_DA_CHEGADA = typeof window !== "undefined" ? window.location.search : "";

/**
 * A origem desta sessão, UMA vez: devolve o `meta` na primeira chamada e
 * `undefined` nas seguintes. Sem sessionStorage (aba privada), cai para "uma
 * vez por carga de página" — perde precisão, nunca multiplica chegadas.
 *
 * ⚠️ Chamar SÓ quando o evento vai mesmo sair (consentimento dado). Chamada
 * antes, ela gastaria a vez de registrar e a origem de quem aceita os cookies
 * na segunda página se perderia.
 */
export function origemDaSessao(): Origem | undefined {
  if (typeof window === "undefined" || registradaNestaCarga) return undefined;
  registradaNestaCarga = true;
  try {
    if (window.sessionStorage.getItem(CHAVE)) return undefined;
    window.sessionStorage.setItem(CHAVE, "1");
  } catch { /* sem storage: vale a trava por carga */ }
  return origemDaVisita(document.referrer, BUSCA_DA_CHEGADA, window.location.hostname) ?? undefined;
}
