-- The generation pipeline has always produced a topic summary but only
-- post_history kept it. Storing it on the post gives the review queue and
-- calendar real titles instead of first-slide/caption fallbacks.
alter table posts add column if not exists topic_summary text;

notify pgrst, 'reload schema';
