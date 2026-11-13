begin;
insert into auth.users(id,email,raw_user_meta_data) values('88888888-1111-4111-8111-888888888881','scene-order-qa@example.test','{}');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"88888888-1111-4111-8111-888888888881","role":"authenticated"}',true);
do $$
declare p uuid; s uuid; s2 uuid; a uuid; b uuid; c uuid; v integer; other_p uuid; other_s uuid;
begin
 select project_id, scene_id into p,s from public.start_project('Order QA','Order QA','First scene');
 select public.add_project_scene(p,'Second scene','') into s2;
 select public.add_clip_to_scene(s,id) into a from public.stock_clips where status='live' order by id limit 1;
 select public.add_clip_to_scene(s,id) into b from public.stock_clips where status='live' order by id offset 1 limit 1;
 select public.add_clip_to_scene(s2,id) into c from public.stock_clips where status='live' order by id limit 1;
 select version into v from public.scene_clips where id=a;
 perform public.set_scene_clip_status(a,'selected',v);
 if not (select in_order from public.scene_clips where id=a) then raise exception 'Choosing must add to order'; end if;
 select version into v from public.scene_clips where id=a;
 perform public.set_scene_clip_order(a,false,v);
 if (select status from public.scene_clips where id=a) <> 'selected' then raise exception 'Order removal must preserve choice'; end if;
 begin
  perform public.set_scene_clip_order(a,true,v);
  raise exception 'Stale version accepted';
 exception when serialization_failure then null;
 end;
 if public.add_chosen_clips_to_order(p,s) <> 1 then raise exception 'Scene restore must add one'; end if;
 if public.add_chosen_clips_to_order(p,s) <> 0 then raise exception 'Repeat addition must be idempotent'; end if;
 select version into v from public.scene_clips where id=c;
 perform public.set_scene_clip_status(c,'selected',v);
 select version into v from public.scene_clips where id=a;
 perform public.set_scene_clip_order(a,false,v);
 select version into v from public.scene_clips where id=c;
 perform public.set_scene_clip_order(c,false,v);
 if public.add_chosen_clips_to_order(p) <> 2 then raise exception 'Project addition must add both choices'; end if;
 select version into v from public.scene_clips where id=b;
 perform public.set_scene_clip_status(b,'selected',v);
 if (select in_order from public.scene_clips where id=a) then raise exception 'Replaced choice must leave order'; end if;
 if not (select in_order from public.scene_clips where id=b) then raise exception 'New choice must enter order'; end if;
 if not exists(select 1 from public.audit_events where entity_id=a and event_type='scene_clip.order_added') or
    not exists(select 1 from public.audit_events where entity_id=a and event_type='scene_clip.status_changed') then raise exception 'Choice and order events must be separately recorded'; end if;
 select project_id, scene_id into other_p,other_s from public.start_project('Other order QA','Other order QA','Other scene');
 begin
  perform public.add_chosen_clips_to_order(p,other_s);
  raise exception 'Mismatched project/scene accepted';
 exception when insufficient_privilege then null;
 end;
 perform set_config('request.jwt.claims','{"sub":"88888888-1111-4111-8111-888888888882","role":"authenticated"}',true);
 begin
  perform public.add_chosen_clips_to_order(p);
  raise exception 'Unauthorized project write accepted';
 exception when insufficient_privilege then null;
 end;
 begin
  perform public.set_scene_clip_order(b,false,1);
  raise exception 'Unauthorized clip write accepted';
 exception when insufficient_privilege then null;
 end;
end $$;
reset role;
rollback;
