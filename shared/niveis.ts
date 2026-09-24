/**
 * Os cinco níveis da trilha — o nome de cada um, escrito UMA vez.
 *
 * O QUE ACONTECIA (Auditoria 21/09, TXT-02). O mesmo nível tinha nome
 * diferente em cada superfície, e as três variantes conviviam na mesma sessão:
 *
 *   Nível 4 → "Vieses" na home, na busca (Ctrl+K) e no menu
 *           → "Psicologia" no rodapé
 *           → "Vieses e Psicologia" no dashboard, no /educacao e na navegação
 *             entre níveis
 *   Nível 2 → "Leitura de dados" no menu × "Dados" no rodapé e na busca
 *   Nível 3 → "Modelos básicos" × "Modelos"
 *
 * Quem clica em "Psicologia" no rodapé e chega numa página chamada "Vieses e
 * Psicologia" não sabe se errou o caminho. Numa trilha de aprendizagem, o nome
 * do que você está estudando é parte do conteúdo: ele é a âncora de memória
 * entre uma sessão e a seguinte.
 *
 * ⚠️ Nome novo entra AQUI, nunca na tela. É a mesma razão de `shared/rotas.ts`
 * e de `shared/formato.ts` existirem: a superfície não decide o vocabulário.
 */

export interface Nivel {
  n: 1 | 2 | 3 | 4 | 5;
  /** O nome completo, como o título da página. */
  titulo: string;
  /**
   * A versão curta, para menu e rodapé — onde o espaço é estreito.
   *
   * ⚠️ Curto NÃO quer dizer "outro nome": é o mesmo nome truncado com
   * honestidade ("Vieses e Psicologia" → "Vieses"), nunca um sinônimo. Era
   * assim que "Psicologia" nasceu, e foi isso que quebrou a âncora.
   */
  curto: string;
  href: string;
  /** Uma linha do que se aprende ali. */
  resumo: string;
}

export const NIVEIS: readonly Nivel[] = [
  { n: 1, titulo: "Fundamentos",          curto: "Fundamentos", href: "/nivel/1", resumo: "Valor esperado, margem da casa e Bayes" },
  { n: 2, titulo: "Leitura de Dados",     curto: "Dados",       href: "/nivel/2", resumo: "Z-score, intervalo de confiança e correlação" },
  { n: 3, titulo: "Modelos Básicos",      curto: "Modelos",     href: "/nivel/3", resumo: "Taylor Rule, Poisson, GARCH e ENSO" },
  { n: 4, titulo: "Vieses e Psicologia",  curto: "Vieses",      href: "/nivel/4", resumo: "Prospect Theory, calibração e excesso de confiança" },
  { n: 5, titulo: "Análise Integrada",    curto: "Análise Integrada", href: "/nivel/5", resumo: "Divergência, ensemble e decisão sob incerteza" },
] as const;

/** O nível pelo número. `undefined` fora de 1–5 — não se inventa nível. */
export function nivelPorNumero(n: number): Nivel | undefined {
  return NIVEIS.find((x) => x.n === n);
}

/** "Nível 4 — Vieses e Psicologia". O formato usado em lista e em menu. */
export function rotuloDoNivel(n: number, curto = false): string {
  const nivel = nivelPorNumero(n);
  if (!nivel) return `Nível ${n}`;
  return `Nível ${nivel.n} — ${curto ? nivel.curto : nivel.titulo}`;
}
