/**
 * EmailPreferences — notificacoes por email + previa do resumo semanal.
 * Extraido de pages/Perfil.tsx. Some inteiro quando o servidor nao tem email (Resend).
 */
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import AnimatedSection from "@/components/AnimatedSection";
import { Zap } from "lucide-react";

interface DigestPreview {
  trackRecord: { resolvedCount: number; beatMarketPct: number | null } | null;
  topDivergences: Array<{ title: string; currentProb: number; aiFairValue: number; edge: number }>;
  closingSoon: Array<{ title: string; daysLeft: number }>;
}

function Toggle({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${on ? "bg-positive" : "bg-secondary/60"}`}
    >
      <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${on ? "left-6" : "left-1"}`} />
    </button>
  );
}

export function EmailPreferences({ userId }: { userId: string }) {
  const [weekly, setWeekly] = useState(false);
  const [resolution, setResolution] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [preview, setPreview] = useState<DigestPreview | null>(null);
  const [emailEnabled, setEmailEnabled] = useState<boolean | null>(null);

  // Sem RESEND configurado no servidor, os toggles prometeriam emails que
  // nunca chegam — o card inteiro se esconde até a infra existir.
  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.ok ? r.json() as Promise<{ emailEnabled: boolean }> : null)
      .then((c) => setEmailEnabled(c?.emailEnabled ?? false))
      .catch(() => setEmailEnabled(false));
  }, []);

  useEffect(() => {
    void supabase.from("profiles").select("email_weekly_digest, email_resolution_alert").eq("id", userId).maybeSingle()
      .then(({ data }) => {
        if (data) { setWeekly(data.email_weekly_digest ?? false); setResolution(data.email_resolution_alert ?? false); }
        setLoaded(true);
      });
    fetch("/api/ai/weekly-digest")
      .then((r) => r.ok ? r.json() as Promise<DigestPreview> : null)
      .then((d) => { if (d) setPreview(d); })
      .catch(() => {});
  }, [userId]);

  async function handleSave() {
    setSaving(true); setSaved(false);
    try {
      await supabase.from("profiles").update({
        email_weekly_digest: weekly,
        email_resolution_alert: resolution,
        updated_at: new Date().toISOString(),
      }).eq("id", userId);
      setSaved(true);
    } catch { /* silent */ } finally { setSaving(false); }
  }

  if (!loaded || !emailEnabled) return null;

  return (
    <AnimatedSection>
      <div className="glass-card rounded-2xl p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-gold" />
          <h2 className="font-semibold text-[var(--titulo)]">Notificações por email</h2>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border/30 bg-secondary/10">
            <div>
              <p className="text-sm font-medium text-foreground">Resumo semanal</p>
              <p className="text-xs text-muted-foreground mt-0.5">Track record da IA, onde a JLB discorda do mercado e mercados encerrando.</p>
            </div>
            <Toggle on={weekly} label="Resumo semanal por email" onClick={() => setWeekly((v) => !v)} />
          </div>
          <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border/30 bg-secondary/10">
            <div>
              <p className="text-sm font-medium text-foreground">Alertas de resolução</p>
              <p className="text-xs text-muted-foreground mt-0.5">Aviso quando uma previsão sua estiver pronta para resolver.</p>
            </div>
            <Toggle on={resolution} label="Alertas de resolução por email" onClick={() => setResolution((v) => !v)} />
          </div>
        </div>

        {/* Preview do que será enviado — valor imediato, mesmo sem email configurado */}
        {preview && (preview.topDivergences.length > 0 || (preview.trackRecord?.resolvedCount ?? 0) > 0) && (
          <div className="p-4 rounded-xl border border-gold/15 bg-gold/3 space-y-2">
            <p className="text-[10px] font-semibold text-gold uppercase tracking-wider">Prévia do resumo desta semana</p>
            {preview.trackRecord && preview.trackRecord.resolvedCount >= 5 && (
              <p className="text-xs text-muted-foreground">📊 A IA bateu o mercado em <span className="text-positive font-semibold">{preview.trackRecord.beatMarketPct}%</span> das {preview.trackRecord.resolvedCount} previsões resolvidas.</p>
            )}
            {preview.topDivergences.slice(0, 3).map((d, i) => (
              <p key={i} className="text-xs text-muted-foreground truncate">
                🎯 {d.title.slice(0, 50)} — <span className={d.edge > 0 ? "text-positive" : "text-negative"}>{d.edge > 0 ? "+" : ""}{d.edge}pp</span>
              </p>
            ))}
            {preview.topDivergences.length === 0 && (
              <p className="text-xs text-muted-foreground/60">As divergências aparecem aqui conforme a IA analisa mercados.</p>
            )}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
            {saving ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Zap className="w-4 h-4" />}
            Salvar preferências
          </button>
          {saved && <p className="text-xs text-positive">✓ Salvo!</p>}
        </div>
        <p className="text-[10px] text-muted-foreground/50">
          O envio de emails requer um provedor configurado (Resend). Até lá, a prévia acima mostra o conteúdo no app.
        </p>
      </div>
    </AnimatedSection>
  );
}
