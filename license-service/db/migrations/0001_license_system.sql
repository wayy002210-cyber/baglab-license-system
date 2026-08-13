BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE license_plan AS ENUM ('day1','day3','day7','month','year','permanent');
CREATE TYPE license_code_status AS ENUM ('unused','used','disabled','expired');
CREATE TYPE license_status AS ENUM ('active','disabled','expired','unbound');

CREATE TABLE license_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash char(64) NOT NULL UNIQUE,
  code_suffix varchar(4) NOT NULL,
  plan license_plan NOT NULL,
  duration_hours integer,
  status license_code_status NOT NULL DEFAULT 'unused',
  batch_id uuid NOT NULL DEFAULT gen_random_uuid(),
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  used_at timestamptz,
  CHECK ((plan = 'permanent' AND duration_hours IS NULL) OR (plan <> 'permanent' AND duration_hours > 0))
);

CREATE TABLE devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint_hash char(64) NOT NULL UNIQUE,
  short_code varchar(16) NOT NULL,
  installation_id_hash char(64) NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_online_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  client_build_id varchar(64) NOT NULL,
  note text NOT NULL DEFAULT ''
);

CREATE TABLE licenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  license_code_id uuid NOT NULL UNIQUE REFERENCES license_codes(id),
  device_id uuid REFERENCES devices(id),
  plan license_plan NOT NULL,
  activated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz,
  status license_status NOT NULL DEFAULT 'active',
  is_permanent boolean NOT NULL DEFAULT false,
  last_validated_at timestamptz,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((is_permanent AND expires_at IS NULL) OR (NOT is_permanent AND expires_at IS NOT NULL))
);

CREATE TABLE license_events (
  id bigserial PRIMARY KEY,
  license_id uuid REFERENCES licenses(id),
  license_code_id uuid REFERENCES license_codes(id),
  device_id uuid REFERENCES devices(id),
  event_type varchar(32) NOT NULL,
  actor_type varchar(16) NOT NULL,
  actor_id varchar(128),
  request_id uuid,
  ip_hash char(64),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE admin_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash char(64) NOT NULL UNIQUE,
  csrf_hash char(64) NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_seen_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE rate_limits (
  bucket_key char(64) PRIMARY KEY,
  attempts integer NOT NULL,
  window_started_at timestamptz NOT NULL,
  blocked_until timestamptz
);

CREATE INDEX license_codes_status_created_idx ON license_codes(status, created_at DESC);
CREATE INDEX licenses_status_expiry_idx ON licenses(status, expires_at);
CREATE INDEX devices_last_online_idx ON devices(last_online_at DESC);
CREATE INDEX license_events_license_created_idx ON license_events(license_id, created_at DESC);

COMMIT;
