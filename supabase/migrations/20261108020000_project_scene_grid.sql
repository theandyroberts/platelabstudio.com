begin;
-- Projects may start empty; the scene grid owns scene creation and ordering.
create or replace function public.start_project(
  organization_name text,
  project_name text,
  first_scene_name text,
  search_brief text default null,
  display_name text default null,
  actual_title text default null,
  client_name text default null
)
returns table (project_id uuid, scene_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  workspace_id uuid;
  created_project_id uuid;
  created_scene_id uuid;
  normalized_organization_name text := nullif(trim(organization_name), '');
  normalized_project_name text := nullif(trim(project_name), '');
  normalized_scene_name text := nullif(trim(first_scene_name), '');
  normalized_display_name text := nullif(trim(display_name), '');
  normalized_actual_title text := nullif(trim(actual_title), '');
  slug_base text;
  workspace_slug text;
begin
  if current_user_id is null then
    raise exception 'Authentication is required.'
      using errcode = '42501';
  end if;

  if normalized_project_name is null
    or char_length(normalized_project_name) > 200 then
    raise exception 'Working title must be between 1 and 200 characters.'
      using errcode = '22023';
  end if;

  if normalized_actual_title is not null
    and char_length(normalized_actual_title) > 200 then
    raise exception 'Actual title must be 200 characters or fewer.'
      using errcode = '22023';
  end if;

  if char_length(normalized_scene_name) > 200 then
    raise exception 'Scene name must be between 1 and 200 characters.'
      using errcode = '22023';
  end if;

  if normalized_display_name is not null
    and char_length(normalized_display_name) > 120 then
    raise exception 'Display name must be 120 characters or fewer.'
      using errcode = '22023';
  end if;

  select membership.organization_id
  into workspace_id
  from public.organization_memberships as membership
  where membership.user_id = current_user_id
    and membership.status = 'active'
  order by membership.created_at, membership.organization_id
  limit 1;

  if workspace_id is null then
    if normalized_organization_name is null
      or char_length(normalized_organization_name) > 160 then
      raise exception 'Company name must be between 1 and 160 characters.'
        using errcode = '22023';
    end if;

    slug_base := trim(
      both '-'
      from regexp_replace(
        lower(normalized_organization_name),
        '[^a-z0-9]+',
        '-',
        'g'
      )
    );

    if slug_base = '' then
      slug_base := 'workspace';
    end if;

    workspace_slug := left(slug_base, 48)
      || '-'
      || substr(replace(extensions.gen_random_uuid()::text, '-', ''), 1, 8);

    insert into public.organizations (name, slug, created_by)
    values (
      normalized_organization_name,
      workspace_slug,
      current_user_id
    )
    returning id into workspace_id;

    insert into public.organization_memberships (
      organization_id,
      user_id,
      role,
      status
    )
    values (workspace_id, current_user_id, 'owner', 'active');
  end if;

  if normalized_display_name is not null then
    update public.profiles as profile
    set display_name = normalized_display_name
    where profile.id = current_user_id
      and profile.display_name is null;
  end if;

  insert into public.projects (
    organization_id,
    created_by,
    name,
    actual_title,
    client_name
  )
  values (
    workspace_id,
    current_user_id,
    normalized_project_name,
    normalized_actual_title,
    nullif(trim(client_name), '')
  )
  returning id into created_project_id;

  if normalized_scene_name is not null then
  insert into public.scenes (
    project_id,
    scene_number,
    name,
    sort_order,
    search_brief,
    created_by
  )
  values (
    created_project_id,
    1,
    normalized_scene_name,
    0,
    nullif(trim(search_brief), ''),
    current_user_id
  )
  returning id into created_scene_id;
  end if;

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
    workspace_id,
    created_project_id,
    'project',
    created_project_id,
    'project.created',
    jsonb_build_object('first_scene_id', created_scene_id)
  );

  return query
  select created_project_id, created_scene_id;
end;
$$;

create or replace function public.save_project_scene_grid(
  target_project_id uuid, project_name text, scene_rows jsonb,
  expected_version integer default null,
  organization_name text default null, display_name text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  project_key uuid := target_project_id;
  current_version integer;
  workspace_id uuid;
  item jsonb;
  scene_key uuid;
  next_number integer;
  position integer := 0;
  saved_rows jsonb := '[]'::jsonb;
  seen_ids uuid[] := '{}';
  seen_keys text[] := '{}';
begin
  if auth.uid() is null then raise exception 'Sign in to save your project.' using errcode='42501'; end if;
  if nullif(trim(project_name),'') is null or char_length(project_name)>200 then
    raise exception 'Enter a project name of up to 200 characters.' using errcode='22023';
  end if;
  if jsonb_typeof(scene_rows) is distinct from 'array' or jsonb_array_length(scene_rows)>500 then
    raise exception 'Invalid scene grid.' using errcode='22023';
  end if;
  if project_key is null then
    select p.project_id into project_key from public.start_project(
      coalesce(nullif(trim(organization_name),''),trim(project_name)),trim(project_name),'',null,display_name
    ) p;
  elsif not private.can_edit_project(project_key) then
    raise exception 'You do not have permission to edit this project.' using errcode='42501';
  end if;
  select p.version,p.organization_id into current_version,workspace_id from public.projects p
    where p.id=project_key and p.archived_at is null for update;
  if not found then raise exception 'Project not found.' using errcode='42501'; end if;
  if target_project_id is not null and (expected_version is null or expected_version<>current_version) then
    raise exception 'This project changed in another session. Reload before saving.' using errcode='40001';
  end if;
  for item in select value from jsonb_array_elements(scene_rows) loop
    if nullif(trim(item->>'key'),'') is null or (item->>'key')=any(seen_keys)
      or nullif(trim(item->>'name'),'') is null or char_length(item->>'name')>200
      or coalesce(item->>'vehicle','') not in ('sports_car','sedan','suv','none','undecided')
      or char_length(coalesce(item->>'pages',''))>80 then
      raise exception 'Each scene needs a name and vehicle; Page # is optional.' using errcode='22023';
    end if;
    seen_keys:=array_append(seen_keys,item->>'key');
    scene_key:=nullif(item->>'id','')::uuid;
    if scene_key is null then
      select coalesce(max(s.scene_number),0)+1 into next_number from public.scenes s where s.project_id=project_key;
      insert into public.scenes(project_id,scene_number,name,vehicle,script_pages,sort_order,created_by)
        values(project_key,next_number,trim(item->>'name'),(item->>'vehicle')::public.vehicle_type,
          nullif(trim(item->>'pages'),''),position,auth.uid()) returning id into scene_key;
    else
      if scene_key=any(seen_ids) then raise exception 'Duplicate scene.' using errcode='22023'; end if;
      update public.scenes s set name=trim(item->>'name'),vehicle=(item->>'vehicle')::public.vehicle_type,
        script_pages=nullif(trim(item->>'pages'),''),sort_order=position,version=s.version+1
        where s.id=scene_key and s.project_id=project_key and s.archived_at is null;
      if not found then raise exception 'Scene not found in this project.' using errcode='42501'; end if;
    end if;
    seen_ids:=array_append(seen_ids,scene_key);
    saved_rows:=saved_rows||jsonb_build_array(jsonb_build_object('key',item->>'key','id',scene_key));
    position:=position+1;
  end loop;
  -- This endpoint never deletes omitted scenes; callers must send the complete stack.
  if exists(select 1 from public.scenes s where s.project_id=project_key and s.archived_at is null and not(s.id=any(seen_ids))) then
    raise exception 'The scene list changed. Reload before saving.' using errcode='40001';
  end if;
  update public.projects p set name=trim(project_name),version=p.version+1,last_activity_at=now()
    where p.id=project_key returning p.version into current_version;
  insert into public.audit_events(actor_user_id,organization_id,project_id,entity_type,entity_id,event_type,payload)
    values(auth.uid(),workspace_id,project_key,'project',project_key,'project.scene_grid_saved',jsonb_build_object('scene_count',position));
  return jsonb_build_object('projectId',project_key,'version',current_version,'rows',saved_rows);
end $$;
revoke all on function public.save_project_scene_grid(uuid,text,jsonb,integer,text,text) from public, anon;
grant execute on function public.save_project_scene_grid(uuid,text,jsonb,integer,text,text) to authenticated;
commit;
