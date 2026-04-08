ALTER TABLE intelligence_briefings
  ADD COLUMN IF NOT EXISTS coaching_points JSONB DEFAULT NULL;
