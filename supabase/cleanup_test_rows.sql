-- One-off cleanup before the finals (2026-10-01):
--   • #18–#29 are an accidental second run of the seed script (exact copies of #1–#12)
--   • #13–#17 and #30 are test confirmations saved while trying the learning loop
-- The source checks make sure nothing other than those rows can be removed.
-- Run in the Supabase SQL Editor.

begin;

delete from defect_knowledgebase where id between 18 and 29 and source = 'seed';
delete from defect_knowledgebase where id in (13, 14, 15, 16, 17, 30) and source = 'confirmed';

-- Remaining rows are #1–#12, so the next confirmed case should be #13
select setval(pg_get_serial_sequence('defect_knowledgebase', 'id'),
              (select coalesce(max(id), 1) from defect_knowledgebase));

commit;

-- Check: expect 12 rows, 12 different defect types, all source = 'seed'
select count(*) as rows, count(distinct defect_type) as defect_types,
       count(*) filter (where source = 'seed') as seed_rows
from defect_knowledgebase;
