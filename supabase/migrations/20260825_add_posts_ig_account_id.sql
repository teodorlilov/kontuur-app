-- Which Instagram account a post was actually published to.
--
-- posts recorded the client but not the target account, so when a client's
-- connection is later switched to a different Instagram account, its published
-- rows are indistinguishable from the new account's history. The analytics
-- union (publish pins + posts table) may only claim posts stamped with the
-- client's CURRENT account id; unstamped rows (published before this column
-- existed, possibly to a previous account) are never pinned.
alter table posts
  add column if not exists ig_account_id text;

comment on column posts.ig_account_id is
  'IG user id the post was published to, stamped at publish success. NULL = published before stamping existed — target account unknowable.';
