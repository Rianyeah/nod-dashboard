-- Apply after epm.sql on the same branch as the private evidence bucket.
CREATE UNIQUE INDEX IF NOT EXISTS epm_incident_by_point
    ON epm_route_incidents (id, point_id);

CREATE TABLE IF NOT EXISTS epm_evidence_photos (
    id uuid PRIMARY KEY,
    point_id uuid NOT NULL REFERENCES epm_route_points(id),
    incident_id uuid,
    caption varchar(500) NOT NULL DEFAULT '',
    media_type text NOT NULL CHECK (media_type IN ('image/jpeg', 'image/png', 'image/webp')),
    size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 10485760),
    width integer NOT NULL CHECK (width > 0),
    height integer NOT NULL CHECK (height > 0),
    sha256 varchar(64) NOT NULL,
    object_prefix text NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now(),
    archived_at timestamptz,
    FOREIGN KEY (incident_id, point_id) REFERENCES epm_route_incidents(id, point_id)
);
CREATE INDEX IF NOT EXISTS epm_photos_point_created
    ON epm_evidence_photos (point_id, created_at DESC) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS epm_photos_incident_created
    ON epm_evidence_photos (incident_id, created_at DESC) WHERE archived_at IS NULL;
