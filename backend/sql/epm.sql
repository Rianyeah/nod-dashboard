-- Apply on the same branch as the private evidence bucket.
BEGIN;
CREATE TABLE IF NOT EXISTS public.epm_routes (
    id uuid PRIMARY KEY,
    name text NOT NULL, start_site text NOT NULL, end_site text NOT NULL,
    area text NOT NULL DEFAULT '', pic text NOT NULL DEFAULT '', asset_ref text NOT NULL DEFAULT '',
    reference_distance text NOT NULL DEFAULT '',
    verification text NOT NULL CHECK (verification IN ('pending','field')),
    source text NOT NULL CHECK (source IN ('road','manual','imported')),
    geometry jsonb NOT NULL, anchors jsonb NOT NULL,
    length_m double precision NOT NULL CHECK (length_m > 0),
    revision bigint NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    archived_at timestamptz
);
CREATE TABLE IF NOT EXISTS public.epm_route_points (
    id uuid PRIMARY KEY, route_id uuid NOT NULL REFERENCES public.epm_routes(id),
    position integer NOT NULL, label text NOT NULL, type text NOT NULL CHECK (type IN ('site','tipus','sambungan','lainnya')),
    lat double precision NOT NULL CHECK(lat BETWEEN -85 AND 85),
    lng double precision NOT NULL CHECK(lng BETWEEN -180 AND 180),
    from_anchor_id uuid NOT NULL, to_anchor_id uuid NOT NULL,
    station_m double precision NOT NULL CHECK(station_m >= 0),
    segment_m double precision NOT NULL CHECK(segment_m >= 0), offset_m double precision NOT NULL CHECK(offset_m >= 0),
    note text NOT NULL DEFAULT '', archived_at timestamptz,
    UNIQUE (route_id,id)
);
CREATE INDEX IF NOT EXISTS epm_points_route_position ON public.epm_route_points(route_id,position);
CREATE TABLE IF NOT EXISTS public.epm_route_incidents (
    id uuid PRIMARY KEY, route_id uuid NOT NULL, point_id uuid NOT NULL,
    status text NOT NULL CHECK (status IN ('open','working','resolved','unknown')),
    ticket text NOT NULL DEFAULT '', started_at timestamptz, recovered_at timestamptz,
    cause text NOT NULL DEFAULT '', action text NOT NULL DEFAULT '',
    revision bigint NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    archived_at timestamptz,
    FOREIGN KEY (route_id,point_id) REFERENCES public.epm_route_points(route_id,id),
    CHECK (recovered_at IS NULL OR status = 'resolved'),
    CHECK (recovered_at IS NULL OR started_at IS NULL OR recovered_at >= started_at)
);
CREATE INDEX IF NOT EXISTS epm_incidents_by_route_time ON public.epm_route_incidents(route_id,started_at DESC);
CREATE INDEX IF NOT EXISTS epm_incidents_by_point ON public.epm_route_incidents(point_id);
COMMIT;
