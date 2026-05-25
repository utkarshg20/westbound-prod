-- Westbound core schema (studio + sync + youtube)
-- Lane C (trading) uses separate schema — see 20260517000002_trading_schema.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE project_slug AS ENUM ('studio', 'sync_factory', 'youtube_faceless');
CREATE TYPE asset_type AS ENUM ('image', 'video', 'audio', 'lora', 'document', 'other');
CREATE TYPE qa_status AS ENUM ('pending', 'approved', 'rejected', 'flagged');
CREATE TYPE production_stage AS ENUM (
  'draft', 'generating', 'assets_ready', 'dan_review',
  'scheduled', 'published', 'dsp_live', 'failed'
);
CREATE TYPE production_status AS ENUM ('active', 'completed', 'failed');
CREATE TYPE production_kind AS ENUM ('episode', 'song', 'sync_batch', 'youtube_video');
CREATE TYPE track_source AS ENUM ('sync', 'sammy', 'yt');
CREATE TYPE song_drop_trigger AS ENUM ('story', 'random', 'manual');

CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug project_slug NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE characters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  display_name TEXT NOT NULL,
  hero_asset_id UUID,
  lora_version TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  UNIQUE (project_id, slug)
);

CREATE TABLE assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  character_id UUID REFERENCES characters(id) ON DELETE SET NULL,
  parent_id UUID REFERENCES assets(id) ON DELETE SET NULL,
  type asset_type NOT NULL,
  r2_uri TEXT NOT NULL,
  version INT NOT NULL DEFAULT 1,
  tool TEXT,
  prompt_hash TEXT,
  qa_status qa_status NOT NULL DEFAULT 'pending',
  tags TEXT[] NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE characters
  ADD CONSTRAINT characters_hero_asset_fk
  FOREIGN KEY (hero_asset_id) REFERENCES assets(id) ON DELETE SET NULL;

CREATE TABLE production_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind production_kind NOT NULL,
  title TEXT NOT NULL,
  stage production_stage NOT NULL DEFAULT 'draft',
  status production_status NOT NULL DEFAULT 'active',
  cost_cents INT NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE story_beats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  episode_number INT,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  script_excerpt TEXT,
  canon_constraints TEXT[] NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE song_drop_windows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  production_run_id UUID REFERENCES production_runs(id) ON DELETE CASCADE,
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  trigger_type song_drop_trigger NOT NULL DEFAULT 'story',
  released BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,
  external_id TEXT,
  mood TEXT,
  bpm_min INT,
  bpm_max INT,
  genre TEXT,
  deadline TIMESTAMPTZ,
  raw_payload JSONB NOT NULL DEFAULT '{}',
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  production_run_id UUID REFERENCES production_runs(id) ON DELETE SET NULL,
  source track_source NOT NULL,
  title TEXT NOT NULL,
  isrc TEXT,
  asset_id UUID REFERENCES assets(id) ON DELETE SET NULL,
  mood_tags TEXT[] NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  production_run_id UUID NOT NULL REFERENCES production_runs(id) ON DELETE CASCADE,
  track_id UUID REFERENCES tracks(id) ON DELETE SET NULL,
  scheduled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  platforms TEXT[] NOT NULL DEFAULT '{}',
  stage production_stage NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE revenue_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  amount_cents INT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  track_id UUID REFERENCES tracks(id) ON DELETE SET NULL,
  period_month DATE NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE brief_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  signal_id UUID NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  match_score NUMERIC(5, 4),
  submitted_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE job_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type TEXT NOT NULL,
  production_run_id UUID REFERENCES production_runs(id) ON DELETE SET NULL,
  message TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_assets_project ON assets(project_id);
CREATE INDEX idx_assets_tags ON assets USING GIN(tags);
CREATE INDEX idx_production_runs_stage ON production_runs(stage);
CREATE INDEX idx_signals_unprocessed ON signals(created_at) WHERE processed_at IS NULL;
CREATE INDEX idx_tracks_source ON tracks(source);
CREATE INDEX idx_releases_scheduled ON releases(scheduled_at);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER production_runs_updated_at
  BEFORE UPDATE ON production_runs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Seed projects
INSERT INTO projects (slug, name) VALUES
  ('studio', 'Sammy Rane Studio'),
  ('sync_factory', 'Sync Signal Engine'),
  ('youtube_faceless', 'YouTube Faceless Channels');

-- Seed Sammy band characters (hero_asset_id set after ref upload)
INSERT INTO characters (project_id, slug, display_name, metadata)
SELECT p.id, c.slug, c.display_name, c.metadata::jsonb
FROM projects p
CROSS JOIN (VALUES
  ('sammy_rane', 'Sammy Rane', '{"role":"frontman"}'),
  ('drummer', 'Drummer', '{"role":"drums"}'),
  ('bassist', 'Bassist', '{"role":"bass"}'),
  ('lead_guitarist', 'Lead Guitarist', '{"role":"guitar"}')
) AS c(slug, display_name, metadata)
WHERE p.slug = 'studio';
