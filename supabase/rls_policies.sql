-- DispenseIQ — Row Level Security for the defect knowledge base
-- Run this in the Supabase dashboard: SQL Editor → New query → paste → Run.
-- Safe to re-run (idempotent).
--
-- Effect: the public/publishable (anon) key can READ the knowledge base but can no
-- longer INSERT, UPDATE, or DELETE. Seeding is done from seedDatabase.js using the
-- service_role key, which bypasses RLS.

-- 1. Turn on Row Level Security. With RLS enabled and no write policy, all
--    INSERT/UPDATE/DELETE from the anon key are denied by default.
alter table public.defect_knowledgebase enable row level security;

-- 2. Allow read-only access for the app (both anonymous and logged-in callers).
drop policy if exists "Public read access" on public.defect_knowledgebase;

create policy "Public read access"
  on public.defect_knowledgebase
  for select
  to anon, authenticated
  using (true);
