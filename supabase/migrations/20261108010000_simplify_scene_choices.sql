begin;
-- Keep legacy clips as alternatives; retain the most recently chosen clip per scene.
with ranked as (
  select id, row_number() over (partition by scene_id order by updated_at desc, created_at desc, id) as rank
  from public.scene_clips where status in ('selected', 'submitted')
)
update public.scene_clips set status = 'considering', version = version + 1
where id in (select id from ranked where rank > 1);

create unique index if not exists scene_clips_one_choice_per_scene
  on public.scene_clips(scene_id) where status in ('selected', 'submitted');

create or replace function public.set_scene_clip_status(
  target_scene_clip_id uuid,
  next_status public.scene_clip_status,
  expected_version integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_scene_id uuid;
  updated_version integer;
  target_project_id uuid;
  target_organization_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication is required.'
      using errcode = '42501';
  end if;

  select scene_clip.scene_id
  into current_scene_id
  from public.scene_clips as scene_clip
  where scene_clip.id = target_scene_clip_id;

  if current_scene_id is null
    or not private.can_edit_scene(current_scene_id) then
    raise exception 'You do not have permission to update this clip.'
      using errcode = '42501';
  end if;

  -- Serialize choices within a scene before touching clip rows.
  perform 1 from public.scenes where id = current_scene_id and archived_at is null for update;
  if not found then
    raise exception 'This scene is unavailable.' using errcode = '42501';
  end if;
  if next_status not in ('considering', 'selected', 'rejected') then
    raise exception 'Choose or remove a clip.' using errcode = '22023';
  end if;
  perform 1 from public.scene_clips where id = target_scene_clip_id and version = expected_version;
  if not found then
    raise exception 'This clip changed in another session. Refresh and retry.' using errcode = '40001';
  end if;
  if next_status = 'selected' then
    update public.scene_clips set status = 'considering', version = version + 1
    where scene_id = current_scene_id and id <> target_scene_clip_id and status in ('selected', 'submitted');
  end if;

  update public.scene_clips
  set status = next_status,
      version = version + 1
  where id = target_scene_clip_id
    and version = expected_version
  returning version into updated_version;

  if updated_version is null then
    raise exception 'This clip changed in another session. Refresh and retry.'
      using errcode = '40001';
  end if;

  select project.id, project.organization_id
  into target_project_id, target_organization_id
  from public.scenes as scene
  join public.projects as project on project.id = scene.project_id
  where scene.id = current_scene_id;

  insert into public.audit_events (
    actor_user_id,
    organization_id,
    project_id,
    entity_type,
    entity_id,
    event_type,
    payload
  )
  values (
    current_user_id,
    target_organization_id,
    target_project_id,
    'scene_clip',
    target_scene_clip_id,
    'scene_clip.status_changed',
    jsonb_build_object(
      'status',
      next_status,
      'version',
      updated_version
    )
  );

  return updated_version;
end;
$$;

-- Script import is retired from the customer workflow. Keep historical data intact.
revoke execute on function public.import_project_scenes(uuid, jsonb) from authenticated;
commit;
