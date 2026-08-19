-- Kontuur is Instagram-only: the Facebook OAuth flow, the Facebook metrics fetcher and
-- every Facebook UI surface were deleted from the app in the same change that adds this
-- migration, so stored Facebook rows are unreachable — no code can read, refresh, or
-- display them, and refreshExpiringTokens no longer nulls their bogus expiries. Holding
-- live Page tokens the product will never use again is pure liability, so the rows go.
--
-- `platform` deliberately stays free-text (no CHECK constraint, no enum): Canva
-- connections share social_connections.platform, and the app writes only 'instagram'
-- going forward — the connect route rejects anything else at the boundary.

delete from analytics_reports where platform = 'facebook';
delete from social_connections where platform = 'facebook';
