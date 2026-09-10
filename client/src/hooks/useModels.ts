/**
 * useModels — JLB Analytics
 * Hook para chamar a API de modelos Python via Express proxy.
 * Injeta automaticamente o nível do usuário no header, derivado do sistema de pontos.
 */

import { useState, useCallback } from "react";
import { niveisConcluidos, concluirNivel } from "@/lib/userProgress";

type ModelState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
};

/**
 * Nível de acesso do motor Python, derivado dos níveis CONCLUÍDOS.
 *
 * Era derivado dos pontos, e ponto vinha de visitar página: quem abrisse as
 * cinco aulas somava 50 e destravava o nível 4 sem ter resolvido nada
 * (NVL-01). O gate agora usa a mesma régua que a tela mostra.
 */
function nivelDeAcesso(): number {
  try {
    const feitos = niveisConcluidos().length;
    if (feitos >= 4) return 5;
    if (feitos >= 3) return 4;
    return 3; // mínimo 3 — níveis 1, 2 e 3 são sempre acessíveis
  } catch {
    return 3;
  }
}

/**
 * De qual nível é este exercício? O endpoint carrega o número: `/api/level3/…`.
 *
 * É o único ponto do site por onde TODOS os exercícios das cinco aulas passam —
 * por isso a conclusão é marcada aqui, e não espalhada por cinco páginas com
 * dezenas de botões, onde alguém esqueceria um e o nível nunca fecharia.
 */
function nivelDoEndpoint(endpoint: string): number | null {
  const m = /\/level([1-5])\//.exec(endpoint);
  return m ? Number(m[1]) : null;
}

const NOME_DO_NIVEL: Record<number, string> = {
  1: "Resolveu um exercício do Nível 1 — Fundamentos",
  2: "Resolveu um exercício do Nível 2 — Leitura de Dados",
  3: "Resolveu um exercício do Nível 3 — Modelos Básicos",
  4: "Resolveu um exercício do Nível 4 — Vieses",
  5: "Resolveu um exercício do Nível 5 — Análise Integrada",
};

const OFFLINE_MSG =
  "Serviço de cálculo indisponível no momento. Tente novamente em instantes.";

export function useModels() {
  const userLevel = nivelDeAcesso();

  async function callModel<T>(
    endpoint: string,
    body: unknown,
  ): Promise<{ data: T | null; error: string | null }> {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Level": String(userLevel),
        },
        body: JSON.stringify(body),
      });

      // Guard: some proxies return empty body on 502/503
      const text = await res.text();
      if (!text.trim()) return { data: null, error: OFFLINE_MSG };

      let json: T | { error?: string; detail?: string | { message?: string } };
      try {
        json = JSON.parse(text) as typeof json;
      } catch {
        // Non-JSON (HTML error page from proxy)
        return { data: null, error: OFFLINE_MSG };
      }

      if (!res.ok) {
        const detail = (json as { detail?: string | { message?: string } }).detail;
        const msg =
          typeof detail === "string"
            ? detail
            : typeof detail === "object" && detail?.message
            ? detail.message
            : (json as { error?: string; message?: string }).message
            ?? (json as { error?: string }).error
            ?? "Erro desconhecido";
        return { data: null, error: msg };
      }

      return { data: json as T, error: null };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro de rede";
      if (
        msg.includes("Failed to fetch") ||
        msg.includes("NetworkError") ||
        msg.includes("ECONNREFUSED")
      ) {
        return { data: null, error: OFFLINE_MSG };
      }
      return { data: null, error: msg };
    }
  }

  return { callModel, userLevel };
}

// Hook com estado encapsulado para uso direto em componentes
export function useModelCall<T>(endpoint: string) {
  const { callModel } = useModels();
  const [state, setState] = useState<ModelState<T>>({
    data: null,
    loading: false,
    error: null,
  });

  const run = useCallback(
    async (body: unknown) => {
      setState({ data: null, loading: true, error: null });
      const { data, error } = await callModel<T>(endpoint, body);
      setState({ data, loading: false, error });

      // Exercício resolvido — só quando o cálculo VOLTOU. Erro de rede não é
      // aprendizado, e marcar na tentativa traria de volta o defeito que esta
      // mudança conserta: progresso por clique.
      if (data && !error) {
        const nivel = nivelDoEndpoint(endpoint);
        if (nivel) concluirNivel(nivel, NOME_DO_NIVEL[nivel]);
      }
      return { data, error };
    },
    [endpoint, callModel],
  );

  return { ...state, run };
}
