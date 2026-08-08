/**
 * ProgressSync — sincroniza o progresso/gamificação com a nuvem (global, sem UI).
 * Puxa no login (e avisa o badge via evento "jlb:points" com earned:0 = sem
 * toast) e empurra, com debounce, quando o usuário ganha pontos DE VERDADE.
 * Montado uma vez no App.
 */
import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { pullProgress, pushProgress } from "@/lib/progressSync";

export default function ProgressSync() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    const userId = user.id;
    let cancelled = false;

    // Pull no login → refresca o badge (earned:0 não dispara toast) se mudou algo.
    void pullProgress(userId).then((ok) => {
      if (ok && !cancelled) {
        window.dispatchEvent(new CustomEvent("jlb:points", { detail: { earned: 0, label: "" } }));
      }
    });

    // Push (debounced) só em ganho REAL de pontos — ignora o refresh do próprio pull.
    let timer: ReturnType<typeof setTimeout> | undefined;
    function onPoints(e: Event) {
      const earned = (e as CustomEvent<{ earned: number }>).detail?.earned ?? 0;
      if (earned <= 0) return;
      clearTimeout(timer);
      timer = setTimeout(() => { void pushProgress(userId); }, 1500);
    }
    window.addEventListener("jlb:points", onPoints);

    return () => {
      cancelled = true;
      window.removeEventListener("jlb:points", onPoints);
      clearTimeout(timer);
    };
  }, [user]);

  return null;
}
