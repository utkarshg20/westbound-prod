-- Run after migrations: supabase db reset or psql -f seed.sql
-- Episode 1 story beat (update script when Dan delivers final brief)

INSERT INTO story_beats (project_id, episode_number, title, summary, script_excerpt, canon_constraints)
SELECT
  p.id,
  1,
  'Episode 1 — The Noise',
  'Sammy alone in a bar. Indiana behind him, LA ahead. First public beat.',
  E'INT. BAR — NIGHT\nRain on the window. Neon at the edges.\n\nSAMMY\nI left Indiana. I didn''t leave the noise.',
  ARRAY['Sammy is sober', 'Four band members: Sammy Rane and Westbound', 'Modern post-grunge sonic lane']
FROM projects p
WHERE p.slug = 'studio'
ON CONFLICT DO NOTHING;

-- Sammy persona metadata on character
UPDATE characters c
SET metadata = c.metadata || '{"suno_persona_id": "sammy_persona_v1", "genre_lane": "post_grunge"}'::jsonb
FROM projects p
WHERE c.project_id = p.id AND p.slug = 'studio' AND c.slug = 'sammy_rane';

-- Sample song drop window for Episode 1 (story-triggered)
INSERT INTO song_drop_windows (production_run_id, window_start, window_end, trigger_type, released)
SELECT NULL, now() + interval '3 days', now() + interval '10 days', 'story', false
WHERE NOT EXISTS (SELECT 1 FROM song_drop_windows LIMIT 1);
