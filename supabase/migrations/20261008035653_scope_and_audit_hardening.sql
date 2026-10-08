drop policy "active users read organizations" on public.organizations;
create policy "users read organization in scope" on public.organizations for select to authenticated using (private.can_view_all() or id=(select private.current_org()));
drop policy "users read locations in scope" on public.locations;
create policy "users read locations in scope" on public.locations for select to authenticated using (private.can_view_all() or id=(select private.current_location()));

-- Audit rows are written by trusted table triggers only, never directly by a browser client.
alter function public.write_audit_log() security definer;
alter function public.write_audit_log() set search_path = '';
alter function public.write_audit_log() set schema private;
revoke all on function private.write_audit_log() from public,anon,authenticated;
drop policy "authenticated audit writes" on public.audit_logs;
revoke insert,update,delete on public.audit_logs from anon,authenticated;
create trigger audit_distribution after insert on public.distribution_transactions for each row execute function private.write_audit_log();
create trigger audit_inspection after insert on public.inspection_records for each row execute function private.write_audit_log();

-- Master records and transaction history use soft-deactivation or new events, not physical deletion.
revoke delete on public.organizations,public.locations,public.equipment_categories,public.user_profiles from anon,authenticated;
