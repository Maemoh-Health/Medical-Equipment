-- Supabase defaults may grant table privileges to anon; RLS still applies, and this removes the public API surface entirely.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
