-- Vexto — Row Level Security.
-- Principle: a user only ever reads/writes their own rows. Leaderboard data is
-- exposed through a SECURITY DEFINER view with a curated public projection.

alter table public.profiles       enable row level security;
alter table public.trips          enable row level security;
alter table public.friendships    enable row level security;
alter table public.rewards        enable row level security;
alter table public.redemptions    enable row level security;
alter table public.transit_operators enable row level security;

-- profiles --------------------------------------------------------------------
create policy "profiles_select_authenticated"
  on public.profiles for select
  to authenticated
  using (true); -- needed for friends & leaderboard display

create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- trips -----------------------------------------------------------------------
create policy "trips_select_own"
  on public.trips for select
  to authenticated
  using (auth.uid() = user_id);

create policy "trips_insert_own"
  on public.trips for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "trips_update_own"
  on public.trips for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- friendships -----------------------------------------------------------------
create policy "friendships_select_involved"
  on public.friendships for select
  to authenticated
  using (auth.uid() = user_id_1 or auth.uid() = user_id_2);

create policy "friendships_insert_involved"
  on public.friendships for insert
  to authenticated
  with check (auth.uid() = user_id_1 or auth.uid() = user_id_2);

create policy "friendships_update_involved"
  on public.friendships for update
  to authenticated
  using (auth.uid() = user_id_1 or auth.uid() = user_id_2)
  with check (auth.uid() = user_id_1 or auth.uid() = user_id_2);

-- rewards (public catalogue, read-only for clients) ---------------------------
create policy "rewards_select_all"
  on public.rewards for select
  to authenticated
  using (active = true);

-- redemptions -----------------------------------------------------------------
create policy "redemptions_select_own"
  on public.redemptions for select
  to authenticated
  using (auth.uid() = user_id);

create policy "redemptions_insert_own"
  on public.redemptions for insert
  to authenticated
  with check (auth.uid() = user_id);

-- transit_operators (public reference data) -----------------------------------
create policy "transit_operators_select_all"
  on public.transit_operators for select
  to authenticated
  using (true);
