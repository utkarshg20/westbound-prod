/**
 * Regenerate after migrations:
 * pnpm db:gen-types
 * supabase gen types typescript --workdir infra/supabase > packages/platform/src/database.types.ts
 */
export type Database = {
  public: {
    Tables: Record<string, { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown> }>;
    Views: Record<string, never>;
    Functions: {
      add_job_cost: { Args: { run_id: string; delta: number }; Returns: number };
    };
  };
};
