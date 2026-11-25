-- Hush Island: what the island remembers. Run this once in a new Supabase project (SQL Editor),
-- then put the project's URL and publishable key into src/config.js.
--
-- Each collection is a table of (id, at, d): d holds the record itself.
-- Visitors are guests with no accounts, so the rules below are about shape and size, not about who you are.
-- Anyone can read. Anyone can add a record of the right shape. Nothing can be edited except a bottle
-- being answered, and nothing can be deleted except a bottle whose answer has been read.

create table if not exists public.carvings (id uuid primary key default gen_random_uuid(), at bigint not null, d jsonb not null);
create table if not exists public.bottles  (id uuid primary key default gen_random_uuid(), at bigint not null, d jsonb not null);
create table if not exists public.boat     (id uuid primary key default gen_random_uuid(), at bigint not null, d jsonb not null);
create index if not exists carvings_at on public.carvings (at desc);
create index if not exists boat_at on public.boat (at desc);
create index if not exists bottles_state on public.bottles ((d->>'state'));
create index if not exists bottles_from on public.bottles ((d->>'from'));

alter table public.carvings enable row level security;
alter table public.bottles  enable row level security;
alter table public.boat     enable row level security;

grant select, insert on public.carvings to anon, authenticated;
grant select, insert on public.boat to anon, authenticated;
grant select, insert, update, delete on public.bottles to anon, authenticated;

-- Marks on the driftwood: up to 60 characters.
create policy "read marks" on public.carvings for select using (true);
create policy "leave a mark" on public.carvings for insert with check (
  jsonb_typeof(d) = 'object' and char_length(d->>'text') between 1 and 60 and octet_length(d::text) < 600
);

-- Planks for the boat: one or two at a time.
create policy "read planks" on public.boat for select using (true);
create policy "add planks" on public.boat for insert with check (
  jsonb_typeof(d) = 'object' and (d->>'n') in ('1', '2') and octet_length(d::text) < 300
);

-- Bottles: thrown adrift, answered once, removed when the answer has been read.
create policy "read bottles" on public.bottles for select using (true);
create policy "throw a bottle" on public.bottles for insert with check (
  jsonb_typeof(d) = 'object' and d->>'state' = 'adrift' and char_length(d->>'text') between 1 and 140 and octet_length(d::text) < 900
);
create policy "answer a bottle" on public.bottles for update using (d->>'state' = 'adrift') with check (
  d->>'state' = 'replied' and char_length(d->>'reply') between 1 and 140 and octet_length(d::text) < 1400
);
create policy "finish a bottle" on public.bottles for delete using (d->>'state' = 'replied');

-- ---------------------------------------------------------------------------------------------------------------
-- People, friends, notes, feedback and reports (migration "friends_notes_feedback_reports", applied 25 Nov 2026).
-- Tables: profiles, friends, friend_asks, friend_notes, feedback, reports. Row level security is on with no
-- policies, so browsers cannot touch them. The island's room (the Worker) reads and writes them through the
-- hi_* functions, using the project's secret key held in the Worker secret SUPABASE_SECRET_KEY:
--   hi_remember, hi_friends_of, hi_are_friends, hi_befriend, hi_unfriend,
--   hi_leave_note, hi_take_notes, hi_feedback, hi_report, hi_keeper
-- The full SQL is in the project's migration history (Supabase dashboard, Database, Migrations).
