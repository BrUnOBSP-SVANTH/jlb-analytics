/**
 * MarginOfError — selo honesto de "margem de erro geral" da IA JLB.
 *
 * Empresa de previsão não pode se vender como perfeita. Este selo puxa os
 * números REAIS do track record (/api/ai/track-record) e mostra, de forma
 * compacta e reutilizável, quanto a IA ERRA e que ela ~empata com o mercado
 * (não o supera). Só exibe números com amostra estável (>= 20 resolvidas);
 * abaixo disso assume que ainda é ruído e mostra só a postura ("não acertamos
 * tudo"). Link para a prova completa em /track-record.
 */
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Scale, ArrowRight } from "lucide-react";

interface TrackRecord {
  available?: boolean;
  resolvedCount: number;
  hitRate: number | null;
  marketHitRate: number | null;
  skillVsMarket: number | null;
}

export default function MarginOfError() {
  const [data, setData] = useState<TrackRecord | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/ai/track-record")
      .then((r) => r.json())
      .then((d: TrackRecord) => { if (alive) setData(d); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);

  const enough = !!data && data.available !== false && data.hitRate !== null && data.resolvedCount >= 20;

  // Sem amostra estável (ou indisponível): postura honesta, sem número inventado.
  if (failed || (data && !enough)) {
    return (
      <div className="flex items-center gap-2.5 rounded-xl border border-border/30 bg-secondary/10 px-3.5 py-2.5">
        <Scale className="w-4 h-4 text-muted-foreground/60 shrink-0" />
        <p className="text-xs text-muted-foreground leading-snug">
          Somos uma plataforma de previsão — <strong className="text-foreground">não acertamos tudo</strong>. Assim que
          houver amostra estável, o placar de erros aparece aqui, público.{" "}
          <Link href="/track-record"><span className="text-gold hover:underline cursor-pointer">Ver método</span></Link>
        </p>
      </div>
    );
  }

  if (!enough) return null; // ainda carregando — evita flash

  const hit = data!.hitRate!;          // ex.: 82 (acerto direcional SIM/NÃO)
  const err = 100 - hit;               // ex.: 18
  const skill = data!.skillVsMarket;   // Brier menor = melhor; >0 bate o mercado

  const vsMarket =
    skill === null ? "está lado a lado com o mercado"
    : skill > 0.02 ? "supera levemente o mercado"
    : skill < -0.02 ? "ainda fica atrás do mercado"
    : "praticamente empata com o mercado (não o supera)";

  return (
    <div className="flex items-start gap-3 rounded-xl border border-gold/20 bg-gold/[0.04] px-4 py-3">
      <Scale className="w-4 h-4 text-gold shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-xs sm:text-[13px] text-muted-foreground leading-relaxed">
          <strong className="text-foreground">Não somos perfeitos — e mostramos isso.</strong>{" "}
          Nossa IA acerta a direção <strong className="text-foreground">~{hit}%</strong> das vezes (logo,{" "}
          <strong className="text-negative">erra ~{err}%</strong>) e, na calibração fina, {vsMarket}.
        </p>
        <Link href="/track-record">
          <span className="inline-flex items-center gap-1 text-[11px] text-gold hover:underline mt-1 cursor-pointer">
            Ver track record auditável <ArrowRight className="w-3 h-3" />
          </span>
        </Link>
      </div>
    </div>
  );
}
