-- The admin-invite-user Edge Function updates profiles with the service role.
-- Its update trigger calls private.can_manage(), so grant only the backend role
-- access to that schema and function. The service key is never exposed to clients.
grant usage on schema private to service_role;
grant execute on function private.can_manage() to service_role;
