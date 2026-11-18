begin;
create sequence public.plate_order_number_seq;
create table public.plate_orders (
 id uuid primary key default gen_random_uuid(),
 reference text not null unique default ('PL-'||to_char(now(),'YYYY')||'-'||lpad(nextval('public.plate_order_number_seq')::text,6,'0')),
 user_id uuid not null references auth.users(id), submission_key uuid not null,
 status text not null default 'submitted' check(status='submitted'),
 details jsonb not null, items jsonb not null check(jsonb_array_length(items)>0),
 estimate_usd numeric, license_version text not null,
 recipient_email text not null,
 created_at timestamptz not null default now(),
 email_status text not null default 'pending' check(email_status in ('pending','sending','sent','failed')),
 email_sent_at timestamptz, email_attempted_at timestamptz, email_attempts integer not null default 0,
 unique(user_id,submission_key)
);
alter table public.plate_orders enable row level security;
create policy own_orders on public.plate_orders for select to authenticated using(user_id=auth.uid());
grant select on public.plate_orders to authenticated;
grant all on public.plate_orders to service_role;
grant usage,select on sequence public.plate_order_number_seq to service_role;

-- Only the application server can submit a validated checkout. Snapshot prices and
-- ranges are rechecked while holding the same scene locks used by clip selection.
create function public.submit_plate_order(actor uuid, request_key uuid, order_details jsonb, order_items jsonb, recipient text)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; expected_count integer; actual_count integer; item jsonb; clip record; current_price numeric; total numeric:=0;
begin
 if actor is null or not exists(select 1 from auth.users where id=actor) then raise exception 'Authentication required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||request_key::text,0));
 select id into result from public.plate_orders where user_id=actor and submission_key=request_key;
 if result is not null then return result; end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 if jsonb_typeof(order_items)<>'array' or jsonb_array_length(order_items) not between 1 and 100 or order_details->>'acknowledgment'<>'true' then raise exception 'Invalid checkout' using errcode='22023'; end if;
 perform 1 from public.scenes s join public.projects p on p.id=s.project_id
 where s.archived_at is null and p.status='active' and private.can_edit_scene(s.id) order by s.id for update of s;
 expected_count:=jsonb_array_length(order_items);
 select count(*) into actual_count from public.scene_clips c join public.scenes s on s.id=c.scene_id join public.projects p on p.id=s.project_id
 where c.in_order and s.archived_at is null and p.status='active' and private.can_edit_scene(s.id);
 if actual_count<>expected_count or (select count(distinct value->>'id') from jsonb_array_elements(order_items))<>expected_count then
 raise exception 'Your order changed. Review it again.' using errcode='40001'; end if;
 for item in select value from jsonb_array_elements(order_items) loop
  select c.*, k.source_metadata as metadata into clip from public.scene_clips c join public.stock_clips k on k.id=c.stock_clip_id
  where c.id=(item->>'id')::uuid for update of c;
  if not found or not private.can_edit_scene(clip.scene_id) or not clip.in_order or clip.version<>(item->>'version')::integer
    or clip.in_frame is distinct from (item->>'inFrame')::bigint or clip.out_frame is distinct from (item->>'outFrame')::bigint then
   raise exception 'Your plate selection changed. Review it again.' using errcode='40001'; end if;
  if clip.in_frame is not null and (clip.metadata#>>'{media,fps}')::numeric>0 and (clip.metadata#>>'{pricing,perMinuteUsd}')::numeric>0 and (clip.metadata#>>'{pricing,minimumMinutes}')::numeric>0 then
   current_price:=round((clip.metadata#>>'{pricing,perMinuteUsd}')::numeric*greatest((clip.metadata#>>'{pricing,minimumMinutes}')::numeric,(clip.out_frame-clip.in_frame+1)/(clip.metadata#>>'{media,fps}')::numeric/60));
  else current_price:=(clip.metadata#>>'{pricing,totalUsd}')::numeric; end if;
  if current_price is distinct from (item->>'estimateUsd')::numeric then raise exception 'Pricing changed. Review your order again.' using errcode='40001'; end if;
  total:=total+current_price;
 end loop;
 insert into public.plate_orders(user_id,submission_key,details,items,estimate_usd,license_version,recipient_email)
 values(actor,request_key,order_details,order_items,total,'discussion-draft-2026-11-18',recipient) returning id into result;
 update public.scene_clips set in_order=false,version=version+1
 where id in(select (value->>'id')::uuid from jsonb_array_elements(order_items));
 insert into public.audit_events(actor_user_id,entity_type,entity_id,event_type,payload)
 values(actor,'plate_order',result,'order.submitted',jsonb_build_object('item_count',expected_count,'license_version','discussion-draft-2026-11-18'));
 return result;
end $$;
revoke all on function public.submit_plate_order(uuid,uuid,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.submit_plate_order(uuid,uuid,jsonb,jsonb,text) to service_role;

create function public.claim_order_email(target_order uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 update public.plate_orders set email_status='sending',email_attempts=email_attempts+1,email_attempted_at=now()
 where id=target_order and email_status<>'sent' and email_attempts<10
 and (email_attempted_at is null or email_attempted_at<now()-interval '5 minutes');
 return found;
end $$;
revoke all on function public.claim_order_email(uuid) from public,anon,authenticated;
grant execute on function public.claim_order_email(uuid) to service_role;
notify pgrst,'reload schema';
commit;
