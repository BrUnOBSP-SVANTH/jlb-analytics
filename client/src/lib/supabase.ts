/**
 * Supabase client — JLB Analytics
 *
 * Setup:
 *  1. Create a free project at https://supabase.com
 *  2. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env
 *  3. Run the SQL migration in supabase/migrations/001_positions.sql
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "[JLB] Supabase env vars not set. Auth and cloud sync will be unavailable. " +
    "Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file."
  );
}

export const supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "placeholder"
);

// ─── Database types ────────────────────────────────────────────────────────

export interface DbPosition {
  id: string;
  user_id: string;
  name: string;
  type: string;
  invested: number;
  current: number;
  created_at: string;
  updated_at: string;
}

export type PositionInsert = Omit<DbPosition, "id" | "user_id" | "created_at" | "updated_at">;
export type PositionUpdate = Partial<Pick<DbPosition, "name" | "type" | "invested" | "current">>;

export interface CerebroArticle {
  id: string;
  slug: string;
  title: string;
  source: string;
  category: string;
  url: string | null;
  summary: string | null;
  tags: string[];
  published_at: string | null;
  ingested_at: string;
  status: string;
}

export interface CerebroAnalysis {
  id: string;
  slug: string;
  title: string;
  wiki_type: "source" | "synthesis" | "concept" | "entity" | "question";
  domains: string[];
  tags: string[];
  content: string;
  sources_used: string[];
  status: string;
  wiki_date: string | null;
  synced_at: string;
}
