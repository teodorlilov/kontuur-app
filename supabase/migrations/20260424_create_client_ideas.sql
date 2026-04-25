-- Idea form tokens: one permanent link per client
CREATE TABLE idea_form_tokens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id    UUID NOT NULL REFERENCES agencies(id),
  client_id    UUID NOT NULL REFERENCES clients(id),
  token        TEXT NOT NULL UNIQUE,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_idea_form_tokens_client ON idea_form_tokens (client_id);
CREATE INDEX idx_idea_form_tokens_token ON idea_form_tokens (token);

-- Client ideas: submitted by clients via public form
CREATE TABLE client_ideas (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id         UUID NOT NULL REFERENCES agencies(id),
  client_id         UUID NOT NULL REFERENCES clients(id),
  token_id          UUID NOT NULL REFERENCES idea_form_tokens(id),
  idea_text         TEXT NOT NULL,
  extra_notes       TEXT,
  platform          TEXT,
  target_date       TEXT,
  status            TEXT NOT NULL DEFAULT 'new',
  generated_post_id UUID REFERENCES posts(id),
  submitted_at      TIMESTAMPTZ DEFAULT now(),
  read_at           TIMESTAMPTZ
);

CREATE INDEX idx_client_ideas_agency ON client_ideas (agency_id, submitted_at DESC);
CREATE INDEX idx_client_ideas_client ON client_ideas (client_id);
CREATE INDEX idx_client_ideas_status ON client_ideas (agency_id, status);

-- RLS
ALTER TABLE idea_form_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_ideas ENABLE ROW LEVEL SECURITY;

-- idea_form_tokens: service-role only (admin client handles all access)
-- client_ideas: service-role only (admin client for public inserts, server client for dashboard reads)
