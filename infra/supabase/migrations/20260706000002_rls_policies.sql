-- Minimal RLS for Dan review actions (service role bypasses RLS)

ALTER TABLE production_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE brief_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE supervisor_outreach ENABLE ROW LEVEL SECURITY;

-- Authenticated users (Dan) can read pipeline state
CREATE POLICY production_runs_read ON production_runs
  FOR SELECT TO authenticated USING (true);

CREATE POLICY tracks_read ON tracks
  FOR SELECT TO authenticated USING (true);

CREATE POLICY brief_submissions_read ON brief_submissions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY supervisor_outreach_read ON supervisor_outreach
  FOR SELECT TO authenticated USING (true);

-- Authenticated users can approve sync tracks and hero runs
CREATE POLICY tracks_update_review ON tracks
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY production_runs_update_review ON production_runs
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY supervisor_outreach_update ON supervisor_outreach
  FOR UPDATE TO authenticated
  USING (status = 'pending_dan_review')
  WITH CHECK (true);

-- Service role retains full access (default bypass)
