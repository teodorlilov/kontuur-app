-- Centralize language rules: add formality_rules, language_instructions, opener_examples to language_rules
-- Add language_notes to brand_profiles for per-client language requirements

-- 1. Add new columns to language_rules
ALTER TABLE language_rules
  ADD COLUMN IF NOT EXISTS formality_rules JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS language_instructions TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS opener_examples JSONB DEFAULT '[]';

-- 2. Add language_notes to brand_profiles
ALTER TABLE brand_profiles
  ADD COLUMN IF NOT EXISTS language_notes TEXT DEFAULT '';
