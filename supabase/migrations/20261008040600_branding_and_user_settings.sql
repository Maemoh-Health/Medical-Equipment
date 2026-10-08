create table public.app_settings (
  id smallint primary key default 1 check (id = 1),
  ministry_logo_path text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

insert into public.app_settings (id) values (1) on conflict (id) do nothing;

alter table public.app_settings enable row level security;
grant select on public.app_settings to anon, authenticated;
grant update on public.app_settings to authenticated;

create policy "public can read ministry branding"
  on public.app_settings for select to anon, authenticated using (true);
create policy "district admins update ministry branding"
  on public.app_settings for update to authenticated
  using (private.can_manage()) with check (private.can_manage());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ministry-branding', 'ministry-branding', true, 4194304, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "public can view ministry logo"
  on storage.objects for select to public
  using (bucket_id = 'ministry-branding');
create policy "district admins upload ministry logo"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'ministry-branding' and private.can_manage());
create policy "district admins update ministry logo"
  on storage.objects for update to authenticated
  using (bucket_id = 'ministry-branding' and private.can_manage())
  with check (bucket_id = 'ministry-branding' and private.can_manage());
create policy "district admins delete ministry logo"
  on storage.objects for delete to authenticated
  using (bucket_id = 'ministry-branding' and private.can_manage());

create or replace function private.guard_self_profile_update()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if old.id = (select auth.uid()) and not private.can_manage() and (
    new.email is distinct from old.email or
    new.role is distinct from old.role or
    new.organization_id is distinct from old.organization_id or
    new.location_id is distinct from old.location_id or
    new.is_active is distinct from old.is_active
  ) then
    raise exception 'Users may only update their own name and phone';
  end if;
  return new;
end;
$$;

create trigger user_profiles_guard_self_update
before update on public.user_profiles
for each row execute function private.guard_self_profile_update();

revoke all on function private.guard_self_profile_update() from public, anon, authenticated;

