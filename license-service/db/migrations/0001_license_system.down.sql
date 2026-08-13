BEGIN;
DROP TABLE IF EXISTS rate_limits, admin_sessions, license_events, licenses, devices, license_codes;
DROP TYPE IF EXISTS license_status, license_code_status, license_plan;
COMMIT;
