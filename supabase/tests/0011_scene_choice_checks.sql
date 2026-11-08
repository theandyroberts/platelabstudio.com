begin;
insert into auth.users(id,email,raw_user_meta_data) values('88888888-1111-4111-8111-888888888888','scene-choice-qa@example.test','{}');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"88888888-1111-4111-8111-888888888888","role":"authenticated"}',true);
do $$
declare p uuid; s uuid; a uuid; b uuid; v integer;
begin
 select project_id, scene_id into p,s from public.start_project('Choice QA','Choice QA','Scene QA');
 select public.add_clip_to_scene(s,id) into a from public.stock_clips where status='live' order by id limit 1;
 select public.add_clip_to_scene(s,id) into b from public.stock_clips where status='live' order by id offset 1 limit 1;
 if a is null or b is null then raise exception 'Need two catalog clips'; end if;
 select version into v from public.scene_clips where id=a;
 perform public.set_scene_clip_status(a,'selected',v);
 select version into v from public.scene_clips where id=b;
 perform public.set_scene_clip_status(b,'selected',v);
 if (select count(*) from public.scene_clips where scene_id=s and status='selected') <> 1 then raise exception 'Must have one choice'; end if;
 if (select status from public.scene_clips where id=a) <> 'considering' then raise exception 'Previous choice must remain saved'; end if;
 begin
  perform public.set_scene_clip_status(b,'considering',v);
  raise exception 'Stale write must fail';
 exception when serialization_failure then null;
 end;
 select version into v from public.scene_clips where id=b;
 perform public.set_scene_clip_status(b,'considering',v);
 if (select count(*) from public.scene_clips where scene_id=s and status='selected') <> 0 then raise exception 'Unchoose must clear order'; end if;
 begin
  perform public.set_scene_clip_status(b,'shortlisted',v+1);
  raise exception 'Intermediate status must fail';
 exception when invalid_parameter_value then null;
 end;
 if has_function_privilege('authenticated','public.import_project_scenes(uuid,jsonb)','EXECUTE') then raise exception 'Script import must be disabled'; end if;
end $$;
reset role;
rollback;
