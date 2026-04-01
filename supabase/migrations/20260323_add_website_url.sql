-- Add website_url to clients table for URL auto-analysis during onboarding
ALTER TABLE clients ADD COLUMN IF NOT EXISTS website_url text DEFAULT NULL;
