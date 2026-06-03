-- Channels, supervisors, compliance, canon overrides, DLQ, signal dedup

CREATE UNIQUE INDEX IF NOT EXISTS signals_source_external_id
  ON signals (source, external_id)
  WHERE external_id IS NOT NULL;

CREATE TABLE story_beat_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  effective_from_episode INT NOT NULL,
  constraint_replaced TEXT NOT NULL,
  new_constraint TEXT NOT NULL,
  approved_by TEXT NOT NULL,
  approved_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE dead_letter_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type TEXT NOT NULL,
  production_run_id UUID REFERENCES production_runs(id) ON DELETE SET NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  error_message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TYPE channel_kind AS ENUM ('music', 'voice');
CREATE TYPE publish_cadence AS ENUM ('daily', '5_per_week', '4_per_week');

CREATE TABLE channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  kind channel_kind NOT NULL DEFAULT 'music',
  niche TEXT,
  elevenlabs_voice_id TEXT UNIQUE,
  music_palette_tag TEXT,
  visual_palette_id TEXT,
  script_template_version TEXT,
  topic_keywords TEXT[] NOT NULL DEFAULT '{}',
  kill_criteria_json JSONB NOT NULL DEFAULT '{}',
  monetization_threshold_status TEXT,
  publish_cadence publish_cadence NOT NULL DEFAULT '5_per_week',
  trailer_uploaded_at TIMESTAMPTZ,
  demonetization_risk_flag BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE supervisors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  contact_email TEXT,
  last_known_company TEXT,
  placement_history JSONB NOT NULL DEFAULT '[]',
  taste_cluster TEXT,
  last_emailed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE supervisor_outreach (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supervisor_id UUID NOT NULL REFERENCES supervisors(id) ON DELETE CASCADE,
  track_ids UUID[] NOT NULL DEFAULT '{}',
  email_draft TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_dan_review',
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE youtube_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  production_run_id UUID REFERENCES production_runs(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  citations_json JSONB,
  youtube_video_id TEXT,
  published_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE title_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID NOT NULL REFERENCES youtube_videos(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  prompt_version TEXT,
  deployed_at TIMESTAMPTZ,
  retired_at TIMESTAMPTZ,
  ctr_observed REAL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE thumbnail_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID NOT NULL REFERENCES youtube_videos(id) ON DELETE CASCADE,
  r2_uri TEXT NOT NULL,
  prompt_version TEXT,
  deployed_at TIMESTAMPTZ,
  retired_at TIMESTAMPTZ,
  ctr_observed REAL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE tracks ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE releases ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE story_beats ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'en';

ALTER TABLE production_runs
  ADD COLUMN IF NOT EXISTS prompt_version TEXT,
  ADD COLUMN IF NOT EXISTS model_version TEXT;

-- Seed default YouTube channels
INSERT INTO channels (project_id, slug, name, kind, niche, demonetization_risk_flag, publish_cadence, elevenlabs_voice_id)
SELECT p.id, 'lofi_compounder', 'Lofi Compounder', 'music', 'lofi', true, '5_per_week', 'voice_lofi_' || substr(md5(random()::text), 1, 8)
FROM projects p WHERE p.slug = 'youtube_faceless'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO channels (project_id, slug, name, kind, niche, demonetization_risk_flag, publish_cadence, elevenlabs_voice_id)
SELECT p.id, 'ambient_sleep', 'Ambient Sleep', 'music', 'ambient', true, '5_per_week', 'voice_amb_' || substr(md5(random()::text), 1, 8)
FROM projects p WHERE p.slug = 'youtube_faceless'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO channels (project_id, slug, name, kind, niche, demonetization_risk_flag, publish_cadence, elevenlabs_voice_id)
SELECT p.id, 'rain_rock', 'Rain Rock', 'music', 'rain_rock', true, '5_per_week', 'voice_rr_' || substr(md5(random()::text), 1, 8)
FROM projects p WHERE p.slug = 'youtube_faceless'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO channels (project_id, slug, name, kind, niche, demonetization_risk_flag, publish_cadence, elevenlabs_voice_id)
SELECT p.id, 'slow_money', 'Slow Money', 'voice', 'personal_finance', false, '5_per_week', 'voice_sm_' || substr(md5(random()::text), 1, 8)
FROM projects p WHERE p.slug = 'youtube_faceless'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO channels (project_id, slug, name, kind, niche, demonetization_risk_flag, publish_cadence, elevenlabs_voice_id)
SELECT p.id, 'stoic_hour', 'Stoic Hour', 'voice', 'philosophy', false, '5_per_week', 'voice_stoic_' || substr(md5(random()::text), 1, 8)
FROM projects p WHERE p.slug = 'youtube_faceless'
ON CONFLICT (slug) DO NOTHING;
