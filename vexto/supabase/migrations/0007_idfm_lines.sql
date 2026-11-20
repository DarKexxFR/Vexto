-- Vexto 0007 — official Île-de-France Mobilités line shapes for the transit
-- anti-cheat. Lines such as RER B or RER C have several branches, so routes
-- become (Multi)LineStrings, with the IDFM identifiers and colours alongside.
-- Fill the table with: node scripts/import-idfm-lines.mjs (see README).

alter table public.transit_operators
  alter column route type geometry(Geometry, 4326) using route::geometry(Geometry, 4326);

alter table public.transit_operators drop constraint if exists transit_operators_route_is_line;
alter table public.transit_operators
  add constraint transit_operators_route_is_line
  check (route is null or GeometryType(route) in ('LINESTRING', 'MULTILINESTRING'));

alter table public.transit_operators
  add column if not exists idfm_line_id text,
  add column if not exists line_code    text,
  add column if not exists line_color   text,
  add column if not exists network      text;

alter table public.transit_operators drop constraint if exists transit_operators_idfm_line_id_key;
alter table public.transit_operators
  add constraint transit_operators_idfm_line_id_key unique (idfm_line_id);
