create table if not exists public.user_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan text not null check (plan in ('plus', 'annual')),
  status text not null default 'active',
  stripe_customer_id text,
  stripe_subscription_id text unique,
  stripe_payment_link_id text,
  stripe_checkout_session_id text unique,
  encrypted_customer_email jsonb,
  encrypted_customer_name jsonb,
  current_period_end timestamptz,
  last_event_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists user_subscriptions_user_id_key
on public.user_subscriptions(user_id);

create index if not exists user_subscriptions_user_status_idx
on public.user_subscriptions(user_id, status);

alter table public.user_subscriptions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_subscriptions'
      and policyname = 'Users can read own subscription'
  ) then
    create policy "Users can read own subscription"
    on public.user_subscriptions for select
    using (auth.uid() = user_id);
  end if;
end $$;

create table if not exists public.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now()
);

alter table public.stripe_webhook_events enable row level security;

notify pgrst, 'reload schema';
