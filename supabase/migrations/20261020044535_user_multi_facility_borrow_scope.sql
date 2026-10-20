create table if not exists public.user_location_access (
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, location_id)
);

alter table public.user_location_access enable row level security;
grant select, insert, update, delete on public.user_location_access to authenticated;

drop policy if exists "users read own facility access" on public.user_location_access;
create policy "users read own facility access"
  on public.user_location_access for select to authenticated
  using (user_id = (select auth.uid()) or private.can_manage());

drop policy if exists "district admins manage facility access" on public.user_location_access;
create policy "district admins manage facility access"
  on public.user_location_access for all to authenticated
  using (private.can_manage()) with check (private.can_manage());

create or replace function private.can_access_location(p_location_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    private.can_view_all()
    or (p_location_id is not null and p_location_id = private.current_location())
    or exists (
      select 1
      from public.user_location_access ula
      where ula.user_id = (select auth.uid())
        and ula.location_id = p_location_id
    ),
    false
  );
$$;

create or replace function private.has_all_facility_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select count(distinct ula.location_id) >= 6
  from public.user_location_access ula
  where ula.user_id = (select auth.uid());
$$;

grant execute on function private.can_access_location(uuid) to authenticated;
grant execute on function private.has_all_facility_access() to authenticated;

insert into public.locations (location_code, location_name, location_type, organization_id, is_active)
values
  ('MMH-HOSPITAL', 'รพ.แม่เมาะ', 'โรงพยาบาล', null, true),
  ('MMH-PCU-BAN-THASI', 'รพ.สต.บ้านท่าสี', 'โรงพยาบาลส่งเสริมสุขภาพตำบล', null, true),
  ('MMH-PCU-BAN-THAN', 'รพ.สต.บ้านทาน', 'โรงพยาบาลส่งเสริมสุขภาพตำบล', null, true),
  ('MMH-PCU-BAN-SOPPAD', 'รพ.สต.บ้านสบป้าด', 'โรงพยาบาลส่งเสริมสุขภาพตำบล', null, true),
  ('MMH-PCU-BAN-MAI-RATTANAKOSIN', 'รพ.สต.บ้านใหม่รัตนโกสินทร์', 'โรงพยาบาลส่งเสริมสุขภาพตำบล', null, true),
  ('MMH-PCU-BAN-KORWAK', 'รพ.สต.บ้านกอรวก', 'โรงพยาบาลส่งเสริมสุขภาพตำบล', null, true)
on conflict (location_code) do update
set location_name = excluded.location_name,
    location_type = excluded.location_type,
    is_active = true;

do $$
declare
  active_facility_users integer;
begin
  select count(*) into active_facility_users
  from public.user_profiles
  where role = 'facility_officer' and is_active = true;

  if active_facility_users <> 1 then
    raise exception 'Expected exactly one active facility account to grant the requested six-site access; found %', active_facility_users;
  end if;
end;
$$;

insert into public.user_location_access (user_id, location_id)
select p.id, l.id
from public.user_profiles p
cross join public.locations l
where p.role = 'facility_officer'
  and p.is_active = true
  and l.location_code in (
    'MMH-HOSPITAL',
    'MMH-PCU-BAN-THASI',
    'MMH-PCU-BAN-THAN',
    'MMH-PCU-BAN-SOPPAD',
    'MMH-PCU-BAN-MAI-RATTANAKOSIN',
    'MMH-PCU-BAN-KORWAK'
  )
on conflict (user_id, location_id) do nothing;

drop policy if exists "users read locations in scope" on public.locations;
create policy "users read locations in scope"
  on public.locations for select to authenticated
  using (private.can_view_all() or private.can_access_location(id));

drop policy if exists "users read scoped equipment" on public.equipment;
create policy "users read scoped equipment"
  on public.equipment for select to authenticated
  using (
    private.can_view_all()
    or private.can_access_location(location_id)
    or (location_id is null and private.current_location() is not null)
    or private.has_all_facility_access()
  );

drop policy if exists "users read scoped borrows" on public.borrow_transactions;
create policy "users read scoped borrows"
  on public.borrow_transactions for select to authenticated
  using (private.can_view_all() or private.can_access_location(location_id));

drop policy if exists "users request local borrow" on public.borrow_transactions;
create policy "users request local borrow"
  on public.borrow_transactions for insert to authenticated
  with check (
    private.can_access_location(location_id)
    and created_by = (select auth.uid())
  );

