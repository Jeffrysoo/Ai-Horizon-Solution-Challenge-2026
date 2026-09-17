-- DispenseIQ — Learning loop: columns for engineer-confirmed cases.
-- Run this in the Supabase dashboard: SQL Editor → New query → paste → Run.
-- Safe to re-run (idempotent).
--
-- Effect: rows gain a timestamp, a source ('seed' for the sample dataset,
-- 'confirmed' for cases saved from the Report screen), the material dispensed,
-- and the DispenseIQ report id they came from. Writes still go through the
-- server using the service_role key; RLS keeps the public key read-only.

alter table public.defect_knowledgebase
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists source     text        not null default 'seed',
  add column if not exists material   text,
  add column if not exists case_ref   text;

-- The match_defects RPC and the read-only policy in rls_policies.sql need no changes.
