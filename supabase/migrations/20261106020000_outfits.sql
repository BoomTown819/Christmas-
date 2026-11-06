-- What each character wears (hat, top, pants, shoes, scarf, mittens).
alter table public.characters add column outfit jsonb not null default '{}'::jsonb
  check (jsonb_typeof(outfit) = 'object' and pg_column_size(outfit) < 2000);
