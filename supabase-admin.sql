create table if not exists public.audios (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  category text not null,
  duration_minutes integer not null check (duration_minutes > 0),
  audio_url text not null,
  storage_provider text not null default 'r2',
  object_key text,
  cover_style text not null default 'card-night',
  is_published boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.audios enable row level security;

create policy "Published audios are public"
on public.audios for select
using (is_published = true);

create policy "Admins can select audios"
on public.audios for select
using (
  auth.jwt() ->> 'email' in ('admin@horizon.pt')
);

create policy "Admins can insert audios"
on public.audios for insert
with check (
  auth.jwt() ->> 'email' in ('admin@horizon.pt')
);

create policy "Admins can update audios"
on public.audios for update
using (
  auth.jwt() ->> 'email' in ('admin@horizon.pt')
)
with check (
  auth.jwt() ->> 'email' in ('admin@horizon.pt')
);

create policy "Admins can delete audios"
on public.audios for delete
using (
  auth.jwt() ->> 'email' in ('admin@horizon.pt')
);

alter table public.audios add column if not exists storage_provider text not null default 'r2';
alter table public.audios add column if not exists object_key text;
