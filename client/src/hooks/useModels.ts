/**
 * useModels — JLB Analytics
 * Hook para chamar a API de modelos Python via Express proxy.
 * Injeta automaticamente o nível do usuário no header, derivado do sistema de pontos.
 */

import { useState, useCallback } from "react";

type ModelState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
};

// Acesso aos modelos Python é ABERTO por decisão de produto: os Níveis 4 e 5
// deixaram de ser travados por pontos (o sistema de pontos segue só para
// gamificação/progresso no Dashboard). Por isso o cliente sempre solicita o
// nível pleno — satisfaz o require_level(1..5) do backend E faz o filter_by_level
// devolver o conteúdo completo (behavioral_note/model_confidence) que a UI dos
// níveis 4/5 já espera renderizar. Antes o header derivava dos pontos e devolvia
// 3 para novos usuários → HTTP 403 nas calculadoras de L4/L5 (conteúdo mais valioso).
const FULL_ACCESS_LEVEL = 5;

const OFFLINE_MSG =
  "Serviço de modelos Python offline. Reinicie com: pnpm dev:all";

export function useModels() {
  const userLevel = FULL_ACCESS_LEVEL;

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
      return { data, error };
    },
    [endpoint, callModel],
  );

  return { ...state, run };
}
