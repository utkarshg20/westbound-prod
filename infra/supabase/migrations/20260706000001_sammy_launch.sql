-- Sammy launch metadata + disclosure fields (playbook engineering hooks)

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS launch_disclosure_version TEXT;

UPDATE projects
SET launch_disclosure_version = 'v1.0'
WHERE slug = 'studio' AND launch_disclosure_version IS NULL;

COMMENT ON COLUMN projects.launch_disclosure_version IS
  'Sammy public launch disclosure version (playbook)';

-- Formalize disclosure on releases
ALTER TABLE releases
  ADD COLUMN IF NOT EXISTS ddex_ai_disclosure TEXT;

COMMENT ON COLUMN releases.ddex_ai_disclosure IS
  'DDEX AI disclosure string for DistroKid / DSP';

-- Face calibration assets tagged in metadata
CREATE INDEX IF NOT EXISTS assets_tags_gin ON assets USING GIN (tags);

-- Supervisor outreach review index
CREATE INDEX IF NOT EXISTS supervisor_outreach_status_idx
  ON supervisor_outreach (status, created_at DESC);
