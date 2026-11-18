begin;
-- Existing lab presets are intentionally not certified by this migration.
alter table public.stage_profiles
 add column certified_at timestamptz,
 add column certification_reference text,
 add column checkout_spec jsonb;
alter table public.stage_profiles add constraint certified_stage_evidence check (
 certified_at is null or (nullif(trim(certification_reference),'') is not null and checkout_spec is not null and jsonb_typeof(checkout_spec)='object')
);
comment on column public.stage_profiles.certification_reference is 'Staff-recorded evidence/source of confirmed delivery specifications. Not a simulation preset.';
notify pgrst,'reload schema';
commit;
