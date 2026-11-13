begin;

-- Choice and order membership are separate records of intent. Preserve existing orders.
alter table public.scene_clips add column in_order boolean not null default false;
alter table public.scene_clips add column order_added_at timestamptz;
update public.scene_clips set in_order = true, order_added_at = updated_at
where status in ('selected', 'submitted');

create function private.sync_scene_clip_order()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if TG_OP = 'INSERT' or new.status is distinct from old.status then
    if new.status in ('selected', 'submitted') then
      new.in_order := true;
    elsif new.status = 'rejected' or (TG_OP = 'UPDATE' and old.status in ('selected', 'submitted')) then
      -- Clearing/replacing a choice clears its order entry; removing from the order alone does not clear the choice.
      new.in_order := false;
    end if;
  end if;
  if new.in_order and (TG_OP = 'INSERT' or not old.in_order) then
    new.order_added_at := now();
  end if;
  return new;
end;
$$;
create trigger scene_clip_order_sync before insert or update on public.scene_clips
for each row execute function private.sync_scene_clip_order();

create function private.audit_scene_clip_order()
returns trigger language plpgsql security definer set search_path = '' as $$
declare project_id uuid; organization_id uuid;
begin
  if (TG_OP = 'INSERT' and new.in_order) or (TG_OP = 'UPDATE' and new.in_order is distinct from old.in_order) then
    select p.id, p.organization_id into project_id, organization_id
      from public.scenes s join public.projects p on p.id = s.project_id where s.id = new.scene_id;
    insert into public.audit_events(actor_user_id, organization_id, project_id, entity_type, entity_id, event_type, payload)
    values(auth.uid(), organization_id, project_id, 'scene_clip', new.id,
      case when new.in_order then 'scene_clip.order_added' else 'scene_clip.order_removed' end,
      jsonb_build_object('in_order', new.in_order, 'choice_status', new.status, 'version', new.version));
  end if;
  return new;
end;
$$;
create trigger scene_clip_order_audit after insert or update on public.scene_clips
for each row execute function private.audit_scene_clip_order();

create function public.set_scene_clip_order(target_scene_clip_id uuid, next_in_order boolean, expected_version integer)
returns integer language plpgsql security definer set search_path = '' as $$
declare scene_id uuid; current_clip public.scene_clips; result integer;
begin
  select c.scene_id into scene_id from public.scene_clips c where c.id = target_scene_clip_id;
  if auth.uid() is null or scene_id is null or not private.can_edit_scene(scene_id) then
    raise exception 'You cannot update this order.' using errcode = '42501';
  end if;
  perform 1 from public.scenes s join public.projects p on p.id = s.project_id
    where s.id = scene_id and s.archived_at is null and p.status = 'active' for update of s;
  if not found then raise exception 'This scene is unavailable.' using errcode = '42501'; end if;
  select * into current_clip from public.scene_clips c where c.id = target_scene_clip_id for update;
  if current_clip.version is distinct from expected_version then
    raise exception 'This clip changed. Refresh and retry.' using errcode = '40001';
  end if;
  if next_in_order is null or (next_in_order and current_clip.status = 'rejected') then
    raise exception 'Choose an associated plate.' using errcode = '22023';
  end if;
  if current_clip.in_order = next_in_order then return current_clip.version; end if;
  update public.scene_clips set in_order = next_in_order, version = version + 1
    where id = target_scene_clip_id returning version into result;
  return result;
end;
$$;

create function public.add_chosen_clips_to_order(target_project_id uuid, target_scene_id uuid default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare result integer;
begin
  if auth.uid() is null or not private.can_edit_project(target_project_id) or
    not exists(select 1 from public.projects where id = target_project_id and status = 'active') then
    raise exception 'You cannot update this project order.' using errcode = '42501';
  end if;
  if target_scene_id is not null and not exists(select 1 from public.scenes where id = target_scene_id and project_id = target_project_id and archived_at is null) then
    raise exception 'This scene is unavailable.' using errcode = '42501';
  end if;
  -- Use the same scene locks as choosing a clip, in stable order for project-wide additions.
  perform 1 from public.scenes s where s.project_id = target_project_id and s.archived_at is null
    and (target_scene_id is null or s.id = target_scene_id) order by s.id for update;
  update public.scene_clips c set in_order = true, version = c.version + 1
    from public.scenes s where s.id = c.scene_id and s.project_id = target_project_id and s.archived_at is null
      and (target_scene_id is null or s.id = target_scene_id)
      and c.status in ('selected', 'submitted') and not c.in_order;
  get diagnostics result = row_count;
  return result;
end;
$$;

revoke all on function private.sync_scene_clip_order() from public, anon, authenticated;
revoke all on function private.audit_scene_clip_order() from public, anon, authenticated;
revoke all on function public.set_scene_clip_order(uuid, boolean, integer) from public, anon;
revoke all on function public.add_chosen_clips_to_order(uuid, uuid) from public, anon;
grant execute on function public.set_scene_clip_order(uuid, boolean, integer) to authenticated;
grant execute on function public.add_chosen_clips_to_order(uuid, uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
