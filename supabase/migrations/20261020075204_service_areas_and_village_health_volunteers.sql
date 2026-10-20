create table public.service_area_profiles (
  location_id uuid primary key references public.locations(id) on delete cascade,
  coverage_area text not null default '',
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create table public.village_health_volunteers (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id),
  full_name text not null check (char_length(trim(full_name)) between 2 and 120),
  phone text not null check (char_length(trim(phone)) between 6 and 30),
  village text check (village is null or char_length(village) <= 160),
  is_active boolean not null default true,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index village_health_volunteers_location_active_idx
  on public.village_health_volunteers (location_id, is_active, full_name);

alter table public.service_area_profiles enable row level security;
alter table public.village_health_volunteers enable row level security;

grant select, insert, update, delete on public.service_area_profiles to authenticated;
grant select, insert, update, delete on public.village_health_volunteers to authenticated;

create policy "users read service areas in scope"
  on public.service_area_profiles for select to authenticated
  using (private.can_access_location(location_id));
create policy "users manage service areas in scope"
  on public.service_area_profiles for all to authenticated
  using (private.can_access_location(location_id))
  with check (private.can_access_location(location_id));

create policy "users read volunteers in scope"
  on public.village_health_volunteers for select to authenticated
  using (private.can_access_location(location_id));
create policy "users manage volunteers in scope"
  on public.village_health_volunteers for all to authenticated
  using (private.can_access_location(location_id))
  with check (private.can_access_location(location_id));

comment on table public.service_area_profiles is 'Service coverage description per health service location';
comment on table public.village_health_volunteers is 'Village health volunteer contact directory scoped to service locations';

