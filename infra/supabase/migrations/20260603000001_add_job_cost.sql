-- Atomic cost increment for parallel production runs (Gap B1)

CREATE OR REPLACE FUNCTION add_job_cost(run_id uuid, delta int)
RETURNS int
LANGUAGE sql
AS $$
  UPDATE production_runs
  SET cost_cents = cost_cents + delta,
      updated_at = now()
  WHERE id = run_id
  RETURNING cost_cents;
$$;
