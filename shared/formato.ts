/**
 * Formatação de número em português do Brasil — a fonte única.
 *
 * POR QUE ISTO EXISTE. A auditoria encontrou o site inteiro escrevendo número
 * como quem escreve em inglês: `72.0%`, `0.144`, `±2.5`, `$108.6M`, e — o caso
 * que mais dói — `$1273912k` para US$ 1,27 bilhão, porque alguém dividiu por mil
 * uma vez e parou. Num produto que ensina a ler número, escrever número errado
 * não é detalhe de acabamento: é contradizer a aula.
 *
 * Mora em `shared/` de propósito. O servidor também escreve número (descrição de
 * card, texto de briefing, resumo de análise) e precisa escrever igual — dois
 * formatadores acabariam divergindo, que é exatamente o defeito que estamos
 * consertando.
 *
 * Convenção que o site passa a seguir, e que o glossário explica:
 *   • `%`  = proporção ou variação RELATIVA ("subiu 24% em relação a ontem")
 *   • `pp` = diferença entre duas probabilidades ("subiu 3 pp, de 50% para 53%")
 * Trocar um pelo outro é o erro que a plataforma existe para corrigir.
 */

const PT = "pt-BR";

/** Sinal de menos tipográfico (U+2212). O hífen fica curto demais ao lado de dígito. */
const MENOS = "−";

function fmt(v: number, casas: number, minCasas = casas): string {
  return new Intl.NumberFormat(PT, {
    minimumFractionDigits: minCasas,
    maximumFractionDigits: casas,
  }).format(v);
}

/** Número puro em pt-BR: `1.234,5`. Devolve `—` para o que não é número. */
export function num(v: number | null | undefined, casas = 0): string {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return fmt(Number(v), casas);
}

/**
 * Porcentagem, com o valor JÁ em escala 0–100. `pct(72)` → `72%`.
 * A escala é explícita no nome do parâmetro porque metade dos bugs de número
 * deste site nasceu de alguém multiplicar (ou não) por 100 duas vezes.
 */
export function pct(v0a100: number | null | undefined, casas = 0): string {
  if (v0a100 == null || !Number.isFinite(Number(v0a100))) return "—";
  return `${fmt(Number(v0a100), casas)}%`;
}

/** Porcentagem a partir de probabilidade 0–1. `pctDeProb(0.53)` → `53%`. */
export function pctDeProb(v0a1: number | null | undefined, casas = 0): string {
  if (v0a1 == null || !Number.isFinite(Number(v0a1))) return "—";
  return pct(Number(v0a1) * 100, casas);
}

/**
 * Diferença de probabilidade em pontos percentuais, com sinal: `+2,5 pp`.
 * O valor entra JÁ em pp (53 − 50 = 3), nunca em 0–1 — foi assim que o sino de
 * alertas passou a mostrar `+5000.0pp` para uma variação de 50 pp.
 */
export function pp(vEmPp: number | null | undefined, casas = 1): string {
  if (vEmPp == null || !Number.isFinite(Number(vEmPp))) return "—";
  const n = Number(vEmPp);
  const corpo = fmt(Math.abs(n), casas);
  const sinal = n > 0 ? "+" : n < 0 ? MENOS : "";
  return `${sinal}${corpo} pp`;
}

/**
 * Magnitude por extenso curto: `1,27 bi`, `701 mi`, `898 mil`, `540`.
 * Uma casa decimal só quando ela informa: 1,27 bi informa; 701,0 mi não.
 */
export function magnitude(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  const n = Number(v);
  const abs = Math.abs(n);
  const sinal = n < 0 ? MENOS : "";
  if (abs >= 1_000_000_000) return `${sinal}${fmt(abs / 1_000_000_000, 2, 0)} bi`;
  if (abs >= 1_000_000)     return `${sinal}${fmt(abs / 1_000_000, abs < 10_000_000 ? 1 : 0, 0)} mi`;
  if (abs >= 1_000)         return `${sinal}${fmt(abs / 1_000, abs < 10_000 ? 1 : 0, 0)} mil`;
  return `${sinal}${fmt(abs, 0)}`;
}

/** Dólar com magnitude: `US$ 108,6 mi`. */
export function dolar(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return `US$ ${magnitude(v)}`;
}

/** Real com magnitude: `R$ 554 mi`. Para valor exato use `reaisExatos`. */
export function real(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return `R$ ${magnitude(v)}`;
}

/** Real ao centavo: `R$ 1.234,56`. */
export function reaisExatos(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return new Intl.NumberFormat(PT, { style: "currency", currency: "BRL" }).format(Number(v));
}

/**
 * Plural de verdade, em vez de `1 posição(ões)`.
 * `plural(1, "posição", "posições")` → `1 posição`.
 */
export function plural(n: number, um: string, muitos: string): string {
  return `${num(n)} ${Math.abs(n) === 1 ? um : muitos}`;
}

/**
 * Contagem regressiva curta: `6d 3h`, `3h 20min`, `12min`.
 * Sem o "restantes" no fim — quem chama decide, e assim não se escreve
 * "Encerra em: 6d 3h restantes", que diz a mesma coisa duas vezes.
 */
export function tempoRestante(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "encerrado";
  const min = Math.floor(ms / 60_000);
  const h = Math.floor(min / 60);
  const d = Math.floor(h / 24);
  if (d >= 1) return h % 24 === 0 ? `${d}d` : `${d}d ${h % 24}h`;
  if (h >= 1) return min % 60 === 0 ? `${h}h` : `${h}h ${min % 60}min`;
  return `${Math.max(1, min)}min`;
}

/** "há 16 minutos" — sem falar em cache, snapshot ou fallback (ver TRV-19). */
export function haQuantoTempo(iso: string | number | Date | null | undefined): string {
  if (iso == null) return "—";
  const t = iso instanceof Date ? iso.getTime() : new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const min = Math.floor((Date.now() - t) / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${plural(min, "minuto", "minutos")}`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${plural(h, "hora", "horas")}`;
  const d = Math.floor(h / 24);
  return `há ${plural(d, "dia", "dias")}`;
}
