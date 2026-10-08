create extension if not exists pgcrypto;
create schema if not exists private;

create type public.app_role as enum ('facility_officer','district_admin','executive');
create type public.equipment_status as enum ('AVAILABLE','BORROWED','WAITING_INSPECTION','WAITING_CLEANING','REPAIRING','UNAVAILABLE','DISPOSED');
create type public.borrow_status as enum ('PENDING','APPROVED','REJECTED','BORROWED','OVERDUE','RETURNED','CLOSED');
create type public.transfer_status as enum ('REQUESTED','APPROVED','IN_TRANSIT','RECEIVED','CANCELLED');

create table public.organizations (
 id uuid primary key default gen_random_uuid(), organization_code text not null unique, organization_name text not null,
 organization_type text not null default 'ยังไม่ระบุ', district text not null default 'แม่เมาะ', province text not null default 'ลำปาง',
 is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.locations (
 id uuid primary key default gen_random_uuid(), organization_id uuid references public.organizations(id), location_code text not null unique,
 location_name text not null, location_type text not null default 'ยังไม่ระบุ', address text, subdistrict text,
 district text default 'แม่เมาะ', province text default 'ลำปาง', latitude numeric(9,6), longitude numeric(9,6),
 is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.equipment_categories (
 id uuid primary key default gen_random_uuid(), category_code text not null unique, category_name text not null unique,
 description text, unit text not null default 'ชิ้น', image_url text, requires_inspection boolean not null default true,
 requires_maintenance boolean not null default true, is_active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.user_profiles (
 id uuid primary key references auth.users(id) on delete restrict, full_name text not null default 'ยังไม่ระบุ', email text, phone text,
 organization_id uuid references public.organizations(id), location_id uuid references public.locations(id),
 role public.app_role not null default 'facility_officer', is_active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.equipment (
 id uuid primary key default gen_random_uuid(), equipment_code text not null unique, category_id uuid not null references public.equipment_categories(id),
 equipment_name text not null, brand text, model text, serial_number text, asset_number text, purchase_date date, received_date date,
 source text, budget_source text, purchase_price numeric(12,2) check (purchase_price is null or purchase_price >= 0),
 useful_life integer check (useful_life is null or useful_life > 0), location_id uuid not null references public.locations(id),
 status public.equipment_status not null default 'WAITING_INSPECTION', condition_level text not null default 'รอตรวจสอบ',
 responsible_organization_id uuid references public.organizations(id), responsible_user_id uuid references public.user_profiles(id),
 qr_code text, photo_url text, description text, remark text, is_active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 created_by uuid references auth.users(id), updated_by uuid references auth.users(id)
);
create unique index equipment_serial_number_unique on public.equipment(serial_number) where serial_number is not null and serial_number <> '';
create table public.distribution_transactions (
 id uuid primary key default gen_random_uuid(), equipment_id uuid not null references public.equipment(id),
 from_location_id uuid not null references public.locations(id), to_location_id uuid not null references public.locations(id),
 distribution_date timestamptz not null default now(), reason text not null, approved_by uuid references auth.users(id),
 delivered_by text, received_by text, remark text, created_by uuid references auth.users(id) default auth.uid(), created_at timestamptz not null default now(),
 check (from_location_id <> to_location_id)
);
create table public.transfer_transactions (
 id uuid primary key default gen_random_uuid(), equipment_id uuid not null references public.equipment(id),
 from_location_id uuid not null references public.locations(id), to_location_id uuid not null references public.locations(id),
 transfer_date timestamptz not null default now(), reason text not null, requested_by uuid references auth.users(id), approved_by uuid references auth.users(id),
 sent_by text, received_by text, status public.transfer_status not null default 'REQUESTED', remark text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check (from_location_id <> to_location_id)
);
create table public.borrow_transactions (
 id uuid primary key default gen_random_uuid(), borrow_code text not null unique default ('BR-' || upper(substr(encode(gen_random_bytes(5),'hex'),1,8))),
 equipment_id uuid not null references public.equipment(id), borrower_name text not null, borrower_id text, contact_phone text,
 organization_id uuid references public.organizations(id), location_id uuid not null references public.locations(id),
 borrow_date timestamptz, due_date timestamptz not null, return_date timestamptz, approved_by uuid references auth.users(id),
 handover_by uuid references auth.users(id), received_by uuid references auth.users(id), purpose text not null,
 status public.borrow_status not null default 'PENDING', condition_before text, condition_after text, remark text,
 created_by uuid references auth.users(id) default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check (due_date >= coalesce(borrow_date, created_at)), check (return_date is null or borrow_date is null or return_date >= borrow_date)
);
create table public.maintenance_records (
 id uuid primary key default gen_random_uuid(), equipment_id uuid not null references public.equipment(id), report_date timestamptz not null default now(),
 problem_description text not null, reported_by uuid references auth.users(id), maintenance_type text not null default 'ซ่อม', vendor text,
 cost numeric(12,2) check (cost is null or cost >= 0), sent_date date, completed_date date, repair_result text,
 status text not null default 'REPORTED' check(status in ('REPORTED','WAITING_REPAIR','REPAIRING','COMPLETED','CANCELLED')),
 remark text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.inspection_records (
 id uuid primary key default gen_random_uuid(), equipment_id uuid not null references public.equipment(id), inspection_date timestamptz not null default now(),
 inspection_type text not null, inspector_id uuid references auth.users(id), physical_condition text, function_test text,
 accessories_complete boolean, cleanliness text, electrical_safety text, result text not null check(result in ('PASS','FAIL','NEED_REPAIR')),
 remark text, created_at timestamptz not null default now()
);
create table public.audit_logs (
 id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id), action text not null, table_name text not null,
 record_id uuid, old_data jsonb, new_data jsonb, created_at timestamptz not null default now()
);
create table public.notifications (
 id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id), organization_id uuid references public.organizations(id),
 title text not null, message text not null, notification_type text not null, related_table text, related_id uuid,
 read_at timestamptz, created_at timestamptz not null default now()
);

create index equipment_location_status_idx on public.equipment(location_id,status) where is_active;
create index equipment_category_idx on public.equipment(category_id);
create index equipment_search_idx on public.equipment using gin (to_tsvector('simple', coalesce(equipment_code,'') || ' ' || coalesce(equipment_name,'') || ' ' || coalesce(serial_number,'') || ' ' || coalesce(asset_number,'')));
create index borrow_due_status_idx on public.borrow_transactions(due_date,status);
create index maintenance_equipment_status_idx on public.maintenance_records(equipment_id,status);
create index transfers_status_date_idx on public.transfer_transactions(status,transfer_date);
create index audit_record_date_idx on public.audit_logs(table_name,record_id,created_at desc);
create index notifications_user_date_idx on public.notifications(user_id,created_at desc);

-- Authorization lookups are kept in a non-exposed schema. Definer functions use fixed search_path and reveal only the caller's own access attributes.
create or replace function private.current_role() returns public.app_role language sql stable security definer set search_path = '' as $$
 select p.role from public.user_profiles p where p.id = (select auth.uid()) and p.is_active limit 1
$$;
create or replace function private.current_location() returns uuid language sql stable security definer set search_path = '' as $$
 select p.location_id from public.user_profiles p where p.id = (select auth.uid()) and p.is_active limit 1
$$;
create or replace function private.current_org() returns uuid language sql stable security definer set search_path = '' as $$
 select p.organization_id from public.user_profiles p where p.id = (select auth.uid()) and p.is_active limit 1
$$;
create or replace function private.can_manage() returns boolean language sql stable security definer set search_path = '' as $$
 select coalesce(private.current_role() = 'district_admin'::public.app_role,false)
$$;
create or replace function private.can_view_all() returns boolean language sql stable security definer set search_path = '' as $$
 select coalesce(private.current_role() in ('district_admin'::public.app_role,'executive'::public.app_role),false)
$$;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
revoke all on function private.current_role(),private.current_location(),private.current_org(),private.can_manage(),private.can_view_all() from public, anon;
grant execute on function private.current_role(),private.current_location(),private.current_org(),private.can_manage(),private.can_view_all() to authenticated;

alter table public.organizations enable row level security;
alter table public.locations enable row level security;
alter table public.equipment_categories enable row level security;
alter table public.user_profiles enable row level security;
alter table public.equipment enable row level security;
alter table public.distribution_transactions enable row level security;
alter table public.transfer_transactions enable row level security;
alter table public.borrow_transactions enable row level security;
alter table public.maintenance_records enable row level security;
alter table public.inspection_records enable row level security;
alter table public.audit_logs enable row level security;
alter table public.notifications enable row level security;

create policy "active users read organizations" on public.organizations for select to authenticated using (is_active or private.can_view_all());
create policy "district admins manage organizations" on public.organizations for all to authenticated using (private.can_manage()) with check (private.can_manage());
create policy "users read locations in scope" on public.locations for select to authenticated using (private.can_view_all() or id=private.current_location() or organization_id=private.current_org());
create policy "district admins manage locations" on public.locations for all to authenticated using (private.can_manage()) with check (private.can_manage());
create policy "authenticated read categories" on public.equipment_categories for select to authenticated using (is_active or private.can_manage());
create policy "district admins manage categories" on public.equipment_categories for all to authenticated using (private.can_manage()) with check (private.can_manage());
create policy "users read own profile" on public.user_profiles for select to authenticated using (id=(select auth.uid()) or private.can_manage());
create policy "users update own contact" on public.user_profiles for update to authenticated using (id=(select auth.uid())) with check (id=(select auth.uid()) and role=(select private.current_role()) and organization_id=(select private.current_org()) and location_id=(select private.current_location()));
create policy "district admins manage profiles" on public.user_profiles for all to authenticated using (private.can_manage()) with check (private.can_manage());
create policy "users read scoped equipment" on public.equipment for select to authenticated using (private.can_view_all() or location_id=(select private.current_location()));
create policy "district admins insert equipment" on public.equipment for insert to authenticated with check (private.can_manage());
create policy "district admins update equipment" on public.equipment for update to authenticated using (private.can_manage()) with check (private.can_manage());
create policy "users read scoped distributions" on public.distribution_transactions for select to authenticated using (private.can_view_all() or from_location_id=(select private.current_location()) or to_location_id=(select private.current_location()));
create policy "district admins manage distributions" on public.distribution_transactions for all to authenticated using (private.can_manage()) with check (private.can_manage());
create policy "users read scoped transfers" on public.transfer_transactions for select to authenticated using (private.can_view_all() or from_location_id=(select private.current_location()) or to_location_id=(select private.current_location()));
create policy "users request local transfers" on public.transfer_transactions for insert to authenticated with check (from_location_id=(select private.current_location()) and requested_by=(select auth.uid()));
create policy "district admins update transfers" on public.transfer_transactions for update to authenticated using (private.can_manage()) with check (private.can_manage());
create policy "users read scoped borrows" on public.borrow_transactions for select to authenticated using (private.can_view_all() or location_id=(select private.current_location()));
create policy "users request local borrow" on public.borrow_transactions for insert to authenticated with check (location_id=(select private.current_location()) and created_by=(select auth.uid()));
create policy "district admins manage borrows" on public.borrow_transactions for all to authenticated using (private.can_manage()) with check (private.can_manage());
create policy "users read scoped maintenance" on public.maintenance_records for select to authenticated using (private.can_view_all() or exists(select 1 from public.equipment e where e.id=equipment_id and e.location_id=(select private.current_location())));
create policy "users report maintenance" on public.maintenance_records for insert to authenticated with check (reported_by=(select auth.uid()) and exists(select 1 from public.equipment e where e.id=equipment_id and e.location_id=(select private.current_location())));
create policy "district admins manage maintenance" on public.maintenance_records for all to authenticated using (private.can_manage()) with check (private.can_manage());
create policy "users read scoped inspections" on public.inspection_records for select to authenticated using (private.can_view_all() or exists(select 1 from public.equipment e where e.id=equipment_id and e.location_id=(select private.current_location())));
create policy "district admins manage inspections" on public.inspection_records for all to authenticated using (private.can_manage()) with check (private.can_manage());
create policy "district admins read audit logs" on public.audit_logs for select to authenticated using (private.can_manage());
create policy "users read own notifications" on public.notifications for select to authenticated using (user_id=(select auth.uid()) or (user_id is null and organization_id=(select private.current_org())));
create policy "users update own notifications" on public.notifications for update to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));

create or replace function public.write_audit_log() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
 insert into public.audit_logs(user_id,action,table_name,record_id,old_data,new_data)
 values ((select auth.uid()),TG_OP || '_' || upper(TG_TABLE_NAME),TG_TABLE_NAME,
   coalesce((to_jsonb(NEW)->>'id')::uuid,(to_jsonb(OLD)->>'id')::uuid),
   case when TG_OP='INSERT' then null else to_jsonb(OLD) end,
   case when TG_OP='DELETE' then null else to_jsonb(NEW) end);
 return coalesce(NEW,OLD);
end $$;
create policy "authenticated audit writes" on public.audit_logs for insert to authenticated with check (user_id=(select auth.uid()));
create trigger audit_equipment after insert or update on public.equipment for each row execute function public.write_audit_log();
create trigger audit_borrow after insert or update on public.borrow_transactions for each row execute function public.write_audit_log();
create trigger audit_transfer after insert or update on public.transfer_transactions for each row execute function public.write_audit_log();
create trigger audit_maintenance after insert or update on public.maintenance_records for each row execute function public.write_audit_log();

create view public.v_equipment_summary with (security_invoker=true) as
 select status,count(*)::bigint as total from public.equipment where is_active group by status;
create view public.v_equipment_by_location with (security_invoker=true) as
 select l.id as location_id,l.location_name,count(e.id)::bigint as total,
 count(e.id) filter(where e.status='AVAILABLE')::bigint as available,
 count(e.id) filter(where e.status='BORROWED')::bigint as borrowed,
 count(e.id) filter(where e.status in ('REPAIRING','UNAVAILABLE'))::bigint as needs_attention
 from public.locations l left join public.equipment e on e.location_id=l.id and e.is_active group by l.id,l.location_name;
create view public.v_equipment_by_category with (security_invoker=true) as
 select c.id as category_id,c.category_name,count(e.id)::bigint as total from public.equipment_categories c
 left join public.equipment e on e.category_id=c.id and e.is_active group by c.id,c.category_name;
create view public.v_borrowing_summary with (security_invoker=true) as select status,count(*)::bigint as total from public.borrow_transactions group by status;
create view public.v_maintenance_summary with (security_invoker=true) as
 select status,count(*)::bigint as total,coalesce(sum(cost),0)::numeric as total_cost from public.maintenance_records group by status;

grant select,insert,update on public.organizations,public.locations,public.equipment_categories,public.user_profiles,public.equipment,
 public.distribution_transactions,public.transfer_transactions,public.borrow_transactions,public.maintenance_records,public.inspection_records,public.notifications to authenticated;
grant select on public.audit_logs,public.v_equipment_summary,public.v_equipment_by_location,public.v_equipment_by_category,public.v_borrowing_summary,public.v_maintenance_summary to authenticated;
grant insert on public.audit_logs to authenticated;
