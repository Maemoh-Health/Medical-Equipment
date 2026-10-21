create or replace function public.set_service_equipment_coordinates(
  p_equipment_id uuid,
  p_latitude double precision,
  p_longitude double precision
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_latitude is null or p_longitude is null
     or p_latitude < -90 or p_latitude > 90
     or p_longitude < -180 or p_longitude > 180 then
    raise exception 'Invalid coordinates';
  end if;

  if not private.can_manage() and not exists (
    select 1
    from public.user_profiles p
    where p.id = auth.uid()
      and p.is_active
      and p.location_id is not null
      and (
        exists (
          select 1
          from public.equipment e
          where e.id = p_equipment_id
            and e.location_id = p.location_id
            and e.is_active
        )
        or exists (
          select 1
          from public.borrow_transactions b
          where b.equipment_id = p_equipment_id
            and b.location_id = p.location_id
            and b.status::text in ('BORROWED', 'OVERDUE')
        )
      )
  ) then
    raise exception 'Not authorized to update this equipment location';
  end if;

  update public.equipment
  set latitude = p_latitude,
      longitude = p_longitude,
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_equipment_id
    and is_active;

  if not found then
    raise exception 'Active equipment not found';
  end if;
end;
$$;

revoke all on function public.set_service_equipment_coordinates(uuid, double precision, double precision) from public, anon;
grant execute on function public.set_service_equipment_coordinates(uuid, double precision, double precision) to authenticated;
