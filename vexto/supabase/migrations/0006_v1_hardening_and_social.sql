-- Vexto 0006 — v1: anti-cheat hardening, privacy, rewards redemption, friends.
--
-- Fixes found during the v1 audit:
--   * Clients could UPDATE their own profile counters (cumulative_points…) and
--     their own trips (points_awarded, status…) directly through the REST API.
--   * verify_trip() could be called several times on the same trip (points
--     awarded on every call) and trusted the client-provided distance_km.
--   * Transit trips never sent a transit_operator_id, so they were ALWAYS
--     rejected. They are now matched automatically against the official lines.
--   * Every user's email (profiles) and every voucher code (rewards) were
--     readable by any signed-in user.
--   * Redemptions could be inserted without spending any points.
--   * Friend requests could be self-accepted.
--
-- Safe to run once on top of 0001–0005. The mobile app works both before and
-- after this migration (it degrades gracefully when a feature is missing).

-- ---------------------------------------------------------------------------
-- 1. Profiles: spendable balance + column-level privileges
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists spent_points integer not null default 0;

alter table public.profiles drop constraint if exists profiles_spent_points_valid;
alter table public.profiles
  add constraint profiles_spent_points_valid
  check (spent_points >= 0 and spent_points <= cumulative_points);

-- Clients may read public profile fields (leaderboard) but never the email, and
-- may only edit their display name / avatar. Counters are written exclusively
-- by SECURITY DEFINER functions (verify_trip, redeem_reward).
revoke all on public.profiles from anon, authenticated;
grant select (id, full_name, avatar_url, cumulative_points, current_co2_saved,
              spent_points, created_at, updated_at)
  on public.profiles to authenticated;
grant update (full_name, avatar_url) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Trips: timestamps, rejection reason, write-once from the client
-- ---------------------------------------------------------------------------
alter table public.trips
  add column if not exists started_at timestamptz,
  add column if not exists ended_at timestamptz,
  add column if not exists rejection_reason text;

alter table public.trips drop constraint if exists trips_time_order;
alter table public.trips
  add constraint trips_time_order
  check (started_at is null or ended_at is null or ended_at >= started_at) not valid;

alter table public.trips drop constraint if exists trips_distance_sane;
alter table public.trips
  add constraint trips_distance_sane check (distance_km <= 2000) not valid;

create index if not exists idx_trips_user_created
  on public.trips (user_id, created_at desc);

-- A trip is inserted once (status/points use their defaults) and then only
-- modified by verify_trip(). No client-side UPDATE/DELETE.
drop policy if exists "trips_update_own" on public.trips;
revoke all on public.trips from anon, authenticated;
grant select on public.trips to authenticated;
grant insert (user_id, mode, start_location, end_location, gps_track,
              distance_km, transit_operator_id, started_at, ended_at)
  on public.trips to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Transit anti-cheat helpers
-- ---------------------------------------------------------------------------
-- Share (0..1) of the GPS track vertices lying within `p_buffer_m` metres of
-- ANY official transit line. Robust to line changes (metro → RER) and to the
-- short walks to/from stations, unlike a single-line containment test.
create or replace function public.transit_track_coverage(
  p_track    geometry,
  p_buffer_m double precision default 30
)
returns double precision
language sql
stable
security definer
set search_path = public, extensions
as $$
  with pts as (
    select dp.geom as g
    from ST_DumpPoints(p_track) as dp
  ),
  hits as (
    select exists (
      select 1
      from public.transit_operators o
      where o.route is not null
        and o.route && ST_Expand(pts.g, 0.002)            -- bbox prefilter (~150–220 m)
        and ST_DWithin(o.route::geography, pts.g::geography, p_buffer_m)
    ) as near
    from pts
  )
  select coalesce(avg(case when near then 1.0 else 0.0 end), 0)::double precision
  from hits;
$$;

-- The official line that matches the most track vertices (null if none).
create or replace function public.match_transit_operator(
  p_track    geometry,
  p_buffer_m double precision default 30
)
returns uuid
language sql
stable
security definer
set search_path = public, extensions
as $$
  select o.id
  from public.transit_operators o
  cross join lateral ST_DumpPoints(p_track) as dp
  where o.route is not null
    and o.route && ST_Expand(dp.geom, 0.002)
    and ST_DWithin(o.route::geography, dp.geom::geography, p_buffer_m)
  group by o.id
  order by count(*) desc
  limit 1;
$$;

revoke execute on function public.transit_track_coverage(geometry, double precision)
  from public, anon, authenticated;
revoke execute on function public.match_transit_operator(geometry, double precision)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. verify_trip v2 — idempotent, distance from the GPS track, plausibility
-- ---------------------------------------------------------------------------
-- Rejection reasons (trips.rejection_reason), translated by the app:
--   no_track             no usable GPS trace
--   invalid_duration     end before start
--   too_fast             average speed impossible for the declared mode
--   off_transit_network  trace does not follow an official transit line
create or replace function public.verify_trip(p_trip_id uuid)
returns public.trips
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  c_fe_car       constant numeric := 0.218;  -- ADEME: voiture thermique individuelle
  c_daily_cap    constant integer := 500;    -- max points per user per day (anti-abuse)
  c_min_coverage constant double precision := 0.6;
  v_trip      public.trips;
  v_fe_mode   numeric;
  v_km        numeric := 0;
  v_saved     numeric := 0;
  v_points    integer := 0;
  v_today_pts integer := 0;
  v_ok        boolean := true;
  v_reason    text;
  v_hours     numeric;
  v_max_kmh   numeric;
  v_operator  uuid;
begin
  select * into v_trip from public.trips where id = p_trip_id for update;
  if not found then
    raise exception 'Trip % not found', p_trip_id;
  end if;

  -- Caller must own the trip (the service role may verify on a user's behalf).
  if v_trip.user_id is distinct from auth.uid()
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Not authorized to verify this trip';
  end if;

  -- Idempotent: points are awarded at most once per trip.
  if v_trip.status <> 'pending' then
    return v_trip;
  end if;

  v_fe_mode := case v_trip.mode
    when 'carThermal'    then 0.218
    when 'publicTransit' then 0.010
    when 'eScooter'      then 0.025
    else 0.0  -- bike, walk
  end;

  -- Never trust the declared distance: use the recorded track (+5 % GPS
  -- tolerance), capped by what the client declared.
  if v_trip.gps_track is null or ST_NPoints(v_trip.gps_track) < 2 then
    v_ok := false;
    v_reason := 'no_track';
  else
    v_km := least(
      v_trip.distance_km,
      (ST_Length(v_trip.gps_track::geography) / 1000.0 * 1.05)::numeric
    );
  end if;

  -- Speed plausibility when the app sent start/end timestamps.
  if v_ok and v_trip.started_at is not null and v_trip.ended_at is not null then
    v_hours := extract(epoch from (v_trip.ended_at - v_trip.started_at)) / 3600.0;
    v_max_kmh := case v_trip.mode
      when 'walk'          then 12
      when 'bike'          then 45
      when 'eScooter'      then 35
      when 'publicTransit' then 200
      else 250
    end;
    if v_hours <= 0 then
      v_ok := false;
      v_reason := 'invalid_duration';
    elsif v_km / v_hours > v_max_kmh then
      v_ok := false;
      v_reason := 'too_fast';
    end if;
  end if;

  -- Geo anti-cheat for collective transit.
  if v_ok and v_trip.mode = 'publicTransit' then
    if v_trip.transit_operator_id is not null then
      v_ok := public.validate_trip_geo(v_trip.gps_track, v_trip.transit_operator_id, 20);
      v_operator := v_trip.transit_operator_id;
    else
      v_ok := public.transit_track_coverage(v_trip.gps_track, 30) >= c_min_coverage;
      v_operator := public.match_transit_operator(v_trip.gps_track, 30);
    end if;
    if not v_ok then
      v_reason := 'off_transit_network';
    end if;
  end if;

  if v_ok then
    v_saved  := greatest(0, (c_fe_car - v_fe_mode) * v_km);
    v_points := round(v_saved * 10);  -- 1 point = 100 g of CO2e avoided

    select coalesce(sum(points_awarded), 0)::integer
      into v_today_pts
      from public.trips
     where user_id = v_trip.user_id
       and status = 'verified'
       and created_at >= date_trunc('day', now());
    v_points := least(v_points, greatest(0, c_daily_cap - v_today_pts));
  end if;

  update public.trips
     set distance_km         = case when v_ok then round(v_km, 3) else distance_km end,
         co2_saved_kg        = round(v_saved, 3),
         points_awarded      = v_points,
         verified_by_postgis = (v_ok and mode = 'publicTransit'),
         transit_operator_id = coalesce(transit_operator_id, v_operator),
         status              = case when v_ok then 'verified' else 'rejected' end,
         rejection_reason    = v_reason
   where id = p_trip_id
   returning * into v_trip;

  if v_ok then
    update public.profiles
       set cumulative_points = cumulative_points + v_points,
           current_co2_saved = current_co2_saved + round(v_saved, 3)
     where id = v_trip.user_id;
  end if;

  return v_trip;
end;
$$;

revoke execute on function public.verify_trip(uuid) from public, anon;
grant execute on function public.verify_trip(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Rewards: hide voucher codes, redeem through a single atomic function
-- ---------------------------------------------------------------------------
alter table public.redemptions
  add column if not exists voucher_code text,
  add column if not exists reward_title text,
  add column if not exists brand_name   text;

revoke all on public.rewards from anon, authenticated;
grant select (id, brand_name, title, points_cost, expiration_date, active, created_at)
  on public.rewards to authenticated;

drop policy if exists "redemptions_insert_own" on public.redemptions;
revoke all on public.redemptions from anon, authenticated;
grant select on public.redemptions to authenticated;

create or replace function public.redeem_reward(p_reward_id uuid)
returns public.redemptions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me      uuid := auth.uid();
  v_reward  public.rewards;
  v_profile public.profiles;
  v_row     public.redemptions;
begin
  if v_me is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_reward from public.rewards where id = p_reward_id and active;
  if not found then
    raise exception 'reward_unavailable';
  end if;
  if v_reward.expiration_date is not null and v_reward.expiration_date < current_date then
    raise exception 'reward_expired';
  end if;

  select * into v_profile from public.profiles where id = v_me for update;
  if not found then
    raise exception 'profile_not_found';
  end if;
  if v_profile.cumulative_points - v_profile.spent_points < v_reward.points_cost then
    raise exception 'insufficient_points';
  end if;

  update public.profiles
     set spent_points = spent_points + v_reward.points_cost
   where id = v_me;

  insert into public.redemptions
    (user_id, reward_id, points_spent, voucher_code, reward_title, brand_name)
  values
    (v_me, v_reward.id, v_reward.points_cost, v_reward.voucher_code,
     v_reward.title, v_reward.brand_name)
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function public.redeem_reward(uuid) from public, anon;
grant execute on function public.redeem_reward(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Friends: shareable 8-character code, consent-based requests
-- ---------------------------------------------------------------------------
create or replace function public.friend_code(p_id uuid)
returns text
language sql
immutable
set search_path = public
as $$
  select upper(substr(replace(p_id::text, '-', ''), 1, 8));
$$;

create index if not exists idx_profiles_friend_code
  on public.profiles (public.friend_code(id));

-- Friendships are now written only through the functions below.
drop policy if exists "friendships_insert_involved" on public.friendships;
drop policy if exists "friendships_update_involved" on public.friendships;
revoke all on public.friendships from anon, authenticated;
grant select on public.friendships to authenticated;

create or replace function public.send_friend_request(p_code text)
returns public.friendships
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me    uuid := auth.uid();
  v_code  text := upper(regexp_replace(coalesce(p_code, ''), '[^0-9A-Fa-f]', '', 'g'));
  v_ids   uuid[];
  v_other uuid;
  v_row   public.friendships;
begin
  if v_me is null then
    raise exception 'not_authenticated';
  end if;
  if length(v_code) <> 8 then
    raise exception 'invalid_code';
  end if;

  select array_agg(id) into v_ids
    from public.profiles
   where public.friend_code(id) = v_code;

  if v_ids is null then
    raise exception 'code_not_found';
  end if;
  if array_length(v_ids, 1) > 1 then
    raise exception 'code_ambiguous';
  end if;
  v_other := v_ids[1];
  if v_other = v_me then
    raise exception 'cannot_add_self';
  end if;

  select * into v_row
    from public.friendships
   where user_id_1 = least(v_me, v_other)
     and user_id_2 = greatest(v_me, v_other)
   for update;

  if found then
    if v_row.status = 'blocked' then
      raise exception 'blocked';
    end if;
    -- The other person had already invited me: adding them back accepts.
    if v_row.status = 'pending' and v_row.requested_by is distinct from v_me then
      update public.friendships set status = 'accepted'
       where id = v_row.id
       returning * into v_row;
    end if;
    return v_row;
  end if;

  insert into public.friendships (user_id_1, user_id_2, status, requested_by)
  values (least(v_me, v_other), greatest(v_me, v_other), 'pending', v_me)
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.respond_friend_request(
  p_friendship_id uuid,
  p_accept        boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me  uuid := auth.uid();
  v_row public.friendships;
begin
  select * into v_row from public.friendships where id = p_friendship_id for update;
  if not found or (v_row.user_id_1 is distinct from v_me and v_row.user_id_2 is distinct from v_me) then
    raise exception 'request_not_found';
  end if;
  if v_row.status <> 'pending' then
    return;
  end if;
  if v_row.requested_by = v_me then
    raise exception 'cannot_answer_own_request';
  end if;

  if p_accept then
    update public.friendships set status = 'accepted' where id = v_row.id;
  else
    delete from public.friendships where id = v_row.id;
  end if;
end;
$$;

create or replace function public.remove_friend(p_friend_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'not_authenticated';
  end if;
  delete from public.friendships
   where user_id_1 = least(v_me, p_friend_id)
     and user_id_2 = greatest(v_me, p_friend_id)
     and status <> 'blocked';
end;
$$;

revoke execute on function public.send_friend_request(text) from public, anon;
revoke execute on function public.respond_friend_request(uuid, boolean) from public, anon;
revoke execute on function public.remove_friend(uuid) from public, anon;
grant execute on function public.send_friend_request(text) to authenticated;
grant execute on function public.respond_friend_request(uuid, boolean) to authenticated;
grant execute on function public.remove_friend(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Period leaderboard (e.g. "this week"), optionally limited to some users
-- ---------------------------------------------------------------------------
create or replace function public.leaderboard_since(
  p_since    timestamptz,
  p_limit    integer default 50,
  p_user_ids uuid[]  default null
)
returns table (
  id         uuid,
  full_name  text,
  avatar_url text,
  points     bigint,
  co2_saved  numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id,
         p.full_name,
         p.avatar_url,
         coalesce(sum(t.points_awarded), 0)::bigint as points,
         coalesce(sum(t.co2_saved_kg), 0)::numeric  as co2_saved
    from public.profiles p
    left join public.trips t
      on t.user_id = p.id
     and t.status = 'verified'
     and t.created_at >= p_since
   where p_user_ids is null or p.id = any (p_user_ids)
   group by p.id
   order by points desc, p.full_name asc nulls last
   limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

revoke execute on function public.leaderboard_since(timestamptz, integer, uuid[]) from public, anon;
grant execute on function public.leaderboard_since(timestamptz, integer, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. (Optional) demo rewards to test the redemption flow end-to-end.
-- ---------------------------------------------------------------------------
-- insert into public.rewards (brand_name, title, voucher_code, points_cost)
-- values ('Café partenaire', 'Une boisson chaude offerte', 'VEXTO-CAFE', 250),
--        ('Atelier vélo',    'Révision vélo à -50 %',      'VEXTO-VELO', 900);
