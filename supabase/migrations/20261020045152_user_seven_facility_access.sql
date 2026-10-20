insert into public.locations (location_code, location_name, location_type, organization_id, is_active)
values ('MMH-DISTRICT-HEALTH-OFFICE', 'สสอ.แม่เมาะ', 'สำนักงานสาธารณสุขอำเภอ', null, true)
on conflict (location_code) do update
set location_name = excluded.location_name,
    location_type = excluded.location_type,
    is_active = true;

insert into public.user_location_access (user_id, location_id)
select p.id, l.id
from public.user_profiles p
join (
  select user_id
  from public.user_location_access
  group by user_id
  having count(distinct location_id) >= 6
) existing_multi_site_access on existing_multi_site_access.user_id = p.id
cross join public.locations l
where p.role = 'facility_officer'
  and p.is_active = true
  and l.location_code = 'MMH-DISTRICT-HEALTH-OFFICE'
on conflict (user_id, location_id) do nothing;

update public.locations
set is_active = false
where location_code in (
  'XLSX-LOC-01',
  'XLSX-LOC-02',
  'XLSX-LOC-03',
  'XLSX-LOC-04',
  'XLSX-LOC-05'
);

create or replace function private.has_all_facility_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select count(distinct ula.location_id) >= 7
  from public.user_location_access ula
  where ula.user_id = (select auth.uid());
$$;

grant execute on function private.has_all_facility_access() to authenticated;
