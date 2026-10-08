create or replace function private.create_profile_for_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 insert into public.user_profiles(id,email,full_name,role)
 values (new.id,new.email,coalesce(nullif(new.raw_user_meta_data->>'full_name',''),new.email,'ยังไม่ระบุ'),'facility_officer')
 on conflict (id) do nothing;
 return new;
end $$;
revoke all on function private.create_profile_for_auth_user() from public,anon,authenticated;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.create_profile_for_auth_user();

create or replace function public.touch_updated_at() returns trigger language plpgsql security invoker set search_path = '' as $$
begin new.updated_at=now(); return new; end $$;
create trigger organizations_touch before update on public.organizations for each row execute function public.touch_updated_at();
create trigger locations_touch before update on public.locations for each row execute function public.touch_updated_at();
create trigger categories_touch before update on public.equipment_categories for each row execute function public.touch_updated_at();
create trigger profiles_touch before update on public.user_profiles for each row execute function public.touch_updated_at();
create trigger equipment_touch before update on public.equipment for each row execute function public.touch_updated_at();
create trigger transfers_touch before update on public.transfer_transactions for each row execute function public.touch_updated_at();
create trigger borrows_touch before update on public.borrow_transactions for each row execute function public.touch_updated_at();
create trigger maintenance_touch before update on public.maintenance_records for each row execute function public.touch_updated_at();

create or replace function public.apply_distribution_location() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 update public.equipment set location_id=new.to_location_id,updated_by=(select auth.uid())
 where id=new.equipment_id and location_id=new.from_location_id and status not in ('BORROWED','REPAIRING','DISPOSED');
 if not found then raise exception 'อุปกรณ์ไม่อยู่ที่ต้นทางหรือยังไม่พร้อมโอน'; end if;
 return new;
end $$;
revoke all on function public.apply_distribution_location() from public,anon,authenticated;
create trigger distribution_moves_equipment after insert on public.distribution_transactions for each row execute function public.apply_distribution_location();

create or replace function public.apply_borrow_status() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if new.status='BORROWED' and (tg_op='INSERT' or old.status is distinct from new.status) then
   update public.equipment set status='BORROWED' where id=new.equipment_id and status='AVAILABLE';
   if not found then raise exception 'อุปกรณ์นี้ไม่พร้อมให้ยืม'; end if;
 elsif new.status='RETURNED' and (tg_op='INSERT' or old.status is distinct from new.status) then
   update public.equipment set status='WAITING_INSPECTION' where id=new.equipment_id and status='BORROWED';
   if not found then raise exception 'สถานะอุปกรณ์ไม่ตรงกับรายการยืม'; end if;
 end if;
 return new;
end $$;
revoke all on function public.apply_borrow_status() from public,anon,authenticated;
create trigger borrow_updates_equipment after insert or update of status on public.borrow_transactions for each row execute function public.apply_borrow_status();

create or replace function public.apply_maintenance_status() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if tg_op='INSERT' then
   update public.equipment set status='UNAVAILABLE' where id=new.equipment_id and status not in ('BORROWED','DISPOSED');
   if not found then raise exception 'อุปกรณ์อยู่ระหว่างยืมหรือจำหน่ายแล้ว'; end if;
 elsif new.status='COMPLETED' and old.status is distinct from new.status then
   update public.equipment set status='WAITING_INSPECTION' where id=new.equipment_id and status in ('UNAVAILABLE','REPAIRING');
 elsif new.status='REPAIRING' and old.status is distinct from new.status then
   update public.equipment set status='REPAIRING' where id=new.equipment_id and status='UNAVAILABLE';
 end if;
 return new;
end $$;
revoke all on function public.apply_maintenance_status() from public,anon,authenticated;
create trigger maintenance_updates_equipment after insert or update of status on public.maintenance_records for each row execute function public.apply_maintenance_status();

create or replace function public.apply_inspection_status() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if new.result='PASS' then update public.equipment set status='AVAILABLE' where id=new.equipment_id and status in ('WAITING_INSPECTION','UNAVAILABLE');
 else update public.equipment set status='UNAVAILABLE' where id=new.equipment_id and status<>'DISPOSED'; end if;
 return new;
end $$;
revoke all on function public.apply_inspection_status() from public,anon,authenticated;
create trigger inspection_updates_equipment after insert on public.inspection_records for each row execute function public.apply_inspection_status();

-- Keep transaction histories append-only for client roles; correction is recorded as a new event.
revoke delete on public.distribution_transactions,public.transfer_transactions,public.borrow_transactions,public.maintenance_records,public.inspection_records,public.audit_logs from anon,authenticated;
revoke update,delete on public.audit_logs from anon,authenticated;
revoke delete on public.equipment from anon,authenticated;
