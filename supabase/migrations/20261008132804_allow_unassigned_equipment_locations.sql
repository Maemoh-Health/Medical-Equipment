alter table public.equipment
  alter column location_id drop not null;

update public.equipment as e
set location_id = null,
    updated_at = now()
where e.location_id = (
  select l.id
  from public.locations as l
  where l.location_code = 'XLSX-LOC-06'
    and l.location_name = 'ไม่ระบุสถานที่จากไฟล์'
);

delete from public.locations
where location_code = 'XLSX-LOC-06'
  and location_name = 'ไม่ระบุสถานที่จากไฟล์';

