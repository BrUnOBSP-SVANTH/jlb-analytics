/**
 * usePositions — cloud-synced portfolio positions
 *
 * Strategy:
 *  - Authenticated user → reads/writes from Supabase
 *  - Guest (not logged in) → falls back to localStorage (same as before)
 *
 * This means the app works even without an account, and positions
 * automatically migrate to the cloud when the user signs in.
 */

import { useState, useEffect, useCallback } from "react";
import { supabase, type DbPosition, type PositionInsert } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

// ─── Local shape (same as Dashboard uses) ─────────────────────────────────

export interface Position {
  id: string;
  name: string;
  type: string;
  invested: number;
  current: number;
}

const LOCAL_KEY = "jlb-dashboard-positions";

const DEFAULT_POSITIONS: Position[] = [
  { id: "1", name: "Tesouro Selic 2029", type: "Renda Fixa", invested: 15000, current: 16200 },
  { id: "2", name: "CDB 104% CDI", type: "Renda Fixa", invested: 10000, current: 10850 },
  { id: "3", name: "PETR4", type: "Ações", invested: 8000, current: 9500 },
  { id: "4", name: "ITUB4", type: "Ações", invested: 5000, current: 5400 },
  { id: "5", name: "VOO (ETF)", type: "ETFs", invested: 12000, current: 14800 },
  { id: "6", name: "CSPX (UCITS)", type: "Internacional", invested: 10000, current: 12300 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────

function fromDb(row: DbPosition): Position {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    invested: Number(row.invested),
    current: Number(row.current),
  };
}

function loadLocal(): Position[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (raw) return JSON.parse(raw) as Position[];
  } catch { /* ignore */ }
  return DEFAULT_POSITIONS;
}

function saveLocal(positions: Position[]): void {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(positions));
  } catch { /* ignore */ }
}

// ─── Hook ─────────────────────────────────────────────────────────────────

export function usePositions() {
  const { user } = useAuth();
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Load positions ──────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    if (!user) {
      // Guest: load from localStorage
      setPositions(loadLocal());
      setLoading(false);
      return;
    }

    // Authenticated: load from Supabase
    const { data, error: dbError } = await supabase
      .from("positions")
      .select("*")
      .order("created_at", { ascending: true });

    if (dbError) {
      setError(dbError.message);
      // Fallback to local on error
      setPositions(loadLocal());
    } else {
      setPositions((data as DbPosition[]).map(fromDb));
    }

    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  // ── Persist local copy whenever positions change (guest mode) ───────────
  useEffect(() => {
    if (!user && !loading) saveLocal(positions);
  }, [positions, user, loading]);

  // ── Add ─────────────────────────────────────────────────────────────────
  const addPosition = useCallback(
    async (pos: Omit<Position, "id">) => {
      if (!user) {
        const newPos: Position = { ...pos, id: Date.now().toString() };
        setPositions((prev) => [...prev, newPos]);
        return;
      }

      setSyncing(true);
      const insert: PositionInsert = {
        name: pos.name,
        type: pos.type,
        invested: pos.invested,
        current: pos.current,
      };

      const { data, error: dbError } = await supabase
        .from("positions")
        .insert(insert)
        .select()
        .single();

      setSyncing(false);

      if (dbError) {
        setError(dbError.message);
        return;
      }

      setPositions((prev) => [...prev, fromDb(data as DbPosition)]);
    },
    [user]
  );

  // ── Update current value ─────────────────────────────────────────────────
  const updatePosition = useCallback(
    async (id: string, updates: Partial<Omit<Position, "id">>) => {
      setPositions((prev) =>
        prev.map((p) => (p.id === id ? { ...p, ...updates } : p))
      );

      if (!user) return;

      setSyncing(true);
      const { error: dbError } = await supabase
        .from("positions")
        .update(updates)
        .eq("id", id);

      setSyncing(false);
      if (dbError) setError(dbError.message);
    },
    [user]
  );

  // ── Remove ───────────────────────────────────────────────────────────────
  const removePosition = useCallback(
    async (id: string) => {
      setPositions((prev) => prev.filter((p) => p.id !== id));

      if (!user) return;

      setSyncing(true);
      const { error: dbError } = await supabase
        .from("positions")
        .delete()
        .eq("id", id);

      setSyncing(false);
      if (dbError) setError(dbError.message);
    },
    [user]
  );

  // ── Migrate local → cloud when user first signs in ──────────────────────
  const migrateLocalToCloud = useCallback(async () => {
    if (!user) return;

    const local = loadLocal();
    if (local.length === 0 || local === DEFAULT_POSITIONS) return;

    const { count } = await supabase
      .from("positions")
      .select("*", { count: "exact", head: true });

    // Only migrate if cloud is empty (avoid duplicating)
    if (count && count > 0) return;

    setSyncing(true);
    const inserts: PositionInsert[] = local.map((p) => ({
      name: p.name,
      type: p.type,
      invested: p.invested,
      current: p.current,
    }));

    await supabase.from("positions").insert(inserts);
    setSyncing(false);
    await load();
  }, [user, load]);

  useEffect(() => {
    if (user) void migrateLocalToCloud();
  }, [user, migrateLocalToCloud]);

  return {
    positions,
    loading,
    syncing,
    error,
    addPosition,
    updatePosition,
    removePosition,
    refetch: load,
  };
}
