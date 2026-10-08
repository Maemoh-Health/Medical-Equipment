create or replace function public.prepare_borrow_timestamps() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
 if new.status='BORROWED' and (tg_op='INSERT' or old.status is distinct from new.status) and new.borrow_date is null then new.borrow_date=now(); end if;
 if new.status='RETURNED' and (tg_op='INSERT' or old.status is distinct from new.status) and new.return_date is null then new.return_date=now(); end if;
 return new;
end $$;
create trigger borrow_prepare_timestamps before insert or update of status on public.borrow_transactions for each row execute function public.prepare_borrow_timestamps();

create or replace view public.v_overdue_borrows with (security_invoker=true) as
 select b.id,b.borrow_code,b.equipment_id,b.borrower_name,b.location_id,b.due_date,
        greatest(0,current_date-b.due_date::date)::integer as days_overdue
 from public.borrow_transactions b
 where b.status in ('BORROWED','OVERDUE') and b.return_date is null and b.due_date < now();
grant select on public.v_overdue_borrows to authenticated;
