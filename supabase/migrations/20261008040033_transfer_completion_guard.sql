create or replace function public.apply_transfer_receipt() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if new.status='RECEIVED' and old.status is distinct from new.status then
   if old.status not in ('APPROVED','IN_TRANSIT') then raise exception 'สถานะโอนย้ายต้องได้รับอนุมัติก่อนรับ'; end if;
   update public.equipment set location_id=new.to_location_id,updated_by=(select auth.uid())
   where id=new.equipment_id and location_id=new.from_location_id and status not in ('BORROWED','REPAIRING','DISPOSED');
   if not found then raise exception 'อุปกรณ์ไม่อยู่ต้นทางหรือยังไม่พร้อมโอน'; end if;
 end if;
 return new;
end $$;
revoke all on function public.apply_transfer_receipt() from public,anon,authenticated;
create trigger transfer_receipt_moves_equipment after update of status on public.transfer_transactions for each row execute function public.apply_transfer_receipt();
