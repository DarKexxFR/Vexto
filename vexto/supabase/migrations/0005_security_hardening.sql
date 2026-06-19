-- Vexto — security hardening (from Supabase database linter / advisor).

-- Pin search_path on the trigger helper (advisor: function_search_path_mutable).
alter function public.set_updated_at() set search_path = public;

-- handle_new_user is a trigger function only; it must never be callable via RPC.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Anti-cheat helpers should not be exposed to anonymous users.
revoke execute on function public.validate_trip_geo(geometry, uuid, double precision) from anon;
revoke execute on function public.verify_trip(uuid) from anon;

-- NOTE: the linter also reports RLS disabled on `public.spatial_ref_sys` and the
-- PostGIS extension living in `public`. Both are PostGIS-managed objects; enabling
-- RLS on spatial_ref_sys or relocating PostGIS can break spatial functions, so we
-- intentionally leave them as Supabase provisions them.
