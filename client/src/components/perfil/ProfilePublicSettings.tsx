/**
 * ProfilePublicSettings — perfil publico + leaderboard (username, bio, visibilidade).
 * Extraido de pages/Perfil.tsx.
 */
import { useState, useEffect } from "react";
import { Link } from "wouter";
import { supabase } from "@/lib/supabase";
import AnimatedSection from "@/components/AnimatedSection";
import { Globe, Save } from "lucide-react";

export function ProfilePublicSettings({ userId }: { userId: string }) {
  const [username, setUsername]         = useState("");
  const [displayName, setDisplayName]   = useState("");
  const [bio, setBio]                   = useState("");
  const [isPublic, setIsPublic]         = useState(false);
  const [saving, setSaving]             = useState(false);
  const [saved, setSaved]               = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [loaded, setLoaded]             = useState(false);

  useEffect(() => {
    void supabase.from("profiles").select("username, display_name, bio, public_profile").eq("id", userId).maybeSingle()
      .then(({ data }) => {
        if (data) {
          setUsername(data.username ?? "");
          setDisplayName(data.display_name ?? "");
          setBio(data.bio ?? "");
          setIsPublic(data.public_profile ?? false);
        }
        setLoaded(true);
      });
  }, [userId]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updates: Record<string, unknown> = {
        display_name: displayName.trim() || null,
        bio: bio.trim() || null,
        public_profile: isPublic,
        updated_at: new Date().toISOString(),
      };
      if (username.trim()) {
        if (!/^[a-z0-9_]{3,20}$/.test(username.trim())) {
          throw new Error("Username deve ter 3-20 caracteres (letras minúsculas, números e _)");
        }
        updates.username = username.trim();
      }
      const { error: err } = await supabase.from("profiles").update(updates).eq("id", userId);
      if (err) throw new Error(err.message.includes("duplicate") ? "Este username já está em uso" : err.message);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) return null;

  return (
    <AnimatedSection>
      <div className="glass-card rounded-2xl p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-neon-blue" />
          <h2 className="font-semibold text-foreground">Perfil Público · Leaderboard</h2>
        </div>

        <p className="text-xs text-muted-foreground">
          Ative o perfil público para aparecer no{" "}
          <Link href="/leaderboard"><span className="text-gold hover:underline cursor-pointer">Leaderboard de Calibração</span></Link>
          {" "}e permitir que outros vejam seu track record. O email nunca é exibido.
        </p>

        {/* Toggle público */}
        <div className="flex items-center justify-between p-4 rounded-xl border border-border/30 bg-secondary/10">
          <div>
            <p className="text-sm font-semibold text-foreground">Perfil público</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isPublic ? "Visível no leaderboard e para outros usuários" : "Privado — apenas você vê"}
            </p>
          </div>
          <button
            onClick={() => setIsPublic((v) => !v)}
            className={`relative w-11 h-6 rounded-full transition-colors ${isPublic ? "bg-positive" : "bg-secondary/60"}`}
          >
            <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${isPublic ? "left-6" : "left-1"}`} />
          </button>
        </div>

        {/* Campos */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider">Username público</label>
            <div className="flex items-center mt-1.5">
              <span className="px-2.5 py-2 bg-secondary/30 border border-r-0 border-border/40 rounded-l-lg text-xs text-muted-foreground">@</span>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
                placeholder="meu_username"
                maxLength={20}
                className="flex-1 px-3 py-2 bg-secondary/30 border border-border/40 rounded-r-lg text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <p className="text-[10px] text-muted-foreground/50 mt-1">3-20 chars, minúsculas, números e _</p>
          </div>
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider">Nome de exibição</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Como quer ser chamado"
              maxLength={40}
              className="w-full mt-1.5 px-3 py-2 bg-secondary/30 border border-border/40 rounded-lg text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        <div>
          <label className="text-xs text-muted-foreground uppercase tracking-wider">Bio (opcional)</label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Breve descrição sobre você e seus interesses em forecasting…"
            maxLength={200}
            rows={2}
            className="w-full mt-1.5 px-3 py-2 bg-secondary/30 border border-border/40 rounded-lg text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary resize-none"
          />
          <p className="text-[10px] text-muted-foreground/50 mt-0.5">{bio.length}/200</p>
        </div>

        {error && <p className="text-xs text-negative">{error}</p>}

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saving ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar configurações
          </button>
          {saved && <p className="text-xs text-positive">✓ Salvo com sucesso!</p>}
          <Link href="/leaderboard" className="ml-auto">
            <span className="text-xs text-gold hover:underline">Ver leaderboard →</span>
          </Link>
        </div>
      </div>
    </AnimatedSection>
  );
}
