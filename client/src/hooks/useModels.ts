/**
 * useModelCall — a conta das calculadoras da trilha, no APARELHO de quem usa.
 *
 * 🔴 O QUE MUDOU (Auditoria 21/09, DES-03). Este hook fazia um POST para
 * `/api/levelN/*` a cada clique em "Calcular". As dezoito rotas eram matemática
 * pura — nada de rede, banco ou IA — então o custo era só a ida e volta: cerca
 * de 300ms na produção, e mais de dez segundos quando o plano grátis do Render
 * tinha deixado o serviço dormir. Esperar dez segundos por uma multiplicação faz
 * a pessoa concluir que o site está quebrado, e ela estaria certa.
 *
 * Agora a conta vem de `shared/modelosEducacionais.ts` e roda no navegador, na
 * hora, inclusive sem internet. As rotas continuam existindo sobre as MESMAS
 * funções (ver server/routes/levels.ts) — uma implementação só, para a tela e a
 * API nunca divergirem.
 *
 * ⚠️ A ASSINATURA NÃO MUDOU de propósito: `useModelCall<T>("/api/level1/ev")`,
 * com `{ data, loading, error, run }`. São 22 pontos de chamada nas cinco
 * páginas de nível, e trocar todos eles seria 22 chances de errar um. O endereço
 * continua sendo o identificador do modelo — e continua legível.
 *
 * TAMBÉM SAIU DAQUI um gate que não existia. O hook calculava um "nível de
 * acesso" a partir dos níveis concluídos e o enviava no cabeçalho
 * `X-User-Level`. O servidor nunca leu esse cabeçalho: ele só aparecia na lista
 * de CORS. Era resto do tempo em que o motor era Python.
 */

import { useState, useCallback } from "react";
import * as modelos from "@shared/modelosEducacionais";
import type { Resultado } from "@shared/modelosEducacionais";

type ModelState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
};

/** Qual função responde por cada endereço. É o mapa que as rotas também usam. */
const MODELO_POR_ROTA: Record<string, (corpo: unknown) => Resultado> = {
  "/api/level1/ev": modelos.ev1,
  "/api/level1/house-edge": modelos.houseEdge1,
  "/api/level1/bayes": modelos.bayes1,
  "/api/level2/zscore": modelos.zscore2,
  "/api/level2/confidence-interval": modelos.confidenceInterval2,
  "/api/level2/correlation": modelos.correlation2,
  "/api/level3/taylor-rule": modelos.taylorRule3,
  "/api/level3/poisson": modelos.poisson3,
  "/api/level3/elo": modelos.elo3,
  "/api/level3/garch": modelos.garch3,
  "/api/level3/enso": modelos.enso3,
  "/api/level3/polling": modelos.polling3,
  "/api/level4/prospect": modelos.prospect4,
  "/api/level4/brier": modelos.brier4,
  "/api/level4/gambler": modelos.gambler4,
  "/api/level4/maturity": modelos.maturity4,
  "/api/level5/divergence": modelos.divergence5,
  "/api/level5/ensemble": modelos.ensemble5,
};

const OFFLINE_MSG =
  "Serviço de cálculo indisponível no momento. Tente novamente em instantes.";

/**
 * Reserva para endereço que não esteja no mapa. Não deve acontecer — e se
 * acontecer, é melhor a tela funcionar pela rede do que não funcionar.
 */
async function pelaRede<T>(endpoint: string, body: unknown): Promise<{ data: T | null; error: string | null }> {
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const texto = await res.text();
    if (!texto.trim()) return { data: null, error: OFFLINE_MSG };
    const json = JSON.parse(texto) as T & { error?: string };
    if (!res.ok) return { data: null, error: json.error ?? "Erro desconhecido" };
    return { data: json as T, error: null };
  } catch {
    return { data: null, error: OFFLINE_MSG };
  }
}

export function useModelCall<T>(endpoint: string) {
  const [state, setState] = useState<ModelState<T>>({
    data: null,
    loading: false,
    error: null,
  });

  const run = useCallback(
    async (body: unknown) => {
      const modelo = MODELO_POR_ROTA[endpoint];
      if (!modelo) {
        setState({ data: null, loading: true, error: null });
        const r = await pelaRede<T>(endpoint, body);
        setState({ data: r.data, loading: false, error: r.error });
        return r;
      }

      // Síncrono: não há "carregando" para mostrar, e piscar um rótulo de espera
      // por um cálculo instantâneo seria fingir trabalho.
      const r = modelo(body);
      if (r.ok) {
        const data = r.payload as T;
        setState({ data, loading: false, error: null });
        return { data, error: null };
      }
      const erro = typeof r.payload.error === "string" ? r.payload.error : "Entrada inválida";
      setState({ data: null, loading: false, error: erro });
      return { data: null, error: erro };
    },
    [endpoint],
  );

  return { ...state, run };
}
