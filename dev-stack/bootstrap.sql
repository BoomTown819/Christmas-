-- Recreates the roles and schemas a hosted Supabase project already has.
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
create role authenticator login noinherit password 'authpw';
grant anon, authenticated, service_role to authenticator;
create role supabase_auth_admin login createrole password 'authpw';
create schema auth authorization supabase_auth_admin;
grant usage on schema auth to anon, authenticated, service_role;
alter role supabase_auth_admin set search_path = auth;
grant create on database postgres to supabase_auth_admin;
create schema extensions;
create extension pgcrypto with schema extensions;
grant usage on schema extensions to anon, authenticated, service_role, supabase_auth_admin;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
