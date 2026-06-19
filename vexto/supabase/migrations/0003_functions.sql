-- Vexto — domain functions (profile bootstrap, anti-cheat, trip verification).

-- Auto-create a profile row whenever a new auth user signs up. -----------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_on_auth_user_created on auth.users;
create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Anti-cheat: does the user's GPS track follow the official transit route? -----
-- Returns true when every recorded point lies within `buffer_m` metres of the
-- operator's line geometry. Uses geography casts so the buffer is in metres.
create or replace function public.validate_trip_geo(
  p_track       geometry,
  p_operator_id uuid,
  p_buffer_m    double precision default 20
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_route geometry;
begin
  if p_track is null or p_operator_id is null then
    return false;
  end if;

  select route into v_route
  from public.transit_operators
  where id = p_operator_id;

  if v_route is null then
    return false;
  end if;

  -- The whole track must stay within the buffer of the official route.
  -- ST_DWithin on geography measures the shortest distance in metres; we
  -- additionally require containment so a single matching point can't pass.
  return ST_DWithin(p_track::geography, v_route::geography, p_buffer_m)
     and ST_Within(p_track, ST_Buffer(v_route::geography, p_buffer_m)::geometry);
end;
$$;

-- Verify a trip and award points atomically. ----------------------------------
-- Recomputes CO2 saved server-side (never trust the client) using ADEME values,
-- runs the geo check for transit trips, and updates the profile counters.
create or replace function public.verify_trip(p_trip_id uuid)
returns public.trips
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_trip       public.trips;
  v_fe_car     numeric := 0.218;  -- ADEME: voiture thermique individuelle
  v_fe_mode    numeric;
  v_saved      numeric;
  v_points     integer;
  v_geo_ok     boolean := true;
begin
  select * into v_trip from public.trips where id = p_trip_id for update;
  if not found then
    raise exception 'Trip % not found', p_trip_id;
  end if;

  -- Caller must own the trip.
  if v_trip.user_id <> auth.uid() then
    raise exception 'Not authorized to verify this trip';
  end if;

  v_fe_mode := case v_trip.mode
    when 'carThermal'    then 0.218
    when 'publicTransit' then 0.010
    when 'eScooter'      then 0.025
    else 0.0  -- bike, walk
  end;

  v_saved  := greatest(0, (v_fe_car - v_fe_mode) * v_trip.distance_km);
  v_points := round(v_saved * 10);  -- 1 point = 100 g saved

  -- Geo anti-cheat only applies to collective transit trips.
  if v_trip.mode = 'publicTransit' then
    v_geo_ok := public.validate_trip_geo(v_trip.gps_track, v_trip.transit_operator_id, 20);
  end if;

  update public.trips
     set co2_saved_kg        = v_saved,
         points_awarded      = case when v_geo_ok then v_points else 0 end,
         verified_by_postgis = v_geo_ok,
         status              = case when v_geo_ok then 'verified' else 'rejected' end
   where id = p_trip_id
   returning * into v_trip;

  -- Keep profile aggregates in sync for fast leaderboard reads.
  if v_geo_ok then
    update public.profiles
       set cumulative_points = cumulative_points + v_points,
           current_co2_saved = current_co2_saved + v_saved
     where id = v_trip.user_id;
  end if;

  return v_trip;
end;
$$;
