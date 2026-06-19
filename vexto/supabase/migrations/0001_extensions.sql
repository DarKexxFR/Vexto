-- Vexto — required extensions.
-- PostGIS powers geo-spatial anti-cheat validation (trip GPS vs transit route).
create extension if not exists postgis;
create extension if not exists "uuid-ossp" with schema extensions;
