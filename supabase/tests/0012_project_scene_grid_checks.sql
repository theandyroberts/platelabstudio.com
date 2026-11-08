begin;
insert into auth.users(id,email,raw_user_meta_data) values
 ('88888888-2222-4222-8222-888888888888','scene-grid-qa@example.test','{}'),
 ('88888888-3333-4333-8333-888888888888','scene-grid-other@example.test','{}');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"88888888-2222-4222-8222-888888888888","role":"authenticated"}',true);
do $$
declare saved jsonb; p uuid; a uuid; b uuid; v integer;
begin
 saved:=public.save_project_scene_grid(null,'Empty QA','[]'); p:=(saved->>'projectId')::uuid;v:=(saved->>'version')::integer;
 if exists(select 1 from public.scenes where project_id=p) then raise exception 'Empty projects must have no scenes'; end if;
 saved:=public.save_project_scene_grid(p,'Grid QA','[{"key":"a","id":null,"name":"Downtown","vehicle":"sports_car","pages":""},{"key":"b","id":null,"name":"Bridge","vehicle":"suv","pages":"12"}]',v);
 a:=(saved->'rows'->0->>'id')::uuid;b:=(saved->'rows'->1->>'id')::uuid;v:=(saved->>'version')::integer;
 if (select script_pages from public.scenes where id=a) is not null then raise exception 'Pages should be optional';end if;
 saved:=public.save_project_scene_grid(p,'Grid reordered',jsonb_build_array(
 jsonb_build_object('key','b','id',b,'name','Bridge','vehicle','suv','pages','12'),
 jsonb_build_object('key','a','id',a,'name','Downtown updated','vehicle','sedan','pages','')),v);
 if (select id from public.scenes where project_id=p order by sort_order limit 1)<>b then raise exception 'Order did not persist';end if;
 begin
 perform public.save_project_scene_grid(p,'Stale','[]',v);
 raise exception 'Stale version must fail'; exception when serialization_failure then null;end;
 v:=(saved->>'version')::integer;
 begin
 perform public.save_project_scene_grid(p,'Invalid edit','[{"key":"new","id":null,"name":"Partial","vehicle":"suv","pages":""},{"key":"bad","id":null,"name":"","vehicle":"suv","pages":""}]',v);
 raise exception 'Missing required scene name must fail';exception when invalid_parameter_value then null;end;
 if (select count(*) from public.scenes where project_id=p)<>2 or (select name from public.projects where id=p)<>'Grid reordered' then raise exception 'Failure must roll back all changes';end if;
 perform set_config('request.jwt.claims','{"sub":"88888888-3333-4333-8333-888888888888","role":"authenticated"}',true);
 begin
 perform public.save_project_scene_grid(p,'Forbidden','[]',v);
 raise exception 'Non-member save must fail';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
