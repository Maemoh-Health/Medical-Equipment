alter table public.equipment
  add column latitude numeric(9,6),
  add column longitude numeric(9,6),
  add constraint equipment_coordinates_pair_check
    check ((latitude is null) = (longitude is null)),
  add constraint equipment_latitude_range_check
    check (latitude is null or latitude between -90 and 90),
  add constraint equipment_longitude_range_check
    check (longitude is null or longitude between -180 and 180);

comment on column public.equipment.latitude is
  'Latitude of this specific equipment item, distinct from its storage location.';
comment on column public.equipment.longitude is
  'Longitude of this specific equipment item, distinct from its storage location.';

