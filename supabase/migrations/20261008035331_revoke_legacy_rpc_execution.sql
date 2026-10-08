-- Keep the project-level RLS auto-enable event trigger, but prevent invocation through the exposed public API.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
