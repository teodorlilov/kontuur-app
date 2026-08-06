-- agencies.timezone always has a value.
--
-- Neither agency-insert path sets it (src/app/api/auth/signup/route.ts and
-- src/lib/auth/create-user-record.ts both insert `{ name, mode }`), and the column
-- had no default — so every agency began life null. Five read sites carried a
-- `?? 'UTC'` fallback to cover that, which is the same fact restated five times.
--
-- A default plus NOT NULL fixes it where it starts: new agencies get 'UTC' from
-- the column, and the fallbacks become dead code to delete once src/types/database.ts
-- is regenerated and `timezone` narrows to `string`.
--
-- 'UTC' is the right default rather than a guess at the signup's locale: it is what
-- all five call sites already fell back to, so this changes no existing behaviour.

update agencies set timezone = 'UTC' where timezone is null;

alter table agencies alter column timezone set default 'UTC';
alter table agencies alter column timezone set not null;
