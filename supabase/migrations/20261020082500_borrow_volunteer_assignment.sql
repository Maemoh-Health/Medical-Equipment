alter table public.borrow_transactions
  add column village_health_volunteer_id uuid
  references public.village_health_volunteers(id) on delete set null;

create index borrow_transactions_village_health_volunteer_idx
  on public.borrow_transactions (village_health_volunteer_id)
  where village_health_volunteer_id is not null;

create or replace function private.ensure_borrow_volunteer_location()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.village_health_volunteer_id is not null and not exists (
    select 1
    from public.village_health_volunteers volunteer
    where volunteer.id = new.village_health_volunteer_id
      and volunteer.location_id = new.location_id
  ) then
    raise exception 'Selected village health volunteer must belong to the borrow service location'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.ensure_borrow_volunteer_location() from public, anon, authenticated;

create trigger borrow_transactions_volunteer_location_guard
  before insert or update of location_id, village_health_volunteer_id
  on public.borrow_transactions
  for each row
  execute function private.ensure_borrow_volunteer_location();

comment on column public.borrow_transactions.village_health_volunteer_id
  is 'Village health volunteer responsible for the borrower, assigned within the selected service location';

