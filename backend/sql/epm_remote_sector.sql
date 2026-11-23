-- Apply after epm.sql on existing EPM databases.
ALTER TABLE public.epm_route_points
    DROP CONSTRAINT IF EXISTS epm_route_points_type_check,
    ADD CONSTRAINT epm_route_points_type_check
        CHECK (type IN ('site','remote_sector','tipus','sambungan','lainnya'));
