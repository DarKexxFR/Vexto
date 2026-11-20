-- Behavioural tests for migration 0006 (run by run.sh as the postgres superuser,
-- then impersonating API roles). Any failure raises and stops the script.
\set ON_ERROR_STOP 1

-- Fixtures ---------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'alice@test.fr', '{"full_name":"Alice"}'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'bob@test.fr',   '{"full_name":"Bob"}'),
  ('cccccccc-0000-4000-8000-000000000003', 'chloe@test.fr', '{"name":"Chloé"}');

insert into public.transit_operators (name, gtfs_ref, route) values
  ('Métro test', 'TEST:1',
   ST_GeomFromText('LINESTRING(2.33 48.86, 2.35 48.86, 2.37 48.86)', 4326));

insert into public.rewards (brand_name, title, voucher_code, points_cost) values
  ('Café', 'Boisson offerte', 'SECRET-CODE', 5),
  ('Luxe', 'Gros lot', 'BIG-CODE', 100000);

do $$ begin
  if (select count(*) from public.profiles) <> 3 then
    raise exception 'FAIL: profiles not bootstrapped by trigger';
  end if;
end $$;

-- Become Alice -----------------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', false);
select set_config('request.jwt.claim.role', 'authenticated', false);

-- 1. Profile privacy + counters are read-only
do $$ begin
  begin
    perform email from public.profiles limit 1;
    raise exception 'FAIL: emails are readable';
  exception when insufficient_privilege then raise notice 'ok  emails hidden'; end;

  begin
    update public.profiles set cumulative_points = 999999 where id = auth.uid();
    raise exception 'FAIL: cumulative_points writable';
  exception when insufficient_privilege then raise notice 'ok  points not writable'; end;

  begin
    update public.profiles set spent_points = 0 where id = auth.uid();
    raise exception 'FAIL: spent_points writable';
  exception when insufficient_privilege then raise notice 'ok  spent_points not writable'; end;

  update public.profiles set full_name = 'Alice V.' where id = auth.uid();
  if (select full_name from public.profiles where id = auth.uid()) <> 'Alice V.' then
    raise exception 'FAIL: cannot rename myself';
  end if;

  update public.profiles set full_name = 'hacked' where id = 'bbbbbbbb-0000-4000-8000-000000000002';
  if (select full_name from public.profiles where id = 'bbbbbbbb-0000-4000-8000-000000000002') = 'hacked' then
    raise exception 'FAIL: renamed someone else';
  end if;
  raise notice 'ok  rename own profile only';

  perform id, full_name, cumulative_points, spent_points from public.profiles;
  raise notice 'ok  leaderboard columns readable';
end $$;

-- 2. Trips cannot be forged
do $$ begin
  begin
    insert into public.trips (user_id, mode, distance_km, status, points_awarded)
    values (auth.uid(), 'bike', 1, 'verified', 1000);
    raise exception 'FAIL: inserted a pre-verified trip';
  exception when insufficient_privilege then raise notice 'ok  cannot insert verified trip'; end;

  begin
    insert into public.trips (user_id, mode, distance_km)
    values ('bbbbbbbb-0000-4000-8000-000000000002', 'bike', 1);
    raise exception 'FAIL: inserted a trip for someone else';
  exception when insufficient_privilege then raise notice 'ok  cannot insert for others'; end;
end $$;

-- 3. Bike trip: distance from the GPS track, verify is idempotent
do $$
declare t public.trips; before_pts int; after_pts int;
begin
  select cumulative_points into before_pts from public.profiles where id = auth.uid();
  insert into public.trips (user_id, mode, distance_km, gps_track, started_at, ended_at)
  values (auth.uid(), 'bike', 100,
          ST_GeomFromText('LINESTRING(2.30 48.85, 2.31 48.85, 2.32 48.85, 2.3273 48.85)', 4326),
          now() - interval '10 minutes', now())
  returning * into t;

  t := public.verify_trip(t.id);
  if t.status <> 'verified' then raise exception 'FAIL: bike rejected (%)', t.rejection_reason; end if;
  if t.distance_km not between 2.0 and 2.2 then
    raise exception 'FAIL: distance not taken from track: %', t.distance_km;
  end if;
  if t.points_awarded <> 5 then raise exception 'FAIL: bike points = %', t.points_awarded; end if;
  if t.verified_by_postgis then raise exception 'FAIL: bike flagged as postgis-verified'; end if;

  perform public.verify_trip(t.id);
  perform public.verify_trip(t.id);
  select cumulative_points into after_pts from public.profiles where id = auth.uid();
  if after_pts - before_pts <> 5 then
    raise exception 'FAIL: points awarded more than once (% -> %)', before_pts, after_pts;
  end if;
  raise notice 'ok  bike: % km, % pts, verify idempotent', t.distance_km, t.points_awarded;

  begin
    update public.trips set points_awarded = 9999 where id = t.id;
    raise exception 'FAIL: trip is writable';
  exception when insufficient_privilege then raise notice 'ok  trips not writable'; end;
end $$;

-- 4. Plausibility: too fast / no track / bad duration
do $$
declare t public.trips;
begin
  insert into public.trips (user_id, mode, distance_km, gps_track, started_at, ended_at)
  values (auth.uid(), 'walk', 2,
          ST_GeomFromText('LINESTRING(2.30 48.85, 2.3273 48.85)', 4326),
          now() - interval '1 minute', now())
  returning * into t;
  t := public.verify_trip(t.id);
  if t.status <> 'rejected' or t.rejection_reason <> 'too_fast' then
    raise exception 'FAIL: 120 km/h walk accepted (% / %)', t.status, t.rejection_reason;
  end if;
  raise notice 'ok  too fast walk rejected';

  insert into public.trips (user_id, mode, distance_km)
  values (auth.uid(), 'bike', 12) returning * into t;
  t := public.verify_trip(t.id);
  if t.status <> 'rejected' or t.rejection_reason <> 'no_track' or t.points_awarded <> 0 then
    raise exception 'FAIL: trip without track accepted';
  end if;
  raise notice 'ok  trip without GPS track rejected';

  begin
    insert into public.trips (user_id, mode, distance_km, gps_track, started_at, ended_at)
    values (auth.uid(), 'bike', 1, ST_GeomFromText('LINESTRING(2.30 48.85, 2.31 48.85)', 4326),
            now(), now() - interval '5 minutes');
    raise exception 'FAIL: end before start accepted';
  exception when check_violation then raise notice 'ok  end-before-start refused'; end;
end $$;

-- 5. Transit: auto-matched official line vs off-network trace
do $$
declare t public.trips; op uuid;
begin
  select id into op from public.transit_operators limit 1;

  insert into public.trips (user_id, mode, distance_km, gps_track, started_at, ended_at)
  values (auth.uid(), 'publicTransit', 3,
          ST_GeomFromText('LINESTRING(2.331 48.86001, 2.34 48.86002, 2.35 48.85999, 2.36 48.86001, 2.369 48.86)', 4326),
          now() - interval '15 minutes', now())
  returning * into t;
  t := public.verify_trip(t.id);
  if t.status <> 'verified' or not t.verified_by_postgis or t.transit_operator_id is distinct from op then
    raise exception 'FAIL: on-line transit trip not verified (% / % / %)', t.status, t.rejection_reason, t.transit_operator_id;
  end if;
  raise notice 'ok  transit on official line verified (% pts, operator matched)', t.points_awarded;

  insert into public.trips (user_id, mode, distance_km, gps_track, started_at, ended_at)
  values (auth.uid(), 'publicTransit', 3,
          ST_GeomFromText('LINESTRING(2.331 48.87, 2.34 48.87, 2.35 48.87, 2.369 48.87)', 4326),
          now() - interval '15 minutes', now())
  returning * into t;
  t := public.verify_trip(t.id);
  if t.status <> 'rejected' or t.rejection_reason <> 'off_transit_network' or t.points_awarded <> 0 then
    raise exception 'FAIL: off-network transit trip accepted';
  end if;
  raise notice 'ok  transit off the network rejected';

  -- Mostly on the line with a short walk at the end (4/5 vertices) -> accepted.
  insert into public.trips (user_id, mode, distance_km, gps_track, started_at, ended_at)
  values (auth.uid(), 'publicTransit', 3,
          ST_GeomFromText('LINESTRING(2.331 48.86, 2.34 48.86, 2.35 48.86, 2.36 48.86, 2.361 48.8625)', 4326),
          now() - interval '15 minutes', now())
  returning * into t;
  t := public.verify_trip(t.id);
  if t.status <> 'verified' then raise exception 'FAIL: 80%% coverage rejected'; end if;
  raise notice 'ok  transit with walk to the station verified';
end $$;

-- 6. Rewards: voucher codes hidden, atomic redemption
do $$
declare r public.redemptions; cheap uuid; pricey uuid; bal int;
begin
  begin
    perform voucher_code from public.rewards;
    raise exception 'FAIL: voucher codes readable';
  exception when insufficient_privilege then raise notice 'ok  voucher codes hidden'; end;

  select id into cheap from public.rewards where points_cost = 5;
  select id into pricey from public.rewards where points_cost = 100000;

  begin
    perform public.redeem_reward(pricey);
    raise exception 'FAIL: redeemed without enough points';
  exception when raise_exception then
    if sqlerrm <> 'insufficient_points' then raise; end if;
    raise notice 'ok  insufficient points refused';
  end;

  r := public.redeem_reward(cheap);
  if r.voucher_code <> 'SECRET-CODE' or r.points_spent <> 5 then
    raise exception 'FAIL: redemption result %', r;
  end if;
  select cumulative_points - spent_points into bal from public.profiles where id = auth.uid();
  raise notice 'ok  redeemed, voucher %, balance now %', r.voucher_code, bal;

  begin
    insert into public.redemptions (user_id, reward_id, points_spent) values (auth.uid(), cheap, 1);
    raise exception 'FAIL: direct redemption insert allowed';
  exception when insufficient_privilege then raise notice 'ok  direct redemption insert denied'; end;

  if (select count(*) from public.redemptions) <> 1 then
    raise exception 'FAIL: redemptions visibility';
  end if;
end $$;

-- 7. Friends: consent-based
do $$
declare f public.friendships;
begin
  f := public.send_friend_request('bbbbbbbb');   -- lower-case is normalised
  if f.status <> 'pending' or f.requested_by <> auth.uid() then
    raise exception 'FAIL: request %', f;
  end if;

  begin
    perform public.respond_friend_request(f.id, true);
    raise exception 'FAIL: accepted my own request';
  exception when raise_exception then
    if sqlerrm <> 'cannot_answer_own_request' then raise; end if;
    raise notice 'ok  cannot self-accept';
  end;

  begin
    update public.friendships set status = 'accepted' where id = f.id;
    raise exception 'FAIL: friendship writable';
  exception when insufficient_privilege then raise notice 'ok  friendships not writable'; end;

  begin
    insert into public.friendships (user_id_1, user_id_2, status)
    values ('aaaaaaaa-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000003', 'accepted');
    raise exception 'FAIL: friendship insert allowed';
  exception when insufficient_privilege then raise notice 'ok  friendship insert denied'; end;

  begin
    perform public.send_friend_request('AAAAAAAA');
    raise exception 'FAIL: added myself';
  exception when raise_exception then
    if sqlerrm <> 'cannot_add_self' then raise; end if;
    raise notice 'ok  cannot add self';
  end;

  begin
    perform public.send_friend_request('12345678');
    raise exception 'FAIL: unknown code accepted';
  exception when raise_exception then
    if sqlerrm <> 'code_not_found' then raise; end if;
    raise notice 'ok  unknown code';
  end;
end $$;

-- Become Bob: accept Alice
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-000000000002', false);
do $$
declare fid uuid;
begin
  select id into fid from public.friendships where status = 'pending';
  if fid is null then raise exception 'FAIL: Bob cannot see the request'; end if;
  perform public.respond_friend_request(fid, true);
  if (select status from public.friendships where id = fid) <> 'accepted' then
    raise exception 'FAIL: accept';
  end if;
  raise notice 'ok  Bob accepted Alice';
end $$;

-- Become Chloé: invite Alice (code with a dash), Alice adds back -> auto-accept
select set_config('request.jwt.claim.sub', 'cccccccc-0000-4000-8000-000000000003', false);
do $$ begin
  if (select count(*) from public.friendships) <> 0 then
    raise exception 'FAIL: Chloé sees other people''s friendships';
  end if;
  perform public.send_friend_request('AAAA-AAAA');
  raise notice 'ok  Chloé invited Alice';
end $$;

select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', false);
do $$ declare f public.friendships; begin
  f := public.send_friend_request('CCCCCCCC');
  if f.status <> 'accepted' then raise exception 'FAIL: mutual invite not accepted'; end if;
  raise notice 'ok  mutual invite auto-accepted';
  perform public.remove_friend('cccccccc-0000-4000-8000-000000000003');
  if (select count(*) from public.friendships) <> 1 then raise exception 'FAIL: remove_friend'; end if;
  raise notice 'ok  remove friend';
end $$;

-- 8. Weekly leaderboard
do $$ declare top record; n int; begin
  select * into top from public.leaderboard_since(now() - interval '7 days', 10) limit 1;
  if top.id <> 'aaaaaaaa-0000-4000-8000-000000000001' or top.points <= 0 then
    raise exception 'FAIL: weekly leaderboard %', top;
  end if;
  select count(*) into n from public.leaderboard_since(now() - interval '7 days', 10,
    array['aaaaaaaa-0000-4000-8000-000000000001','bbbbbbbb-0000-4000-8000-000000000002']::uuid[]);
  if n <> 2 then raise exception 'FAIL: leaderboard filter returned %', n; end if;
  raise notice 'ok  weekly leaderboard (% pts for Alice)', top.points;
end $$;

-- 9. Daily cap (Bob logs 10 × 30 km bike rides today)
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-000000000002', false);
do $$
declare t public.trips; i int; total int;
begin
  for i in 1..10 loop
    insert into public.trips (user_id, mode, distance_km, gps_track, started_at, ended_at)
    values (auth.uid(), 'bike', 30,
            ST_GeomFromText('LINESTRING(2.0 48.85, 2.2 48.85, 2.4096 48.85)', 4326),
            now() - interval '90 minutes', now())
    returning * into t;
    perform public.verify_trip(t.id);
  end loop;
  select cumulative_points into total from public.profiles where id = auth.uid();
  if total <> 500 then raise exception 'FAIL: daily cap, got % points', total; end if;
  raise notice 'ok  daily cap enforced (500 pts)';
end $$;

-- 10. Someone else's trip / anonymous access
do $$ declare other uuid; begin
  reset role;
  select id into other from public.trips where user_id = 'aaaaaaaa-0000-4000-8000-000000000001' limit 1;
  set role authenticated;
  begin
    perform public.verify_trip(other);
    raise exception 'FAIL: verified someone else''s trip';
  exception when raise_exception then
    if sqlerrm not like 'Not authorized%' and sqlerrm not like 'Trip % not found' then raise; end if;
    raise notice 'ok  cannot verify others'' trips';
  end;
end $$;

reset role;
set role anon;
do $$ begin
  begin
    perform public.redeem_reward(gen_random_uuid());
    raise exception 'FAIL: anon can redeem';
  exception when insufficient_privilege then raise notice 'ok  anon cannot call RPCs'; end;
  begin
    perform 1 from public.profiles;
    raise exception 'FAIL: anon reads profiles';
  exception when insufficient_privilege then raise notice 'ok  anon cannot read profiles'; end;
end $$;
reset role;

select 'ALL SQL TESTS PASSED' as result;
