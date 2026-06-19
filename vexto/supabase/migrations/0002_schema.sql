-- Vexto — relational schema.
-- All geometries use SRID 4326 (WGS84 lon/lat).

-- Reusable updated_at trigger -------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- profiles --------------------------------------------------------------------
-- One row per auth user. Aggregated gamification counters live here for fast
-- leaderboard reads (kept in sync by trip triggers).
create table if not exists public.profiles (
  id                 uuid primary key references auth.users (id) on delete cascade,
  email              text,
  full_name          text,
  avatar_url         text,
  cumulative_points  integer not null default 0 check (cumulative_points >= 0),
  current_co2_saved  numeric(12, 3) not null default 0 check (current_co2_saved >= 0),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- transit_operators -----------------------------------------------------------
-- Official transit lines (from GTFS / national open data). `route` is the
-- canonical line geometry used by the anti-cheat check.
create table if not exists public.transit_operators (
  id          uuid primary key default extensions.uuid_generate_v4 (),
  name        text not null,
  mode        text not null default 'publicTransit',
  gtfs_ref    text,
  route       geometry(LineString, 4326),
  created_at  timestamptz not null default now()
);

create index if not exists idx_transit_operators_route
  on public.transit_operators using gist (route);

-- trips -----------------------------------------------------------------------
create table if not exists public.trips (
  id                  uuid primary key default extensions.uuid_generate_v4 (),
  user_id             uuid not null references public.profiles (id) on delete cascade,
  mode                text not null check (mode in
                        ('carThermal','publicTransit','bike','eScooter','walk')),
  start_location      geometry(Point, 4326),
  end_location        geometry(Point, 4326),
  gps_track           geometry(LineString, 4326),
  distance_km         numeric(8, 3) not null check (distance_km >= 0),
  co2_saved_kg        numeric(10, 3) not null default 0 check (co2_saved_kg >= 0),
  points_awarded      integer not null default 0 check (points_awarded >= 0),
  verified_by_postgis boolean not null default false,
  transit_operator_id uuid references public.transit_operators (id) on delete set null,
  status              text not null default 'pending'
                        check (status in ('pending','verified','rejected')),
  created_at          timestamptz not null default now()
);

create index if not exists idx_trips_user_id on public.trips (user_id);
create index if not exists idx_trips_track on public.trips using gist (gps_track);

-- friendships -----------------------------------------------------------------
-- Stored once per pair with user_id_1 < user_id_2 to avoid duplicates.
create table if not exists public.friendships (
  id          uuid primary key default extensions.uuid_generate_v4 (),
  user_id_1   uuid not null references public.profiles (id) on delete cascade,
  user_id_2   uuid not null references public.profiles (id) on delete cascade,
  status      text not null default 'pending'
                check (status in ('pending','accepted','blocked')),
  requested_by uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint friendships_distinct check (user_id_1 <> user_id_2),
  constraint friendships_ordered check (user_id_1 < user_id_2),
  unique (user_id_1, user_id_2)
);

-- rewards ---------------------------------------------------------------------
create table if not exists public.rewards (
  id              uuid primary key default extensions.uuid_generate_v4 (),
  brand_name      text not null,
  title           text not null,
  voucher_code    text,
  points_cost     integer not null check (points_cost > 0),
  expiration_date date,
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);

-- redemptions -----------------------------------------------------------------
create table if not exists public.redemptions (
  id          uuid primary key default extensions.uuid_generate_v4 (),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  reward_id   uuid not null references public.rewards (id) on delete restrict,
  points_spent integer not null check (points_spent > 0),
  created_at  timestamptz not null default now()
);

create index if not exists idx_redemptions_user_id on public.redemptions (user_id);
