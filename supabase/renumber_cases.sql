-- Renumber defect_knowledgebase ids so they start at 1 again (keeps the original order),
-- then reset the id counter so the next confirmed case continues from the highest id.
-- Needed after rows were deleted / the table was re-seeded, since Postgres never reuses ids.
-- Run in the Supabase SQL Editor.

begin;

-- Move everything to negative ids first so the renumbering can't collide with existing ids
update defect_knowledgebase set id = -id;

with r as (
  select id, row_number() over (order by id desc) as rn  -- id desc on negatives = original ascending order
  from defect_knowledgebase
)
update defect_knowledgebase t set id = r.rn from r where t.id = r.id;

select setval(pg_get_serial_sequence('defect_knowledgebase', 'id'),
              (select coalesce(max(id), 1) from defect_knowledgebase));

commit;
