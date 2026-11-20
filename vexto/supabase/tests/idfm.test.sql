\set ON_ERROR_STOP 1
-- Seed twice: the upsert must stay idempotent.
\i :seed
\i :seed
do $$ begin
  if (select count(*) from public.transit_operators where idfm_line_id is not null) <> 2 then
    raise exception 'FAIL: seed not idempotent';
  end if;
  if (select GeometryType(route) from public.transit_operators where idfm_line_id = 'IDFM:C01742') <> 'MULTILINESTRING' then
    raise exception 'FAIL: RER A not stored as multilinestring';
  end if;
  raise notice 'ok  IDFM seed idempotent, multi-branch line stored';
  begin
    insert into public.transit_operators (name, route) values ('bad', ST_GeomFromText('POINT(2 48)', 4326));
    raise exception 'FAIL: point accepted as a route';
  exception when check_violation then raise notice 'ok  non-line geometry refused'; end;
end $$;

set role authenticated;
select set_config('request.jwt.claim.sub', 'cccccccc-0000-4000-8000-000000000003', false);
do $$ declare t public.trips; rer uuid; begin
  select id into rer from public.transit_operators where idfm_line_id = 'IDFM:C01742';
  -- Along the south-east branch of RER A (second part of the multilinestring).
  insert into public.trips (user_id, mode, distance_km, gps_track, started_at, ended_at)
  values (auth.uid(), 'publicTransit', 8,
          ST_GeomFromText('LINESTRING(2.371 48.8594, 2.385 48.8507, 2.4 48.8401, 2.42 48.8361, 2.449 48.8302)', 4326),
          now() - interval '12 minutes', now())
  returning * into t;
  t := public.verify_trip(t.id);
  if t.status <> 'verified' or t.transit_operator_id is distinct from rer then
    raise exception 'FAIL: RER A branch trip not verified (% / %)', t.status, t.rejection_reason;
  end if;
  raise notice 'ok  trip on an RER A branch verified and matched (% pts)', t.points_awarded;

  -- Along bus 38 (not imported by default): must be rejected.
  insert into public.trips (user_id, mode, distance_km, gps_track, started_at, ended_at)
  values (auth.uid(), 'publicTransit', 5,
          ST_GeomFromText('LINESTRING(2.3401 48.835, 2.3401 48.85, 2.3399 48.865, 2.34 48.88)', 4326),
          now() - interval '15 minutes', now())
  returning * into t;
  t := public.verify_trip(t.id);
  if t.status <> 'rejected' or t.rejection_reason <> 'off_transit_network' then
    raise exception 'FAIL: road (bus) trip accepted as rail transit';
  end if;
  raise notice 'ok  trip along a bus road refused when buses are not imported';
end $$;
reset role;
select 'ALL IDFM TESTS PASSED' as result;
